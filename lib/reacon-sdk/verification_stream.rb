# frozen_string_literal: true
# Copyright Reacon contributors. Licensed under Apache-2.0.
require 'net/http'
require 'json'
require 'event_stream_parser'

module Reacon
  class StreamProtocolError < StandardError; end
  class StreamTransportError < StandardError; end
  class StreamCancelledError < StandardError; end
  class StreamTimeoutError < StandardError
    attr_reader :phase
    def initialize(phase)
      @phase = phase
      super("Reacon #{phase} timeout")
    end
  end
  class StreamAPIError < StandardError
    attr_reader :status, :headers, :body, :event
    def initialize(response, body, event = nil)
      @status, @headers, @body, @event = response.code.to_i, response.to_hash, body, event
      super(event ? "Reacon stream failed: #{event.code}" : "Reacon returned HTTP #{@status}")
    end
    def request_id = headers['x-request-id']&.first
  end
  VerificationEvent = Struct.new(:kind, :data, :raw, keyword_init: true)

  # Credentials are per instance. Each active stream owns its Net::HTTP connection.
  class VerificationStreamClient
    def initialize(api_key:, base_url: 'https://api.reacon.io', ca_file: nil)
      raise ArgumentError, 'api_key is required' if api_key.to_s.strip.empty?
      @key, @base_url, @ca_file = api_key, base_url.delete_suffix('/'), ca_file
    end
    # Creating a stream does no I/O. Use #each with a block; #close cancels from another thread.
    def stream_verification(email, only_if_free: nil, cache_max_age: nil, idle_timeout: 30, total_timeout: 300)
      raise ArgumentError, 'Email and positive timeouts are required' if email.to_s.empty? || idle_timeout <= 0 || total_timeout <= 0
      raise ArgumentError, 'Invalid only_if_free' unless [nil, true, false, 'true', 'false'].include?(only_if_free)
      raise ArgumentError, 'Invalid cache_max_age' unless [nil, 'live', '1d', '1w', '1m'].include?(cache_max_age)
      uri = URI("#{@base_url}/v1/verify")
      query = { email: email }; query[:onlyIfFree] = only_if_free unless only_if_free.nil?; query[:cacheMaxAge] = cache_max_age if cache_max_age
      uri.query = URI.encode_www_form(query)
      VerificationStream.new(uri, @key, @ca_file, idle_timeout, total_timeout)
    end
  end

  class VerificationStream
    class Finished < StandardError; end
    private_constant :Finished
    def initialize(uri, key, ca_file, idle_timeout, total_timeout)
      @uri, @key, @ca_file, @idle_timeout, @total_timeout = uri, key, ca_file, idle_timeout, total_timeout
      @mutex, @condition = Mutex.new, ConditionVariable.new
      @reason = nil; @finished = false; @started = false
    end
    def close
      abort_with(StreamCancelledError.new('Verification stream cancelled'))
      nil
    end
    # Block iteration guarantees cleanup after `break` and exceptions. External Enumerator#next
    # is deliberately not offered, because abandoning its suspended Fiber leaks the response.
    def each
      raise ArgumentError, 'A block is required; use stream.each { |event| ... }' unless block_given?
      @mutex.synchronize do
        raise @reason if @reason
        raise ArgumentError, 'Stream has already been consumed' if @started
        @started = true
      end
      http = Net::HTTP.new(@uri.host, @uri.port)
      http.use_ssl = @uri.scheme == 'https'; http.ca_file = @ca_file if @ca_file
      http.max_retries = 0
      http.open_timeout = [@idle_timeout, @total_timeout].min
      http.read_timeout = @idle_timeout
      @mutex.synchronize { @http = http }
      timer = Thread.new do
        @mutex.synchronize { @condition.wait(@mutex, @total_timeout) unless @finished || @reason }
        abort_with(StreamTimeoutError.new('total')) unless @mutex.synchronize { @finished || @reason }
      end
      begin
        raise @reason if @reason
        http.start do
          request = Net::HTTP::Get.new(@uri.request_uri, 'X-API-Key' => @key, 'Accept' => 'text/event-stream')
          http.request(request) do |response|
            unless response.code.to_i.between?(200, 299)
              text = +''.b
              response.read_body { |chunk| text << chunk.byteslice(0, 65_536 - text.bytesize); break if text.bytesize >= 65_536 }
              begin; body = JSON.parse(text); rescue JSON::ParserError; body = text; end
              raise StreamAPIError.new(response, body)
            end
            raise StreamProtocolError, 'Expected a text/event-stream response body' unless response.content_type == 'text/event-stream'
            parser = EventStreamParser::Parser.new
            prefix = +''.b
            ready = false
            begin
              response.read_body do |chunk|
                raise @reason if @reason
                # Keep framing byte-oriented until the complete JSON event is available.
                chunk = chunk.b
                unless ready
                  prefix << chunk
                  next if prefix.bytesize < 3
                  chunk = prefix.delete_prefix("\xEF\xBB\xBF".b); ready = true
                end
                parser.feed(chunk) do |_type, data, _id, _retry|
                  event = decode(data, response)
                  if event.kind == :final
                    finish
                    http.finish if http.started?
                    yield event
                    # Unwind the Net::HTTP response scope before its normal body-drain
                    # step. The terminal event may arrive on an indefinitely open body.
                    raise Finished
                  end
                  yield event
                end
              end
              raise StreamProtocolError, 'Verification stream ended before a terminal event'
            end
          end
        end
      rescue Finished
        nil
      rescue Net::OpenTimeout, Net::ReadTimeout
        raise(@reason || StreamTimeoutError.new('idle'))
      rescue IOError, EOFError, SystemCallError, OpenSSL::SSL::SSLError
        raise(@reason || StreamTransportError.new('Reacon stream transport failure'))
      ensure
        finish
        http.finish if http.started?
        timer.join
      end
      nil
    end

    private

    def finish
      @mutex.synchronize { @finished = true; @condition.broadcast }
    end
    def abort_with(reason)
      http = @mutex.synchronize do
        return if @finished || @reason
        @reason = reason; @condition.broadcast; @http
      end
      http.finish if http&.started?
    rescue IOError, SystemCallError
      # Closing races with normal cleanup; the retained reason wins the read error.
    end
    def decode(data, response)
      raw = JSON.parse(data.dup.force_encoding(Encoding::UTF_8))
      raise StreamProtocolError, 'Expected an SSE JSON object' unless raw.is_a?(Hash)
      # Generated Ruby model conversion is permissive about absent required fields;
      # validate required wire fields before converting, retaining all unknown fields in raw.
      if raw.key?('error')
        require_fields(raw, 'error' => String, 'code' => String, 'updatedAt' => String)
        raise StreamAPIError.new(response, raw, VerificationStreamError.build_from_hash(raw))
      elsif raw.key?('result')
        require_fields(raw, 'result' => Hash, 'updatedAt' => String)
        require_fields(raw['result'], 'status' => String, 'catchAll' => [TrueClass, FalseClass], 'disposable' => [TrueClass, FalseClass])
        VerificationEvent.new(kind: :final, data: VerificationFinal.build_from_hash(raw), raw: raw)
      elsif raw.key?('stage')
        require_fields(raw, 'stage' => String, 'updatedAt' => String)
        VerificationEvent.new(kind: :stage, data: VerificationStage.build_from_hash(raw), raw: raw)
      elsif raw.key?('state')
        require_fields(raw, 'state' => String, 'updatedAt' => String)
        VerificationEvent.new(kind: :progress, data: VerificationProgress.build_from_hash(raw), raw: raw)
      else
        VerificationEvent.new(kind: :unknown, raw: raw)
      end
    rescue JSON::ParserError, ArgumentError, TypeError
      raise StreamProtocolError, 'Malformed verification event'
    end
    def require_fields(raw, fields)
      fields.each do |name, types|
        raise StreamProtocolError, "Invalid verification field: #{name}" unless Array(types).any? { |type| raw[name].is_a?(type) }
      end
    end
  end
end
