import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRecordingServer } from './replay-server.mjs';
import { startStreamServer, streamScenarios } from './stream-server.mjs';
import { prepareJavaConsumer } from './recordings/java-consumer.mjs';
import { prepareRustConsumer } from './recordings/rust-consumer.mjs';
import { writeCiPackageManifest, readCiPackageArtifacts } from './package-artifacts.mjs';
import { installedStreamRuntimeEvidence } from './streaming-package-evidence.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const suite = dirname(fileURLToPath(import.meta.url));
const manifestBytes = await readFile(resolve(suite, 'manifest.json'));
const manifest = JSON.parse(manifestBytes), family = manifest.family;
const families = ['typescript', 'python', 'ruby', 'rust', 'java', 'kotlin', 'csharp'];
if (manifest.streamingIsolation !== 'retained-packages-without-source' || manifest.formatVersion !== 1 || !families.includes(family) || !/^[a-z0-9./-]+@sha256:[a-f0-9]{64}$/.test(manifest.image)) throw new Error('Invalid SDK CI manifest');
for (const [path, digest] of Object.entries(manifest.files)) {
  if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') ||
      hash(await readFile(resolve(suite, path))) !== digest) throw new Error('CI bundle changed');
}
const source = resolve(process.env.REACON_SDK_SOURCE ?? '.');
const output = resolve(process.env.REACON_CI_OUTPUT ?? 'sdk-ci-results');
await mkdir(output, { recursive: true });
const work = resolve(output, 'work'), cache = resolve(output, 'cache');
await mkdir(work); await mkdir(cache); await mkdir(resolve(output, 'artifacts'));
// Copy source, never repository controls, credentials or prior build outputs.
const omitted = new Set(['.git', '.github', 'node_modules', 'vendor', 'target', 'build', 'dist', '.gradle', 'bin', 'obj', '__pycache__', '.venv', 'sdk-ci-results']);
const sourceFiles = {};
async function copyTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name), name = relative(source, path);
    if (path === output || omitted.has(entry.name)) continue;
    if (entry.isDirectory()) await copyTree(path);
    else if (entry.isFile()) {
      const bytes = await readFile(path); sourceFiles[name] = hash(bytes);
      await mkdir(dirname(resolve(work, name)), { recursive: true });
      await writeFile(resolve(work, name), bytes);
    } else throw new Error('Unsupported source file type');
  }
}
await copyTree(source);
const cases = JSON.parse(await readFile(resolve(suite, 'cases.json')));
const modes = family === 'typescript' ? ['typescript', 'typescript-esm'] : family === 'python' ? ['python', 'python-sync'] : [family];
const recordings = await startRecordingServer(cases), streams = await startStreamServer();
try {
  if (family === 'java') await prepareJavaConsumer(work, cases, output, manifest.packageVersion);
  if (family === 'rust') await prepareRustConsumer(work, cases, output, manifest.packageVersion);
  const env = {
    SDK_DIRECTORY: '/work', REACON_SDK_PACKAGE_VERSION: manifest.packageVersion,
    REACON_CASES_FILE: '/ci/cases.json', REACON_RECORDINGS_URL: recordings.url,
    REACON_TEST_URL: `${recordings.url}/${family}`, REACON_STREAM_TEST_URL: `${streams.url}/${family}`,
    REACON_RESULTS_FILE: `/results/${family}.json`, CI: 'true', HOME: '/cache',
    GEM_HOME: '/cache/recording-gems', GEM_PATH: '/cache/recording-gems',
    MAVEN_CONFIG: '/cache/maven', MAVEN_OPTS: '-Duser.home=/cache', GRADLE_USER_HOME: '/cache/gradle',
    CARGO_HOME: '/cache/cargo', CARGO_TARGET_DIR: '/cache/target',
    DOTNET_CLI_HOME: '/cache/dotnet', NUGET_PACKAGES: '/cache/nuget', DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  };
  const args = ['run', '--rm', '--network', 'host', '--user', `${process.getuid()}:${process.getgid()}`,
    '-v', `${suite}:/ci:ro`, '-v', `${suite}/recordings:/suite:ro`, '-v', `${suite}/streams:/sdk/conformance:ro`,
    '-v', `${work}:/work`, '-v', `${cache}:/cache`, '-v', `${output}:/results`, '-w', '/work',
    ...Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]), manifest.image, 'sh', `/ci/${family}.sh`];
  const log = createWriteStream(resolve(output, 'run.log'));
  const runContainer = async args => await new Promise((done, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.once('error', reject); child.once('close', code => done(code ?? 1));
  });
  const buildExitCode = await runContainer(args);
  let streamExitCode = null, streamRuntime = null, streamPackageFiles = null, streamFailure = null;
  const streamModes = family === 'typescript' ? ['typescript','typescript-esm'] : [family];
  if (buildExitCode === 0) {
    try {
      const before = await readCiPackageArtifacts(output, manifest);
      const streamOutput = resolve(output, 'streaming'); await mkdir(streamOutput);
      if (family === 'java') await cp(resolve(output, 'classpath'), resolve(streamOutput, 'classpath'));
      const streamEnv = {...env, SDK_DIRECTORY: '', REACON_TEST_URL: `${streams.url}/${family}`, REACON_STREAM_BASE_URL: streams.url};
      // No /work or parent output mount: the SDK checkout is unavailable.
      const streamArgs = ['run','--rm','--network','host','--user',`${process.getuid()}:${process.getgid()}`,
        '-v',`${suite}:/ci:ro`,'-v',`${suite}/recordings:/suite:ro`,'-v',`${suite}/streams:/sdk/conformance:ro`,
        '-v',`${resolve(output,'artifacts')}:/artifacts:ro`,'-v',`${cache}:/cache`,
        '-v',`${streamOutput}:/results`,'-w','/results',
        ...Object.entries(streamEnv).flatMap(([name,value])=>['-e',`${name}=${value}`]),manifest.image,'sh',`/ci/stream-${family}.sh`];
      streamExitCode = await runContainer(streamArgs);
      if (streamExitCode !== 0) throw new Error(`Installed streaming consumer failed (${streamExitCode})`);
      const after = await readCiPackageArtifacts(output, manifest);
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Retained packages changed during streaming');
      const proof = family === 'rust' ? {cargoMetadata:JSON.parse(await readFile(resolve(streamOutput,'cargo-metadata.json')))}
        : {proof:JSON.parse(await readFile(resolve(streamOutput,'streaming-runtime.json')))};
      streamRuntime = installedStreamRuntimeEvidence({family,packageVersion:manifest.packageVersion,files:after,...proof});
      streamPackageFiles = after;
    } catch(error) {streamFailure=error.message;}
  }
  await new Promise(done => log.end(done));
  const exitCode = buildExitCode || streamExitCode || (streamFailure ? 1 : 0);
  const results = [], failures = [];
  if (streamFailure) failures.push(streamFailure);
  if (streamExitCode !== 0) failures.push('Installed streaming container did not pass');
  for (const mode of modes) {
    let items = [];
    try { recordings.assertComplete(mode); } catch (error) { failures.push(error.message); }
    try { items = JSON.parse(await readFile(resolve(output, `${mode}.json`))); } catch { failures.push(`Missing ${mode} results`); }
    const passed = items.length === cases.length && cases.every(item => items.some(result => result.id === item.id && result.passed));
    if (!passed) failures.push(`${mode} response assertions failed`);
    results.push({ mode, passed, scenarios: cases.length, results: items, requests: recordings.observations.get(mode) });
  }
  for (const mode of streamModes) {
    try { await streams.assertComplete(mode); } catch (error) { failures.push(`${mode}: ${error.message}`); }
  }
  let passed = exitCode === 0 && failures.length === 0;
  const sourceSha256 = hash(JSON.stringify(Object.fromEntries(Object.entries(sourceFiles).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))));
  let packageArtifacts;
  if (passed) {
    try { packageArtifacts = await writeCiPackageManifest(output, { ...manifest, passed,
      sourceRevision: process.env.REACON_SOURCE_REVISION ?? null, sourceSha256, suiteManifestSha256: hash(manifestBytes) }); }
    catch (error) { passed = false; failures.push(`Package retention failed: ${error.message}`); }
  }
  const report = { formatVersion: 1, kind: 'sdk-repository-source-ci', family, passed, exitCode, failures,
    sourceRevision: process.env.REACON_SOURCE_REVISION ?? null,
    sourceSha256, ...(packageArtifacts ? { packageArtifacts } : {}),
    image: manifest.image, packageVersion: manifest.packageVersion, contractSha256: manifest.contractSha256,
    recordedResponses: results, streaming: { evidence: 'synthetic-http-streaming-subset', scenarios: streamScenarios, requests: streams.observations.get(family),
      isolation: 'retained-packages-without-source', exitCode: streamExitCode, files: streamPackageFiles, runtime: streamRuntime,
      modes: streamModes.map(mode=>({mode,requests:streams.observations.get(mode)})) },
    suiteManifestSha256: hash(manifestBytes), publicRegistryInstallPassed: false, liveApiPassed: false, publishable: false };
  await writeFile(resolve(output, 'responses.json'), JSON.stringify(results, null, 2) + '\n');
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${family}: ${modes.length} response mode(s), ${cases.length} cases each; ${streamScenarios.length} streaming scenarios; ${passed ? 'PASS' : 'FAIL'}`);
  if (!passed) process.exitCode = 1;
} finally { await recordings.close(); await streams.close(); }
