require 'rubygems/package'
require 'json'

raise 'Expected gem file and reserved native version' unless ARGV.length == 2
package = Gem::Package.new(ARGV[0])
package.verify
spec = package.spec
raise 'Unexpected gem identity' unless spec.name == 'reacon-sdk' && spec.version.to_s == ARGV[1] && spec.platform.to_s == 'ruby'
raise 'Unexpected gem license' unless spec.licenses == ['Apache-2.0']
raise 'Unexpected gem homepage' unless spec.homepage == 'https://github.com/reacon-io/reacon-ruby'
raise 'Native gem extensions need separate qualification' unless spec.extensions.empty?
raise 'Unexpected package push host' unless [nil, 'https://rubygems.org'].include?(spec.metadata['allowed_push_host'])
spec.validate(false)
puts JSON.generate({formatVersion: 1, kind: 'sdk-gem-upload-metadata', name: spec.name, version: spec.version.to_s,
                    platform: spec.platform.to_s, licenses: spec.licenses, archiveFiles: spec.files.length,
                    requiredRuby: spec.required_ruby_version.to_s, rubyVersion: RUBY_VERSION, rubygemsVersion: Gem::VERSION,
                    internalChecksumsVerified: true, rebuilt: false, executedPackageCode: false, publishable: false})
