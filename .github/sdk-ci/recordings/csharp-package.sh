#!/bin/sh
set -eu
: "${REACON_SDK_PACKAGE_VERSION:?Missing SDK version}"
if [ -n "${REACON_REUSE_ARTIFACTS:-}" ]; then
  cp "$REACON_REUSE_ARTIFACTS/"* /results/artifacts/
else
  dotnet pack src/Reacon.Sdk/Reacon.Sdk.csproj -c Release --nologo -v minimal -o /results/artifacts
fi
# Only the disposable unpublished SDK version is replaced; dependency caches remain.
rm -rf "/cache/nuget/reacon.sdk/$REACON_SDK_PACKAGE_VERSION" /results/consumer
mkdir -p /results/consumer
cp /suite/csharp/* /results/consumer/
sed -i 's|/cache/recording-packages|/results/artifacts|' /results/consumer/NuGet.Config
dotnet restore /results/consumer/Consumer.csproj --configfile /results/consumer/NuGet.Config --force --no-cache --nologo
dotnet run --project /results/consumer/Consumer.csproj -c Release --no-restore --nologo
