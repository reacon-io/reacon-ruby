import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const version = process.env.REACON_SDK_PACKAGE_VERSION;
assert.match(version, /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/);
const directory = '/results/npm-consumer', archive = `/artifacts/reacon-io-sdk-${version}.tgz`;
await mkdir(directory);
await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true }));
execFileSync('npm', ['install','--ignore-scripts','--no-audit','--no-fund','--cache','/cache/npm',archive], { cwd: directory, stdio: 'inherit' });
const installed = join(directory, 'node_modules/@reacon-io/sdk');
assert.equal(await realpath(installed), installed);
assert.equal(JSON.parse(await readFile(join(installed, 'package.json'))).version, version);
for (const esm of [false,true]) {
  const mode = esm ? 'typescript-esm' : 'typescript', loader = join(directory, esm ? 'run.mjs' : 'run.cjs');
  await writeFile(loader, esm
    ? "import * as sdk from '@reacon-io/sdk'; globalThis.REACON_STREAM_SDK=sdk; await import('file:///sdk/conformance/stream-typescript.cjs');"
    : "globalThis.REACON_STREAM_SDK=require('@reacon-io/sdk'); require('/sdk/conformance/stream-typescript.cjs');");
  execFileSync('node', [loader], { cwd: directory, stdio: 'inherit', env: { ...process.env,
    SDK_DIRECTORY: installed, REACON_STREAM_MODE: mode, REACON_TEST_URL: `${process.env.REACON_STREAM_BASE_URL}/${mode}` } });
}
await writeFile('/results/streaming-runtime.json', JSON.stringify({ packageVersion: version,
  archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'),
  imports: ['CommonJS','ESM'], installedFromRetainedArchive: true }));
