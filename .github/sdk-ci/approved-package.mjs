import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { validateArtifactNames } from './package-artifacts.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => /^[a-f0-9]{64}$/.test(value ?? '');
const identityKeys = ['family', 'packageVersion', 'sourceSha256', 'contractSha256', 'suiteManifestSha256'];
const LIMIT = 512 * 1024 * 1024;

export function validateTransfer(transfer, expected) {
  if (transfer?.formatVersion !== 1 || transfer.kind !== 'sdk-approved-package-transfer' ||
      identityKeys.some(key => transfer[key] !== expected[key]) ||
      !['sourceSha256', 'contractSha256', 'suiteManifestSha256'].every(key => digest(transfer[key])) ||
      !transfer.files || typeof transfer.files !== 'object' || Array.isArray(transfer.files))
    throw Error('Approved package transfer identity differs from source and suite');
  validateArtifactNames(transfer.family, transfer.packageVersion, Object.keys(transfer.files));
  let total = 0;
  const files = {};
  for (const [name, file] of Object.entries(transfer.files)) {
    if (!digest(file?.sha256) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 256 * 1024 * 1024 ||
        (total += file.size) > LIMIT || typeof file.base64 !== 'string' ||
        file.base64.length !== Math.ceil(file.size / 3) * 4) throw Error('Invalid approved package file');
    const bytes = Buffer.from(file.base64, 'base64');
    if (bytes.toString('base64') !== file.base64 || bytes.length !== file.size || hash(bytes) !== file.sha256)
      throw Error('Approved package file bytes differ');
    files[name] = bytes;
  }
  return files;
}

export async function unpackTransfer({bytes, sha256, expected, directory}) {
  if (!digest(sha256) || bytes.length > LIMIT || hash(bytes) !== sha256) throw Error('Approved transfer checksum differs');
  const transfer = JSON.parse(bytes), files = validateTransfer(transfer, expected);
  await mkdir(directory, {mode: 0o700});
  await mkdir(join(directory, 'artifacts'), {mode: 0o700});
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(directory, 'artifacts', name), bytes, {flag:'wx',mode:0o400});
  const manifest = {formatVersion:1, kind:'sdk-approved-package-input', ...Object.fromEntries(identityKeys.map(key=>[key,transfer[key]])),
    transferSha256:sha256, files:Object.fromEntries(Object.entries(transfer.files).map(([name,file])=>[name,{sha256:file.sha256,size:file.size}]))};
  if (transfer.privateVerification !== undefined) {
    const proof=Buffer.from(JSON.stringify(transfer.privateVerification)+'\n');
    if(proof.length>48*1024**2)throw Error('Approved private verification exceeds limit');
    manifest.privateVerificationSha256=hash(proof);
    await writeFile(join(directory,'private-verification.json'),proof,{flag:'wx',mode:0o400});
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)+'\n', {flag:'wx',mode:0o400});
  return manifest;
}

async function bounded(response) {
  if (response.status !== 200) throw Error('Approved package asset unavailable');
  const chunks=[]; let length=0;
  for await (const chunk of response.body) {
    if ((length+=chunk.length)>LIMIT) throw Error('Approved package asset too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function downloadApprovedPackage({locator, token, repository, fetchImpl=fetch}) {
  if (!/^reacon-io\/reacon-(typescript|python|rust|ruby|java|kotlin|csharp)$/.test(repository ?? '') ||
      locator?.repository !== repository || locator.formatVersion !== 1 || locator.kind !== 'sdk-approved-package-locator' ||
      !Number.isSafeInteger(locator.assetId) || locator.assetId < 1 || !digest(locator.sha256) || !token)
    throw Error('Invalid company package asset locator');
  let response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/assets/${locator.assetId}`, {
    redirect:'manual', signal:AbortSignal.timeout(120000),
    headers:{Authorization:`Bearer ${token}`,Accept:'application/octet-stream','X-GitHub-Api-Version':'2026-03-10'}});
  if (response.status === 302) {
    const url = new URL(response.headers.get('location'));
    if (url.protocol !== 'https:' || url.hostname !== 'release-assets.githubusercontent.com' || url.username || url.password || url.port)
      throw Error('Unexpected GitHub asset download destination');
    // Signed asset URL, never forward GitHub credentials to another origin.
    response = await fetchImpl(url, {redirect:'error',signal:AbortSignal.timeout(120000)});
  }
  const bytes = await bounded(response);
  if (hash(bytes) !== locator.sha256) throw Error('Downloaded package transfer differs');
  return bytes;
}

async function main() {
  const suiteDirectory=dirname(fileURLToPath(import.meta.url));
  const locatorPath=join(suiteDirectory,'approved-package.json');
  try {await stat(locatorPath);} catch(error) {if(error.code==='ENOENT')return;throw error;}
  const locator=JSON.parse(await readFile(locatorPath));
  const suiteBytes=await readFile(join(suiteDirectory,'manifest.json')), suite=JSON.parse(suiteBytes);
  const bytes=await downloadApprovedPackage({locator,token:process.env.GITHUB_TOKEN,repository:process.env.GITHUB_REPOSITORY});
  const expected={family:suite.family,packageVersion:suite.packageVersion,contractSha256:suite.contractSha256,
    suiteManifestSha256:hash(suiteBytes),sourceSha256:locator.sourceSha256};
  const directory=resolve(process.env.RUNNER_TEMP || tmpdir(), 'reacon-approved-sdk-input');
  await unpackTransfer({bytes,sha256:locator.sha256,expected,directory});
  // Fixed path, not caller-controlled workflow syntax.
  await writeFile(process.env.GITHUB_OUTPUT,`directory=${directory}\n`,{flag:'a'});
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
