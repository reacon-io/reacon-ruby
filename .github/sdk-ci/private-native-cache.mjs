import { mkdir, lstat, realpath, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

// Only the private rootless job opts in. Its host holds private-sdk.lock for
// the entire sandbox lifetime, and there is one task per family. Public CI keeps
// its fresh cache. Cached files are compiler inputs, never passing test evidence.
export async function privateNativeCache({ family, image, output, environment = process.env,
  cacheRoot = '/cache/native-sdk', maximumBytes = (family === 'rust' ? 4 : 2) * 1024 ** 3 }) {
  const fallback = join(output, 'cache');
  if (environment.REACON_PRIVATE_NATIVE_CACHE !== '1' || !['rust','kotlin'].includes(family)) {
    await mkdir(fallback); return { directory: fallback, retained: false };
  }
  if (!/^[a-z0-9./-]+@sha256:[a-f0-9]{64}$/.test(image) || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw Error('Pinned private compiler cache identity required');
  if (environment.DOCKER_HOST !== 'unix:///run/docker.sock')
    throw Error('Retained native caches require the private rootless runtime');
  const key = createHash('sha256').update(JSON.stringify({formatVersion:1,family,image})).digest('hex');
  const directory = join(cacheRoot, family, key);
  for (const path of [cacheRoot,join(cacheRoot,family),directory]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    if (await realpath(path) !== resolve(path) || !(await lstat(path)).isDirectory())
      throw Error('Private compiler cache must be a canonical directory');
  }
  // Recreate the SDK archives/local Maven repository for every source version.
  // Retain only dependency downloads and compiler caches between jobs.
  for (const name of ['recording-crate','recording-maven']) await rm(join(directory,name), {recursive:true,force:true});
  let bytes = 0;
  async function size(path) {
    for (const entry of await readdir(path, {withFileTypes:true})) {
      const child = join(path,entry.name);
      if (entry.isDirectory()) await size(child);
      else if (entry.isFile()) bytes += (await lstat(child)).size;
      // Package-manager symlinks are never followed into another directory.
    }
  }
  await size(directory);
  const pruned = bytes > maximumBytes;
  if (pruned) {
    await rm(directory, {recursive:true}); await mkdir(directory, {mode:0o700});
  }
  return {directory,retained:true,key,previousBytes:bytes,pruned,maximumRetainedBytes:maximumBytes,
    testsReused:false,sourceReused:false};
}
