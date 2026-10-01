require [File.join(__dir__, '../fixed-origin/http.rb'), File.join(__dir__, 'fixed-origin/http.rb'), '/fixed-origin/http.rb', '/sdk/conformance/fixed-origin/http.rb'].find { |path| File.exist?(path) }
require 'reacon-sdk'
require 'net/http'

def check(value, message)
  raise message unless value
end
url = ENV.fetch('REACON_TEST_URL')
ENV['http_proxy'] = fixture_proxy(url).to_s
ENV['HTTP_PROXY'] = nil
ENV['no_proxy'] = ''
ENV['NO_PROXY'] = ''
client = Reacon::VerificationStreamClient.new(api_key: 'synthetic-ruby', ca_file: fixture_ca)
isolated = Reacon::VerificationStreamClient.new(api_key: 'isolated-ruby', ca_file: fixture_ca)
client.stream_verification('never@example.test')
collect = lambda do |scenario, owner = client, **settings|
  events = []
  owner.stream_verification("#{scenario}@example.test", only_if_free: true, **settings).each { |event| events << event }
  events
end
threads = [[client, 'success'], [isolated, 'isolated']].map do |owner, scenario|
  Thread.new do
    events = collect.call(scenario, owner)
    check(events.map(&:kind) == [:stage, :unknown, :progress, :final], 'event classification')
    check(events.first.raw['label'] == 'hé🚀', 'split UTF-8')
    check(events.last.data.result.accepts_all.nil? && events.last.data.result.status == 'future-status', 'typed final')
  end
end
threads.each(&:value)
begin
  collect.call('error'); raise 'Missing terminal error'
rescue Reacon::StreamAPIError => error
  check(error.status == 200 && error.event.code == 'INSUFFICIENT_CREDITS' && error.event.remaining_credits == 0 && error.request_id == 'req-stream', 'terminal error metadata')
end
{ 'pre402' => 402, 'pre429' => 429, 'proxy' => 502, 'redirect' => 307 }.each do |scenario, status|
  begin
    collect.call(scenario); raise 'Missing HTTP error'
  rescue Reacon::StreamAPIError => error
    check(error.status == status, 'HTTP status')
    check(error.body['code'] == 'FIXTURE_ERROR' && error.request_id == 'req-stream', 'HTTP metadata') if [402, 429].include?(status)
    check(error.body.is_a?(String) && error.request_id.nil?, 'proxy error') if status == 502
  end
end
%w[wrongtype malformed invalidresult eof].each do |scenario|
  begin; collect.call(scenario); raise "Missing protocol error: #{scenario}"; rescue Reacon::StreamProtocolError; end
end
begin; collect.call('disconnect'); raise 'Missing transport error'; rescue Reacon::StreamTransportError; end
%w[idle total headers].each do |phase|
  begin
    collect.call(phase, idle_timeout: 0.08, total_timeout: 0.2); raise 'Missing timeout'
  rescue Reacon::StreamTimeoutError => error
    check(error.phase == phase, 'timeout phase') unless phase == 'headers'
  end
end
stream = client.stream_verification('cancel@example.test', only_if_free: true)
ready = Queue.new
reader = Thread.new do
  begin
    stream.each { |event| check(event.kind == :stage, 'cancel first event'); ready << true }
    raise 'Missing cancellation'
  rescue Reacon::StreamCancelledError
    true
  end
end
ready.pop; sleep 0.02; stream.close; check(reader.value, 'pending read cancelled')
client.stream_verification('early@example.test', only_if_free: true).each { |event| check(event.kind == :stage, 'early stage'); break }
check(Net::HTTP.get_response(URI("#{url}/_assert_closed")).code.to_i == 200, 'closure while clients remain alive')
puts 'Ruby streaming protocol, cancellation and live closure assertions passed'
