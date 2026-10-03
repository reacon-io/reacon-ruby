import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { installedStreamRuntimeEvidence } from './streaming-package-evidence.mjs';
import { validateArtifactNames } from './package-artifacts.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');

/** Report consistency checks. The caller must independently authenticate the
 * successful protected-main run, exact workflow/code and archive digest. */
export function validateCiPackageEvidence(input) {
  return validatePackageEvidence(input, false);
}

// Local isolated preparation has no GitHub source stamp. Its caller binds the
// exact generated file map and trusted import receipt instead. Keep this entry
// point separate so public CI can never accept an unstamped report by accident.
export function validatePrivateCiPackageEvidence(input) {
  if (input.sourceRevision !== null) throw Error('Private package evidence must retain its original unstamped identity');
  return validatePackageEvidence(input, true);
}

function validatePackageEvidence({report,manifest,manifestBytes,suite,suiteBytes,sourceRevision,family,files}, privatePreparation) {
  const modes=family==='typescript'?['typescript','typescript-esm']:family==='python'?['python','python-sync']:[family];
  if(!['typescript','python','rust','ruby','java','kotlin','csharp'].includes(family) ||
      !(privatePreparation ? sourceRevision === null : /^[a-f0-9]{40}$/.test(sourceRevision)) ||
      report.formatVersion!==1 || report.kind!=='sdk-repository-source-ci' || report.family!==family || report.passed!==true || report.exitCode!==0 ||
      !Array.isArray(report.failures) || report.failures.length || report.sourceRevision!==sourceRevision ||
      report.suiteManifestSha256!==hash(suiteBytes) || report.suiteManifestSha256!==manifest.suiteManifestSha256 ||
      suite.family!==family || manifest.family!==family || report.contractSha256!==suite.contractSha256 ||
      report.image!==suite.image || report.packageVersion!==suite.packageVersion ||
      manifest.formatVersion!==1 || manifest.kind!=='sdk-ci-package-artifacts' || manifest.sourceRevision!==sourceRevision ||
      manifest.canonicalVersion!==suite.canonicalVersion || manifest.packageVersion!==suite.packageVersion ||
      manifest.image!==suite.image || manifest.contractSha256!==suite.contractSha256 ||
      !/^[a-f0-9]{64}$/.test(report.sourceSha256) || report.sourceSha256!==manifest.sourceSha256 ||
      manifest.publishable!==false || manifest.versionsReserved!==false || report.publishable!==false ||
      report.publicRegistryInstallPassed!==false || report.liveApiPassed!==false ||
      report.packageArtifacts?.manifestSha256!==hash(manifestBytes) ||
      !isDeepStrictEqual(report.packageArtifacts.files,manifest.files) || !isDeepStrictEqual(files,manifest.files))
    throw new Error('CI package evidence does not bind the expected build and tested artifacts');
  validateArtifactNames(family,suite.packageVersion,Object.keys(files));
  for(const file of Object.values(files))if(!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size<=0 || file.size>256*1024*1024)
    throw new Error('Invalid CI package artifact identity');
  if(!Number.isSafeInteger(suite.recordedScenarios) || suite.recordedScenarios<=0 ||
      !Array.isArray(report.recordedResponses) || report.recordedResponses.length!==modes.length ||
      modes.some(mode=>{
        const runs=report.recordedResponses.filter(value=>value.mode===mode), result=runs[0];
        return runs.length!==1 || result.passed!==true || result.scenarios!==suite.recordedScenarios ||
          !Array.isArray(result.results) || result.results.length!==suite.recordedScenarios ||
          new Set(result.results.map(item=>item.id)).size!==suite.recordedScenarios || result.results.some(item=>item.passed!==true);
      }) || report.streaming?.evidence!=='synthetic-http-streaming-subset' ||
      !Array.isArray(report.streaming.scenarios) || report.streaming.scenarios.length!==17)
    throw new Error('CI package consumer or streaming evidence is incomplete');
  if (suite.streamingIsolation !== undefined) {
    const modes = family === 'typescript' ? ['typescript','typescript-esm'] : [family];
    if (suite.streamingIsolation !== 'retained-packages-without-source' || report.streaming.isolation !== suite.streamingIsolation ||
        report.streaming.exitCode !== 0 || !isDeepStrictEqual(report.streaming.scenarios,suite.streamingScenarios) || !isDeepStrictEqual(report.streaming.files,files) ||
        !Array.isArray(report.streaming.modes) || report.streaming.modes.length !== modes.length ||
        report.streaming.modes.some((item,index) => item.mode !== modes[index] ||
          !isDeepStrictEqual(Object.keys(item.requests ?? {}).sort(), [...suite.streamingScenarios].sort()) || Object.values(item.requests).some(r=>r.requests!==1 || r.closed!==true)))
      throw new Error('Installed streaming evidence does not bind the retained package and all modes');
    // Rust's complete Cargo graph is validated by the authenticated runner;
    // the artifact report keeps only its checked identity and archive digest.
    if (family === 'rust') {
      if (report.streaming.runtime?.packageVersion !== suite.packageVersion ||
          report.streaming.runtime.installedFromRetainedCrate !== true ||
          report.streaming.runtime.archiveSha256 !== files[`reacon-sdk-${suite.packageVersion}.crate`]?.sha256)
        throw new Error('Streaming evidence does not bind the retained crate');
    } else installedStreamRuntimeEvidence({family,packageVersion:suite.packageVersion,files,proof:report.streaming.runtime});
  }
  for (const [name, filename, minimum] of [['httpPolicy', 'http-typescript.test.mjs', 22], ['pagination', 'pagination-typescript.test.mjs', 15]]) if (suite[name] !== undefined) {
    const policy = suite[name], actual = report[name];
    if (family !== 'typescript' || policy.isolation !== 'retained-packages-without-source' ||
        !isDeepStrictEqual(policy.modes, ['cjs','esm']) || !Number.isSafeInteger(policy.minimumTests) || policy.minimumTests < minimum ||
        !/^[a-f0-9]{64}$/.test(policy.testSha256 ?? '') || policy.testSha256 !== suite.files?.[filename] ||
        actual?.isolation !== policy.isolation || actual.packageVersion !== suite.packageVersion || actual.testSha256 !== policy.testSha256 ||
        actual.archiveSha256 !== files[`reacon-io-sdk-${suite.packageVersion}.tgz`]?.sha256 ||
        actual.modes?.length !== 2 || actual.modes.some((item, index) => item.mode !== policy.modes[index] ||
          !Number.isSafeInteger(item.tests) || item.tests < policy.minimumTests || item.passed !== item.tests || item.failed !== 0 || item.skipped !== 0 || item.cancelled !== 0))
      throw new Error(`CI ${name === 'httpPolicy' ? 'HTTP policy' : name} evidence is incomplete or does not bind the retained npm package`);
  }
  if (suite.pythonHttpPolicy !== undefined) {
    const policy = suite.pythonHttpPolicy, actual = report.pythonHttpPolicy;
    if (family !== 'python' || policy.isolation !== 'retained-packages-without-source' ||
        !isDeepStrictEqual(policy.modes, ['async','sync']) || !Number.isSafeInteger(policy.minimumTests) || policy.minimumTests < 39 ||
        !/^[a-f0-9]{64}$/.test(policy.testSha256 ?? '') || policy.testSha256 !== suite.files?.['http-python.py'] ||
        actual?.isolation !== policy.isolation || actual.packageVersion !== suite.packageVersion || actual.testSha256 !== policy.testSha256 ||
        actual.archiveSha256 !== files[`reacon_sdk-${suite.packageVersion}-py3-none-any.whl`]?.sha256 ||
        actual.modes?.length !== 2 || actual.modes.some((item,index) => item.mode !== policy.modes[index] ||
          !Number.isSafeInteger(item.tests) || item.tests < policy.minimumTests || item.passed !== true ||
          item.failures !== 0 || item.errors !== 0 || item.skipped !== 0 || item.dependencies?.['reacon-sdk'] !== suite.packageVersion))
      throw Error('Python HTTP evidence does not bind the retained wheel and both modes');
  }
  return true;
}
