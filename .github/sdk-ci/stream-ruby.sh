set -eu
test ! -e /work
ruby /ci/stream-ruby-package.rb
ruby /sdk/conformance/stream-ruby.rb
