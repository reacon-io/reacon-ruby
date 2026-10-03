import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {sha256,CACHE_TTL_MS} from './verification-cache.mjs';
import {validatePrivateCiPackageEvidence} from './ci-package-evidence.mjs';

const MAX_REPORT=16*1024**2;
const omitted=new Set(['.git','.github','node_modules','vendor','target','build','dist','.gradle','bin','obj','__pycache__','.venv','sdk-ci-results']);
export async function sourceDigest(root) {
  const files={};
  async function walk(directory) {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      if(omitted.has(entry.name))continue;
      const path=join(directory,entry.name);
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile())files[relative(root,path)]=sha256(await readFile(path));
      else throw Error('Unsupported approved source file');
    }
  }
  await walk(root);
  return sha256(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0))));
}
export function encodePrivateVerification({reportBytes,manifestBytes}) {
  const encode=bytes=>{
    if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_REPORT)throw Error('Invalid private verification size');
    return {sha256:sha256(bytes),base64:bytes.toString('base64')};
  };
  return {formatVersion:1,kind:'sdk-approved-private-verification',report:encode(reportBytes),manifest:encode(manifestBytes)};
}
// Matches the release recorder's JSON representation while keeping the binary
// encoder strict. Staging and later verification use this same boundary.
export function privateVerificationForReport({report,manifestBytes}) {
  return encodePrivateVerification({reportBytes:Buffer.from(JSON.stringify(report,null,2)+'\n'),manifestBytes});
}
function decode(file) {
  if(typeof file?.base64!=='string'||file.base64.length>Math.ceil(MAX_REPORT/3)*4||!/^[a-f0-9]{64}$/.test(file.sha256??''))throw Error('Invalid private verification encoding');
  const bytes=Buffer.from(file.base64,'base64');
  if(!bytes.length||bytes.length>MAX_REPORT||bytes.toString('base64')!==file.base64||sha256(bytes)!==file.sha256)throw Error('Private verification bytes changed');
  return bytes;
}

// This validates consistency, not authority. The caller must authenticate the
// controller-approved transfer hash and exact package/source/suite identities.
// The container and fixture runtime define this portable deterministic proof;
// it makes no claim that the host kernel, hardware or Docker daemon are equal.
export function validatePrivateVerification(proof,{suiteBytes,expected,now=Date.now(),
  runtime={kind:'pinned-container-conformance',platform:process.platform,arch:process.arch,fixtureNode:process.version},checkAge=true}) {
  if(proof?.formatVersion!==1||proof.kind!=='sdk-approved-private-verification')throw Error('Invalid approved private verification');
  const reportBytes=decode(proof.report),manifestBytes=decode(proof.manifest);
  const report=JSON.parse(reportBytes),manifest=JSON.parse(manifestBytes),suite=JSON.parse(suiteBytes);
  if(suite.formatVersion!==1||suite.streamingIsolation!=='retained-packages-without-source'||
    !/^[a-z0-9./-]+@sha256:[a-f0-9]{64}$/.test(suite.image??''))throw Error('Pinned container and isolated consumers required');
  validatePrivateCiPackageEvidence({report,manifest,manifestBytes,suite,suiteBytes,sourceRevision:null,family:expected.family,files:expected.files});
  const start=Date.parse(report.verificationStartedAt),end=Date.parse(report.verificationCompletedAt);
  if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>now||
    checkAge&&now-start>CACHE_TTL_MS||!isDeepStrictEqual(report.verificationRuntime,runtime)||
    runtime.platform!=='linux'||runtime.arch!=='x64'||!/^v24\.[0-9]+\.[0-9]+$/.test(runtime.fixtureNode)||
    report.sourceSha256!==expected.sourceSha256||report.packageVersion!==expected.packageVersion||
    report.contractSha256!==expected.contractSha256||report.suiteManifestSha256!==expected.suiteManifestSha256||
    report.sdkRebuilt!==true||report.privateVerificationReuse||report.verificationReuse)
    throw Error('Private verification is expired or differs from source, fixtures or runtime');
  return {report,manifest,testedAt:report.verificationStartedAt,originalEvidenceSha256:proof.report.sha256};
}

export function rebindPrivateVerification(proof,{suiteBytes,expected,revision,transferSha256,now=Date.now(),runtime}) {
  if(!/^[a-f0-9]{40}$/.test(revision??'')||!/^[a-f0-9]{64}$/.test(transferSha256??''))throw Error('Authenticated target identity required');
  const validated=validatePrivateVerification(proof,{suiteBytes,expected,now,runtime});
  const report=structuredClone(validated.report),manifest=structuredClone(validated.manifest);
  manifest.sourceRevision=revision;
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  report.sourceRevision=revision;
  report.sdkRebuilt=false;
  report.prebuiltPackageTransferSha256=transferSha256;
  report.packageArtifacts.manifestSha256=sha256(manifestBytes);
  report.privateVerificationReuse={kind:'approved-private-container',originalEvidenceSha256:validated.originalEvidenceSha256,
    originalPackageManifestSha256:proof.manifest.sha256,testedAt:validated.testedAt,
    completedAt:report.verificationCompletedAt,transferSha256};
  return {report,manifestBytes,testedAt:validated.testedAt};
}

export async function reuseApprovedPrivateVerification({directory,output,suiteBytes,sourceSha256,revision,now=Date.now()}) {
  const expected=JSON.parse(await readFile(join(directory,'manifest.json')));
  if(expected.kind!=='sdk-approved-package-input'||expected.formatVersion!==1||expected.sourceSha256!==sourceSha256)throw Error('Approved source differs');
  const bytes=await readFile(join(directory,'private-verification.json'));
  if(sha256(bytes)!==expected.privateVerificationSha256)throw Error('Approved private verification changed');
  const rebound=rebindPrivateVerification(JSON.parse(bytes),{suiteBytes,expected,revision,transferSha256:expected.transferSha256,now});
  const files={};
  for(const [name,file] of Object.entries(expected.files)) {
    if(!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name))throw Error('Invalid approved package filename');
    const b=await readFile(join(directory,'artifacts',name));
    if(b.length!==file.size||sha256(b)!==file.sha256)throw Error('Approved package bytes changed');
    files[name]=b;
  }
  await mkdir(output);
  await mkdir(join(output,'artifacts'));
  for(const [name,b] of Object.entries(files))await writeFile(join(output,'artifacts',name),b,{flag:'wx'});
  for(const [name,b] of Object.entries({'evidence.json':JSON.stringify(rebound.report,null,2)+'\n',
    'responses.json':JSON.stringify(rebound.report.recordedResponses,null,2)+'\n','package-manifest.json':rebound.manifestBytes,
    'run.log':`Approved private container verification reused; original tests ${rebound.testedAt}. No native tests ran in this job.\n`}))
    await writeFile(join(output,name),b,{flag:'wx'});
  return rebound;
}
