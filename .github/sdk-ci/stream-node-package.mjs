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
const httpModes = [];
const paginationModes = [];
for (const esm of [false,true]) {
  const httpMode = esm ? 'esm' : 'cjs';
  const resolution = esm ? "console.log(new URL(import.meta.resolve('@reacon-io/sdk')).pathname)" : "console.log(require.resolve('@reacon-io/sdk'))";
  const modulePath = execFileSync('node', [...(esm ? ['--input-type=module'] : []), '-e', resolution], { cwd: directory, encoding: 'utf8' }).trim();
  assert.ok(modulePath.startsWith(installed + '/'));
  const tap = execFileSync('node', ['--test', '--test-reporter=tap', '/ci/http-typescript.test.mjs'], {
    cwd: directory, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, REACON_HTTP_SDK_MODULE: modulePath, REACON_HTTP_MODULE_MODE: httpMode },
  });
  await writeFile(`/results/http-${httpMode}.tap`, tap);
  const count = name => Number(tap.match(new RegExp('^# ' + name + ' (\\d+)$', 'm'))?.[1]);
  const result = { mode: httpMode, tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'), cancelled: count('cancelled') };
  assert.ok(result.tests >= 45 && result.passed === result.tests && result.failed === 0 && result.skipped === 0 && result.cancelled === 0);
  httpModes.push(result);
  const paginationTap = execFileSync('node', ['--test', '--test-reporter=tap', '/ci/pagination-typescript.test.mjs'], {
    cwd: directory, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, REACON_HTTP_SDK_MODULE: modulePath, REACON_HTTP_MODULE_MODE: httpMode },
  });
  await writeFile(`/results/pagination-${httpMode}.tap`, paginationTap);
  const paginationCount = name => Number(paginationTap.match(new RegExp('^# ' + name + ' (\\d+)$', 'm'))?.[1]);
  const paginationResult = { mode: httpMode, tests: paginationCount('tests'), passed: paginationCount('pass'), failed: paginationCount('fail'), skipped: paginationCount('skipped'), cancelled: paginationCount('cancelled') };
  assert.ok(paginationResult.tests >= 16 && paginationResult.passed === paginationResult.tests && paginationResult.failed === 0 && paginationResult.skipped === 0 && paginationResult.cancelled === 0);
  paginationModes.push(paginationResult);
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

await writeFile('/results/http-policy.json', JSON.stringify({
  isolation: 'retained-packages-without-source', packageVersion: version,
  archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'),
  testSha256: createHash('sha256').update(await readFile('/ci/http-typescript.test.mjs')).digest('hex'),
  modes: httpModes,
}));
await writeFile('/results/pagination.json', JSON.stringify({
  isolation: 'retained-packages-without-source', packageVersion: version,
  archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'),
  testSha256: createHash('sha256').update(await readFile('/ci/pagination-typescript.test.mjs')).digest('hex'),
  modes: paginationModes,
}));
