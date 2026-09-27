import { open, readdir, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const MAX_BYTES = 256 * 1024 * 1024;

// Shared with the release artifact store, so CI and publication require the
// same complete native package set (including Python's sdist and Maven docs).
export function validateArtifactNames(family, packageVersion, names) {
  if (!Array.isArray(names) || new Set(names).size !== names.length || names.some(name => !/^[A-Za-z0-9_.-]+$/.test(name))) throw new Error('Invalid package artifact filenames');
  const v = packageVersion;
  const maven = name => [`.jar`, `-sources.jar`, `-javadoc.jar`, `.pom`].map(suffix => `${name}-${v}${suffix}`);
  const expected = {
    typescript: [`reacon-io-sdk-${v}.tgz`],
    go: [`.zip`, `.mod`, `.info`].map(suffix => `v${v}${suffix}`),
    rust: [`reacon-sdk-${v}.crate`], php: [`reacon-sdk-${v}.zip`], ruby: [`reacon-sdk-${v}.gem`],
    java: maven('reacon-java'), kotlin: [...maven('reacon-kotlin'), `reacon-kotlin-${v}.module`],
    csharp: [`Reacon.Sdk.${v}.nupkg`],
    python: [`reacon_sdk-${v}-py3-none-any.whl`, `reacon_sdk-${v}.tar.gz`],
  }[family];
  if (!expected || JSON.stringify([...names].sort()) !== JSON.stringify(expected.sort())) throw new Error(`Missing or unexpected ${family} package artifacts`);
}

/** Retain the bytes actually consumed by this CI run. Authentication of the
 * producing run and final version reservation are separate release gates. */
export async function writeCiPackageManifest(output, context) {
  const families = ['typescript', 'python', 'rust', 'ruby', 'java', 'kotlin', 'csharp'];
  if (!families.includes(context.family) || context.passed !== true ||
      !/^[0-9]+\.[0-9]+\.[0-9]+(?:-(?:alpha|beta|rc)\.[1-9][0-9]*)?$/.test(context.canonicalVersion ?? '') ||
      !/^[0-9A-Za-z.-]+$/.test(context.packageVersion ?? '') ||
      !/^[a-z0-9./-]+@sha256:[a-f0-9]{64}$/.test(context.image ?? '') ||
      (context.sourceRevision !== null && !/^[a-f0-9]{40}$/.test(context.sourceRevision ?? '')) ||
      ['sourceSha256', 'contractSha256', 'suiteManifestSha256'].some(key => !/^[a-f0-9]{64}$/.test(context[key] ?? '')))
    throw new Error('Passing package CI with complete source and toolchain bindings is required');
  const directory = resolve(output, 'artifacts');
  if (await realpath(directory) !== directory) throw new Error('Package artifact directory cannot use symlinks');
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some(entry => !entry.isFile())) throw new Error('Package artifact directory must contain only regular files');
  validateArtifactNames(context.family, context.packageVersion, entries.map(entry => entry.name));
  const files = {}; let total = 0;
  for (const name of entries.map(entry => entry.name).sort()) {
    const file = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES || (total += stat.size) > 512 * 1024 * 1024)
        throw new Error('Package artifact size is invalid');
      const bytes = await file.readFile();
      if (bytes.length !== stat.size) throw new Error('Package artifact changed while reading');
      files[name] = { sha256: hash(bytes), size: bytes.length };
    } finally { await file.close(); }
  }
  const manifest = { formatVersion: 1, kind: 'sdk-ci-package-artifacts', family: context.family,
    canonicalVersion: context.canonicalVersion, packageVersion: context.packageVersion,
    sourceRevision: context.sourceRevision, sourceSha256: context.sourceSha256,
    contractSha256: context.contractSha256, suiteManifestSha256: context.suiteManifestSha256,
    image: context.image, files, versionsReserved: false, publishable: false };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(resolve(output, 'package-manifest.json'), bytes, { flag: 'wx' });
  return { manifestSha256: hash(bytes), files };
}
