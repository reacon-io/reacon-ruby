gem 'reacon-sdk', ENV.fetch('REACON_SDK_PACKAGE_VERSION')
require 'reacon-sdk'
require 'json'
require 'uri'
require 'date'
installed=Gem.loaded_specs.fetch('reacon-sdk')
raise 'Wrong SDK version' unless installed.version.to_s==ENV.fetch('REACON_SDK_PACKAGE_VERSION')
raise 'SDK was not installed as a gem' unless installed.full_gem_path.start_with?('/cache/recording-gems/gems/')
raise 'Wrong SDK license' unless installed.licenses.include?('Apache-2.0') && File.read(File.join(installed.full_gem_path,'LICENSE')).include?('Apache License')
def snake(value); value.gsub(/([a-z0-9])([A-Z])/, '\1_\2').downcase; end
def wire(value)
  case value
  when DateTime then value.new_offset(0).iso8601(3).sub('+00:00','Z')
  when Time then value.utc.iso8601(3)
  when Date then value.iso8601
  when Array then value.map { |v| wire(v) }
  when Hash then value.to_h { |k,v| [k.to_s,wire(v)] }
  else value.respond_to?(:to_hash) ? wire(value.to_hash) : value
  end
end
patch=Reacon::UpdateLeadRequest.build_from_hash({'person_first_name'=>nil})
raise 'Patch omitted/null distinction lost' unless wire(patch)=={'person_first_name'=>nil}
raise 'Nullable array lost' unless wire(Reacon::UpdateLeadRequestCompany.build_from_hash({'addresses'=>nil}))=={'addresses'=>nil}
raise 'Nullable field lost' unless wire(Reacon::MailGetTrackingDomainResponse200.build_from_hash({'domain'=>nil}))=={'domain'=>nil}
missing_rejected=false
begin
  Reacon::MailGetTrackingDomainResponse200.build_from_hash({})
rescue ArgumentError
  missing_rejected=true
end
raise 'Missing required nullable field must be rejected' unless missing_rejected
cases=JSON.parse(File.read(ENV.fetch('REACON_CASES_FILE')))
results=[]
cases.each do |item|
  begin
    uri=URI(ENV.fetch('REACON_TEST_URL')+'/'+item['id'])
    config=Reacon::Configuration.new
    config.scheme=uri.scheme; config.host="#{uri.host}:#{uri.port}"; config.base_path=uri.path;config.server_index=nil
    config.api_key['X-API-Key']='recording-ruby' unless item['record']['request']['authentication']=='none'
    api=Reacon.const_get(item['apiClass']).new(Reacon::ApiClient.new(config))
    params=item['parameters'].to_h { |k,v| [snake(k).to_sym,v] }
    if item['record']['request'].key?('body')
      params[snake(item['requestModel']).to_sym]=Reacon.const_get(item['requestModel']).build_from_hash(item['record']['request']['body'])
    end
    csv=item['record']['operationId']=='exportLeads' && item['record']['request'].dig('body','format')=='csv'
    if csv
      rejected=false
      begin
        api.export_leads(params[:team_id],params[:export_leads_request])
      rescue ArgumentError=>error
        rejected=error.message.include?('export_leads_csv')
      end
      raise 'JSON export must reject CSV before sending' unless rejected
    end
    method=api.method(csv ? 'export_leads_csv' : snake(item['record']['operationId']))
    args=method.parameters.filter { |kind,_| kind==:req }.map { |_,name| params.delete(name) { raise "Missing #{name}" } }
    args<<params
    begin
      value=method.call(*args)
    rescue Reacon::ApiError=>error
      raise "Unexpected status #{error.code}" unless error.code==item['record']['response']['status'] && error.code>=400
      raise 'Error body differs' unless JSON.parse(error.response_body)==item['record']['response']['body']
      results<<{id:item['id'],passed:true};next
    end
    raise 'Expected HTTP error' unless item['record']['response']['status']<400
    actual=wire(value)
    raise "Decoded response differs: #{actual.inspect}" unless actual==item['record']['response']['body']
    results<<{id:item['id'],passed:true}
  rescue=>error
    results<<{id:item['id'],passed:false,error:"#{error.class}: #{error.message}"}
  end
end
File.write(ENV.fetch('REACON_RESULTS_FILE'),JSON.pretty_generate(results))
puts "#{results.count { |r| r[:passed] }}/#{results.size} recorded responses passed through Ruby methods"
exit(results.all? { |r| r[:passed] } ? 0 : 1)
