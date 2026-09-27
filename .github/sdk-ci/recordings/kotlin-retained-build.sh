#!/bin/sh
set -eu
: "${REACON_SDK_PACKAGE_VERSION:?Missing SDK version}"
repository="/cache/recording-maven/io/reacon/reacon-kotlin/$REACON_SDK_PACKAGE_VERSION"
mkdir -p "$repository" /compiled/recording/src/main/kotlin /compiled/stream/src/main/kotlin
cp /artifacts/* "$repository/"
cp /suite/kotlin/src/main/kotlin/RecordingConsumer.kt /compiled/recording/src/main/kotlin/
cp /stream-suite/src/main/kotlin/Consumer.kt /compiled/stream/src/main/kotlin/
for consumer in recording stream; do
  cp /suite/kotlin-retained.gradle "/compiled/$consumer/build.gradle"
  cp /suite/kotlin/settings.gradle "/compiled/$consumer/settings.gradle"
done
REACON_CONSUMER_MAIN=RecordingConsumerKt gradle -p /compiled/recording --no-daemon --console=plain installDist
REACON_CONSUMER_MAIN=ConsumerKt gradle -p /compiled/stream --no-daemon --console=plain installDist
