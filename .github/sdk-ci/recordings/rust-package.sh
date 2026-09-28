#!/bin/sh
set -eu
# Populate dependencies on a clean runner before the offline package checks.
cargo fetch
# Package first; the consumer sees only the unpacked crate, never /work/src.
package_build=$(mktemp -d /results/cargo-package.XXXXXX)
CARGO_TARGET_DIR="$package_build" cargo package --allow-dirty --no-verify --offline
: "${REACON_SDK_PACKAGE_VERSION:?Missing SDK version}"
archive="$package_build/package/reacon-sdk-$REACON_SDK_PACKAGE_VERSION.crate"
cp "$archive" /results/artifacts/
archive="/results/artifacts/reacon-sdk-$REACON_SDK_PACKAGE_VERSION.crate"
digest=$(sha256sum "$archive" | cut -d ' ' -f 1)
package_root=/cache/recording-crate/$digest
mkdir -p "$package_root"
tar -xzf "$archive" -C "$package_root"
test -f "$package_root/reacon-sdk-$REACON_SDK_PACKAGE_VERSION/LICENSE"
sed -i "s|/cache/recording-crate/reacon-sdk-$REACON_SDK_PACKAGE_VERSION|$package_root/reacon-sdk-$REACON_SDK_PACKAGE_VERSION|" /results/consumer/Cargo.toml
printf '{"sha256":"%s","directory":"%s/reacon-sdk-%s"}\n' "$digest" "$package_root" "$REACON_SDK_PACKAGE_VERSION" > /results/package.json
host=$(rustc -vV | sed -n 's/^host: //p')
cargo fetch --manifest-path /results/consumer/Cargo.toml
cargo metadata --offline --filter-platform "$host" --manifest-path /results/consumer/Cargo.toml --format-version 1 > /results/cargo-metadata.json
cargo run --offline --manifest-path /results/consumer/Cargo.toml
