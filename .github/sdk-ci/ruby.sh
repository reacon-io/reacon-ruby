set -eu
sh /suite/ruby-package.sh
REACON_TEST_URL="$REACON_STREAM_TEST_URL" ruby /sdk/conformance/stream-ruby.rb
