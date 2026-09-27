#!/bin/sh
set -eu
gradle --no-daemon --console=plain -I /suite/kotlin/publish.init.gradle publishMavenPublicationToRecordingRepository
for suffix in .jar -sources.jar -javadoc.jar .pom .module; do
  cp "/cache/recording-maven/io/reacon/reacon-kotlin/$REACON_SDK_PACKAGE_VERSION/reacon-kotlin-$REACON_SDK_PACKAGE_VERSION$suffix" /results/artifacts/
done
mkdir -p /results/consumer
cp -r /suite/kotlin/. /results/consumer/
gradle -p /results/consumer --no-daemon --console=plain --refresh-dependencies run
