# frozen_string_literal: true
# Copyright Reacon contributors. Licensed under Apache-2.0.
require 'timeout'
require 'date'
require 'time'

module Reacon
  class RequestTimeoutError < StandardError
    attr_reader :timeout
    def initialize(timeout)
      @timeout = timeout
      super("Reacon request exceeded its #{timeout} second network deadline")
    end
  end
  class TransportError < StandardError; end
  class ResponseDecodeError < StandardError
    attr_reader :response
    def initialize(response)
      @response = response
      super('Reacon response does not match its declared format')
    end
    def status = response.status
    def headers = response.headers
    def body = response.body
    def request_id = headers['x-request-id']
  end

  module HttpPolicy
    # A separate exception prevents Faraday from mistaking the total deadline
    # for one of its own phase timeouts. It is translated at the SDK boundary.
    class DeadlineExceeded < Exception; end
    private_constant :DeadlineExceeded

    def self.seconds(value)
      unless value.is_a?(Numeric) && value.real? && value.finite? && value.positive?
        raise ArgumentError, 'request_timeout must be a finite positive number of seconds'
      end
      value.to_f
    end

    def self.request(seconds)
      Timeout.timeout(seconds, DeadlineExceeded) { yield }
    rescue DeadlineExceeded, Faraday::TimeoutError => cause
      raise RequestTimeoutError.new(seconds), cause: cause
    rescue Faraday::Error => cause
      raise TransportError.new('Reacon network request failed'), cause: cause
    end

    def self.parse_error(body)
      JSON.parse(body)
    rescue JSON::ParserError, TypeError
      body
    end

    # Generated scalar conversion otherwise turns malformed numbers into 0,
    # or arbitrary JSON strings into booleans. Validate before coercion.
    def self.check_value(type, value)
      return if value.nil?
      valid = case type.to_s
              when 'Integer' then value.is_a?(Integer)
              when 'Float' then value.is_a?(Numeric)
              when 'Boolean' then value == true || value == false
              when 'Object' then true
              when 'String', 'Date', 'Time' then value.is_a?(String) || value.is_a?(Symbol)
              when /\AArray</ then value.is_a?(Array)
              when /\AHash</ then value.is_a?(Hash)
              else
                model = Reacon.const_get(type.to_s, false)
                !model.respond_to?(:attribute_map) || value.is_a?(Hash)
              end
      raise TypeError, "Expected #{type} in JSON response" unless valid
      case type.to_s
      when /\AArray<(.+)>\z/
        inner = Regexp.last_match(1)
        value.each { |item| check_value(inner, item) }
      when /\AHash<String, (.+)>\z/
        inner = Regexp.last_match(1)
        value.each_value { |item| check_value(inner, item) }
      else
        if defined?(model) && model&.respond_to?(:attribute_map)
          model.attribute_map.each do |field, wire|
            key = value.key?(wire) ? wire : wire.to_s
            check_value(model.openapi_types.fetch(field), value[key]) if value.key?(key)
          end
        end
      end
    end
  end

  module HttpApiError
    attr_reader :response
    def initialize(arg = nil)
      super
      @response = arg[:response] if arg.is_a?(Hash)
    end
    def status = code # Preserve the generated ApiError#code HTTP-status API.
    def headers = response_headers
    def body = response_body
    def request_id = response_headers&.[]('x-request-id')
    def parsed_body = HttpPolicy.parse_error(response_body)
    def error_code
      parsed = parsed_body
      return unless parsed.is_a?(Hash)
      value = parsed['code'] || (parsed['error'].is_a?(Hash) && parsed['error']['code'])
      value if value.is_a?(String)
    end
  end

  module HttpModelValues
    def _deserialize(type, value)
      HttpPolicy.check_value(type, value)
      super
    end
  end

  module HttpClientPolicy
    # JSON's default Time encoder emits a human-readable, non-RFC3339 string.
    # Traverse nested generated models/maps so every date uses its wire format.
    def object_to_hash(value)
      case value
      when Time then value.getutc.iso8601(9).sub(/\.0+Z$/, 'Z').sub(/(\.\d*?[1-9])0+Z$/, '\\1Z')
      when DateTime then value.new_offset(0).iso8601(9).sub('+00:00', 'Z').sub(/\.0+Z$/, 'Z').sub(/(\.\d*?[1-9])0+Z$/, '\\1Z')
      when Date then value.iso8601
      when Array then value.map { |item| object_to_hash(item) }
      when Hash then value.transform_values { |item| object_to_hash(item) }
      else value.respond_to?(:to_hash) ? object_to_hash(value.to_hash) : value
      end
    end

    def call_api(http_method, path, opts = {})
      seconds = HttpPolicy.seconds(opts.fetch(:request_timeout, config.timeout))
      stream = nil
      response = HttpPolicy.request(seconds) do
        connection(opts).public_send(http_method.to_sym.downcase) do |req|
          request = build_request(http_method, path, req, opts)
          request.options.timeout = seconds
          stream = download_file(request) if %w[File Binary].include?(opts[:return_type])
        end
      end
      unless response.success?
        raise ApiError.new(code: response.status, message: "Reacon returned HTTP #{response.status}",
                           response: response, response_headers: response.headers, response_body: response.body)
      end
      data = if %w[File Binary].include?(opts[:return_type])
               deserialize_file(response, stream)
             elsif opts[:return_type]
               deserialize(response, opts[:return_type])
             end
      [data, response.status, response.headers]
    end

    def deserialize(response, return_type)
      # No-content methods never call deserialize. An empty 200 for a declared
      # JSON model is a protocol error, not an empty model or a successful nil.
      if return_type != 'String' && (response.body.nil? || response.body.empty? || response.body.strip == 'null')
        raise TypeError, 'Expected a JSON response body'
      end
      super
    rescue StandardError => cause
      raise ResponseDecodeError.new(response), cause: cause
    end

    def convert_to_type(data, type)
      HttpPolicy.check_value(type, data)
      super
    end
  end

  ApiClient.prepend(HttpClientPolicy)
  ApiError.prepend(HttpApiError)
  ApiModelBase.singleton_class.prepend(HttpModelValues)
end
