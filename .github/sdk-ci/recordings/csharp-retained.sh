#!/bin/sh
set -eu
: "${REACON_SDK_PACKAGE_VERSION:?Missing SDK version}"
: "${REACON_DOTNET_TFM:?Missing target framework}"
case "$REACON_DOTNET_TFM" in net8.0|net10.0) ;; *) exit 2 ;; esac
mkdir /results/consumer
cp /suite/csharp/* /results/consumer/
sed -i 's|/cache/recording-packages|/results/artifacts|' /results/consumer/NuGet.Config
dotnet --info > /results/dotnet-info.txt
dotnet restore /results/consumer/Consumer.csproj --configfile /results/consumer/NuGet.Config --force --no-cache --nologo
dotnet run --project /results/consumer/Consumer.csproj -c Release --no-restore --nologo
mkdir /results/stream-consumer
cp /suite/csharp/Consumer.csproj /results/stream-consumer/
cp /results/consumer/NuGet.Config /results/stream-consumer/
cp /stream-suite/Program.cs /results/stream-consumer/
dotnet restore /results/stream-consumer/Consumer.csproj --configfile /results/stream-consumer/NuGet.Config --force --no-cache --nologo
REACON_TEST_URL="$REACON_STREAM_TEST_URL" REACON_RETAINED_NUPKG="/results/artifacts/Reacon.Sdk.$REACON_SDK_PACKAGE_VERSION.nupkg" \
  dotnet run --project /results/stream-consumer/Consumer.csproj -c Release --no-restore --nologo
