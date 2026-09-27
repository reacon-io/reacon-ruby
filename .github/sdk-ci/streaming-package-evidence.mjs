import { validateArtifactNames } from './package-artifacts.mjs';
/** Runtime evidence from a separately launched container that never receives
 * the SDK checkout. The producing workflow and mount configuration must be
 * authenticated by the release verifier, not inferred from this JSON alone. */
export function installedStreamRuntimeEvidence({family,packageVersion,files,proof,cargoMetadata}) {
  if (!files || !Object.keys(files).length) throw new Error('Retained stream package files required');
  validateArtifactNames(family, packageVersion, Object.keys(files));
  if (Object.values(files).some(file => !/^[a-f0-9]{64}$/.test(file?.sha256))) throw new Error('Checksummed stream artifacts required');
  if (family === 'rust') {
    const sdk = cargoMetadata?.packages?.filter(pkg => pkg.name === 'reacon-sdk');
    const root = cargoMetadata?.resolve?.nodes?.find(node => node.id === cargoMetadata.resolve.root);
    if (sdk?.length !== 1 || sdk[0].version !== packageVersion ||
        sdk[0].manifest_path !== `/cache/stream-crate/reacon-sdk-${packageVersion}/Cargo.toml` ||
        !root?.deps?.some(dep => dep.name === 'reacon_sdk' && dep.pkg === sdk[0].id))
      throw new Error('Streaming Cargo dependency is not the retained crate');
    return {packageVersion, installedFromRetainedCrate:true, archiveSha256:files[`reacon-sdk-${packageVersion}.crate`]?.sha256};
  }
  if (!proof || typeof proof !== 'object') throw new Error('Installed streaming runtime proof missing');
  if (family === 'typescript') {
    if (proof.packageVersion !== packageVersion || proof.installedFromRetainedArchive !== true ||
        proof.archiveSha256 !== files[`reacon-io-sdk-${packageVersion}.tgz`]?.sha256 ||
        JSON.stringify(proof.imports) !== '["CommonJS","ESM"]') throw new Error('Streaming npm installation differs from retained archive');
  } else if (family === 'python' || family === 'ruby') {
    const name = family === 'python' ? `reacon_sdk-${packageVersion}-py3-none-any.whl` : `reacon-sdk-${packageVersion}.gem`;
    const flag = family === 'python' ? 'installedMatchesRetainedWheel' : 'installedMatchesRetainedGem';
    if (proof.packageVersion !== packageVersion || proof[flag] !== true || proof.archiveSha256 !== files[name]?.sha256 ||
        !Number.isSafeInteger(proof.installedFilesCompared) || proof.installedFilesCompared <= 0)
      throw new Error('Installed streaming package files differ from retained archive');
  } else if (family === 'java' || family === 'kotlin') {
    if (proof.installedJarMatchesRetained !== true || proof.specificationVersion !== '21')
      throw new Error('Streaming JVM did not load the retained JAR on the required runtime');
  } else if (family === 'csharp') {
    if (proof.assemblyMatchedRetainedPackage !== true || proof.targetFramework !== 'net10.0' ||
        !/^[a-f0-9]{64}$/.test(proof.loadedAssemblySha256)) throw new Error('Streaming assembly did not match retained NuGet package');
  } else throw new Error('Unknown packaged streaming family');
  return proof;
}
