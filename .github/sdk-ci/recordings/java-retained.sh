#!/bin/sh
set -eu
: "${REACON_SDK_PACKAGE_VERSION:?Missing SDK version}"
: "${REACON_EXPECTED_JAVA_MAJOR:?Missing JDK version}"
java -version > /results/java-info.txt 2>&1
mvn -B -q -Dmaven.repo.local=/cache/m2 org.apache.maven.plugins:maven-install-plugin:3.1.4:install-file \
  -Dfile="/results/artifacts/reacon-java-$REACON_SDK_PACKAGE_VERSION.jar" \
  -DpomFile="/results/artifacts/reacon-java-$REACON_SDK_PACKAGE_VERSION.pom"
mvn -B -q -f /results/consumer-pom.xml -Dmaven.repo.local=/cache/m2 \
  org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath -Dmdep.outputFile=/results/classpath
mkdir /results/consumer-classes /results/stream-classes
classpath=$(cat /results/classpath)
javac -source 8 -target 8 -cp "$classpath" -d /results/consumer-classes /suite/JavaRecordingConsumer.java
java -cp "/results/consumer-classes:$classpath" JavaRecordingConsumer
javac -source 8 -target 8 -cp "$classpath" -d /results/stream-classes /stream-suite/Consumer.java
REACON_TEST_URL="$REACON_STREAM_TEST_URL" REACON_RETAINED_JAR="/results/artifacts/reacon-java-$REACON_SDK_PACKAGE_VERSION.jar" \
  java -cp "/results/stream-classes:$classpath" Consumer
