// Credential exchange only. Registry servers authenticate the GitHub JWT;
// local claim checks constrain routing but are not standalone provenance proof.
const REGISTRIES = {
  ruby: { name: 'rubygems', audience: 'rubygems.org', exchange: 'https://rubygems.org/api/v1/oidc/trusted_publisher/exchange_token' },
  rust: { name: 'crates.io', audience: 'crates.io', exchange: 'https://crates.io/api/v1/trusted_publishing/tokens' },
  csharp: { name: 'nuget', audience: 'https://www.nuget.org', exchange: 'https://www.nuget.org/api/v2/token' },
};
const tokenString = value => typeof value === 'string' && value.length > 0 && value.length < 32768 && !/\s/.test(value);
const userAgent = 'Reacon-SDK-Releases/1.0 (https://github.com/reacon-io)';

/** Runs only in the bound company publish job. Credentials are never written
 * to disk, emitted as workflow outputs, or discovered in local tool config.
 * Rust's first release requires a separate, explicit bootstrap credential. */
export function registryOidcCredentials({ family, environment, nugetUsername, tokenProvider, fetchImpl = fetch, now = () => Date.now() }) {
  const registry = REGISTRIES[family];
  if (!registry) throw new Error('Unsupported trusted-publishing registry');
  if (family === 'csharp' && (typeof nugetUsername !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(nugetUsername))) throw new Error('Verified NuGet policy-creator username is required');
  const env = { ...environment }, repository = `reacon-io/reacon-${family}`;
  const workflowRef = `${repository}/.github/workflows/publish.yml@refs/heads/main`;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository ||
      !/^[1-9]\d*$/.test(env.GITHUB_REPOSITORY_ID ?? '') ||
      env.GITHUB_REPOSITORY_OWNER_ID !== '334414696' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_WORKFLOW_REF !== workflowRef || env.GITHUB_SERVER_URL !== 'https://github.com' ||
      env.RUNNER_ENVIRONMENT !== 'github-hosted' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') ||
      !/^\d+$/.test(env.GITHUB_RUN_ID ?? '') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? '') ||
      !tokenString(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)) throw new Error('Expected company publishing workflow OIDC environment');
  let oidcUrl;
  try {
    oidcUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (oidcUrl.protocol !== 'https:' || !oidcUrl.hostname.endsWith('.actions.githubusercontent.com') ||
        oidcUrl.port || oidcUrl.username || oidcUrl.password || oidcUrl.hash) throw new Error();
  } catch { throw new Error('Unexpected GitHub OIDC endpoint'); }
  if (oidcUrl.searchParams.has('audience')) throw new Error('Unexpected preselected GitHub OIDC audience');
  const requestUrl = `${env.ACTIONS_ID_TOKEN_REQUEST_URL}${oidcUrl.search ? '&' : '?'}audience=${encodeURIComponent(registry.audience)}`;

  async function request(url, init, json = true) {
    let response;
    try { response = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('Trusted-publisher request failed; response details suppressed'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Trusted-publisher request returned HTTP ${response.status}`);
    }
    if (!json) { await response.body?.cancel(); return; }
    const chunks = []; let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length; if (size > 65536) throw new Error(); chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return data;
    } catch { throw new Error('Invalid trusted-publisher response; details suppressed'); }
  }

  return async ({ registry: requestedRegistry, packageName }) => {
    if (requestedRegistry !== registry.name || packageName !== (family === 'csharp' ? 'Reacon.Sdk' : 'reacon-sdk')) throw new Error('Unexpected credential request');
    let github;
    if (tokenProvider !== undefined) {
      if (typeof tokenProvider !== 'function') throw new Error('Invalid registry OIDC token provider');
      try { github = { value: await tokenProvider(registry.audience) }; }
      catch { throw new Error('Registry OIDC token request failed; details suppressed'); }
    } else github = await request(requestUrl, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`, Accept: 'application/json' } });
    let claims;
    try {
      if (!tokenString(github.value) || github.value.split('.').length !== 3) throw new Error();
      claims = JSON.parse(Buffer.from(github.value.split('.')[1], 'base64url'));
      const seconds = now() / 1000;
      if (claims.iss !== 'https://token.actions.githubusercontent.com' || claims.aud !== registry.audience ||
          claims.sub !== `repo:reacon-io@334414696/reacon-${family}@${env.GITHUB_REPOSITORY_ID}:environment:release` || claims.environment !== 'release' ||
          claims.repository !== repository || claims.repository_id !== env.GITHUB_REPOSITORY_ID || claims.repository_owner_id !== '334414696' ||
          claims.ref !== env.GITHUB_REF || claims.sha !== env.GITHUB_SHA || claims.workflow_ref !== workflowRef ||
          (claims.job_workflow_ref !== undefined && claims.job_workflow_ref !== workflowRef) ||
          claims.runner_environment !== 'github-hosted' || claims.run_id !== env.GITHUB_RUN_ID ||
          claims.run_attempt !== env.GITHUB_RUN_ATTEMPT || !Number.isFinite(claims.exp) || claims.exp < seconds + 30 ||
          !Number.isFinite(claims.iat) || claims.iat > seconds + 30 || claims.iat < seconds - 600 ||
          (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > seconds + 30))) throw new Error();
    } catch { throw new Error('GitHub OIDC claims do not match the current company release job'); }
    const issuedBefore = now();
    const result = await request(registry.exchange, { method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': userAgent,
      ...(family === 'csharp' ? { Authorization: `Bearer ${github.value}` } : {}) },
      body: JSON.stringify(family === 'csharp' ? { username: nugetUsername, tokenType: 'ApiKey' } : { jwt: github.value }) });
    const token = family === 'ruby' ? result.rubygems_api_key : family === 'csharp' ? result.apiKey : result.token;
    // crates.io documents a 30-minute lifetime but returns no expiration. Start
    // the local deadline before exchange so it never overstates that lifetime.
    // NuGet similarly returns no expiry; its documented lifetime is one hour.
    const expiresAt = family === 'ruby' ? Date.parse(result.expires_at) : issuedBefore + (family === 'csharp' ? 60 : 30) * 60 * 1000;
    if (!tokenString(token) || !Number.isFinite(expiresAt) || expiresAt <= now() + 30000 || expiresAt > now() + 3600000 ||
        (family === 'ruby' && (!Array.isArray(result.scopes) || result.scopes.length !== 1 || result.scopes[0] !== 'push_rubygem' ||
          (result.gem !== undefined && result.gem?.name !== 'reacon-sdk')))) throw new Error('Unexpected registry token scope or lifetime');
    let revoked = false;
    return { kind: 'trusted-publisher', registry: registry.name, packageName, repository,
      workflow: 'publish.yml', environment: 'release', token, expiresAt,
      ...(family === 'rust' ? { revoke: async () => {
        if (revoked) return;
        await request(registry.exchange, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'User-Agent': userAgent } }, false);
        revoked = true;
      } } : {}) };
  };
}

/** Exercise the configured server-side trust policy without uploading a file.
 * The returned evidence deliberately contains no token or token fingerprint. */
export async function qualifyRegistryOidc({ maskCredential, ...options }) {
  if (!['ruby', 'csharp'].includes(options.family) || typeof maskCredential !== 'function')
    throw new Error('Explicit supported registry qualification and credential masking are required');
  const request = { registry: options.family === 'ruby' ? 'rubygems' : 'nuget',
    packageName: options.family === 'ruby' ? 'reacon-sdk' : 'Reacon.Sdk' };
  const credential = await registryOidcCredentials(options)(request);
  try {
    maskCredential(credential.token);
    return { registry: credential.registry, packageName: credential.packageName,
      repository: credential.repository, workflow: credential.workflow, environment: credential.environment,
      expiresAt: new Date(credential.expiresAt).toISOString(), credentialPersisted: false, packageUploaded: false };
  } finally { credential.token = undefined; }
}
