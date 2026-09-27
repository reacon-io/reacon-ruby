import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getIDToken, setSecret } from '@actions/core';
import { githubPublisherIdentity } from './github-publisher-identity.mjs';

const configuration = JSON.parse(await readFile(new URL('./configuration.json', import.meta.url)));
const identity = await githubPublisherIdentity({ configuration, environment: process.env, tokenProvider: () => getIDToken() });
let registryExchange;
if (configuration.registryQualification) {
  const { qualifyRegistryOidc } = await import('./registry-oidc.mjs');
  registryExchange = await qualifyRegistryOidc({ family: configuration.family, environment: process.env,
    nugetUsername: configuration.registryQualification.nugetUsername, tokenProvider: getIDToken, maskCredential: setSecret });
}
const workflow = await readFile('.github/workflows/publish.yml');
const report = { ...identity, workflowSha256: createHash('sha256').update(workflow).digest('hex'),
  formatVersion: registryExchange ? 2 : 1,
  qualificationScope: registryExchange ? 'Signed GitHub job identity and registry credential exchange only' : 'GitHub release environment and signed job identity only',
  tokenTransport: '@actions/core@3.0.1', registryExchangeVerified: Boolean(registryExchange),
  ...(registryExchange ? { registryExchange } : {}), packagePublished: false, publishable: false };
await mkdir('sdk-release-results', { recursive: true });
await writeFile('sdk-release-results/identity.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Verified ${identity.repository} release environment, worker ${identity.workerId}. No package upload requested.`);
if (registryExchange) console.log(`Verified ${registryExchange.registry} credential exchange for ${registryExchange.packageName}; credential was not persisted.`);
