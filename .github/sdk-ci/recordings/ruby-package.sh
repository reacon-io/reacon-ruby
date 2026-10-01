#!/bin/sh
set -eu
if [ -n "${REACON_REUSE_ARTIFACTS:-}" ]; then
  cp "$REACON_REUSE_ARTIFACTS/"* /results/artifacts/
else
  gem build reacon-sdk.gemspec --output "/results/artifacts/reacon-sdk-$REACON_SDK_PACKAGE_VERSION.gem"
fi
gem install --no-document --install-dir /cache/recording-gems "/results/artifacts/reacon-sdk-$REACON_SDK_PACKAGE_VERSION.gem"
ruby /suite/ruby.rb
