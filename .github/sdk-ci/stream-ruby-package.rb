require 'reacon-sdk'
require 'rubygems/package'
require 'digest'
require 'json'
require 'tmpdir'
version = ENV.fetch('REACON_SDK_PACKAGE_VERSION')
spec = Gem.loaded_specs.fetch('reacon-sdk')
raise 'Incorrect installed gem version' unless spec.version.to_s == version
archive = "/artifacts/reacon-sdk-#{version}.gem"
files = 0
Dir.mktmpdir('reacon-stream-gem-') do |dir|
  Gem::Package.new(archive).extract_files(dir)
  Dir.glob("#{dir}/**/*").each do |path|
    next unless File.file?(path)
    relative = path.delete_prefix(dir + '/')
    raise 'Installed gem differs from retained artifact' unless File.binread(path) == File.binread(File.join(spec.full_gem_path, relative))
    files += 1
  end
end
raise 'Empty installed gem' unless files > 0
File.write('/results/streaming-runtime.json', JSON.generate({packageVersion: version,
  installedFilesCompared: files, installedMatchesRetainedGem: true, archiveSha256: Digest::SHA256.file(archive).hexdigest}))
