#!/bin/sh
set -eu
java -version > /results/java-info.txt 2>&1
java -cp '/compiled/recording/build/install/reacon-recording-consumer/lib/*' RecordingConsumerKt
REACON_TEST_URL="$REACON_STREAM_TEST_URL" REACON_RETAINED_JAR="/results/artifacts/reacon-kotlin-$REACON_SDK_PACKAGE_VERSION.jar" \
  java -cp '/compiled/stream/build/install/reacon-recording-consumer/lib/*' ConsumerKt
