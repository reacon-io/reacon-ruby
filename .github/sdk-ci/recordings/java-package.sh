#!/bin/sh
set -eu
mvn -B -q -Dmaven.repo.local=/cache/m2 -DskipTests install
for suffix in .jar -sources.jar -javadoc.jar .pom; do
  cp "/cache/m2/io/reacon/reacon-java/$REACON_SDK_PACKAGE_VERSION/reacon-java-$REACON_SDK_PACKAGE_VERSION$suffix" /results/artifacts/
done
mvn -B -q -f /results/consumer-pom.xml -Dmaven.repo.local=/cache/m2 dependency:build-classpath -Dmdep.outputFile=/results/classpath
mkdir -p /results/consumer-classes
classpath=$(cat /results/classpath)
javac -cp "$classpath" -d /results/consumer-classes /suite/JavaRecordingConsumer.java
java -cp "/results/consumer-classes:$classpath" JavaRecordingConsumer
