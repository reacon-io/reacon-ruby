#!/bin/sh
set -eu
gem build reacon-sdk.gemspec --output "/results/artifacts/reacon-sdk-$REACON_SDK_PACKAGE_VERSION.gem"
gem install --no-document --install-dir /cache/recording-gems "/results/artifacts/reacon-sdk-$REACON_SDK_PACKAGE_VERSION.gem"
ruby /suite/ruby.rb
