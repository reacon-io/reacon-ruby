var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// scripts/public-api/lib/generator.mjs
import { createHash as createHash2 } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var root, sha256;
var init_generator = __esm({
  "scripts/public-api/lib/generator.mjs"() {
    root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    sha256 = (bytes) => createHash2("sha256").update(bytes).digest("hex");
  }
});

// scripts/public-api/lib/build-concurrency.mjs
function serialQueue() {
  let tail = Promise.resolve();
  return (operation) => {
    const next = tail.then(operation);
    tail = next.catch(() => {
    });
    return next;
  };
}
var GiB, FAMILY_RESOURCES;
var init_build_concurrency = __esm({
  "scripts/public-api/lib/build-concurrency.mjs"() {
    GiB = 1024 ** 3;
    FAMILY_RESOURCES = Object.freeze({
      typescript: { cpus: 2, memoryBytes: 2 * GiB, scratchBytes: 2 * GiB },
      python: { cpus: 1, memoryBytes: GiB, scratchBytes: GiB },
      go: { cpus: 2, memoryBytes: 2 * GiB, scratchBytes: 2 * GiB },
      rust: { cpus: 3, memoryBytes: 3 * GiB, scratchBytes: 3 * GiB },
      php: { cpus: 1, memoryBytes: GiB, scratchBytes: GiB },
      ruby: { cpus: 1, memoryBytes: GiB, scratchBytes: GiB },
      java: { cpus: 2, memoryBytes: 2 * GiB, scratchBytes: 2 * GiB },
      kotlin: { cpus: 3, memoryBytes: 3 * GiB, scratchBytes: 3 * GiB },
      csharp: { cpus: 2, memoryBytes: 2 * GiB, scratchBytes: 2 * GiB }
    });
  }
});

// sdk-generation/ci/publisher/publish-file.mjs
import { readFile as readFile3, writeFile as writeFile3, mkdir as mkdir3, mkdtemp as mkdtemp4, rm as rm5 } from "node:fs/promises";
import { join as join6, dirname as dirname2, resolve as resolve5 } from "node:path";
import { tmpdir as tmpdir3 } from "node:os";
import { fileURLToPath as fileURLToPath4 } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getIDToken, setSecret } from "@actions/core";

// scripts/public-api/lib/github-publisher-identity.mjs
import { createHash, createPublicKey, verify } from "node:crypto";
var ISSUER = "https://token.actions.githubusercontent.com";
var AUDIENCE = "https://github.com/reacon-io";
var OWNER_ID = "334414696";
var FAMILIES = ["typescript", "python", "go", "rust", "php", "ruby", "java", "kotlin", "csharp"];
var id = (value) => typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
var sha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
async function githubPublisherIdentity({ configuration: configuration2, environment, fetchImpl = fetch, tokenProvider, now = Date.now }) {
  const env = { ...environment }, config = { ...configuration2 };
  const repository = `reacon-io/reacon-${config.family}`;
  const workflowRef = `${repository}/.github/workflows/publish.yml@refs/heads/main`;
  if (config.formatVersion !== 1 || !FAMILIES.includes(config.family) || !id(String(config.repositoryId)) || config.repository !== repository || !["private", "public"].includes(config.visibility)) throw new Error("Expected reviewed company publisher configuration");
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_SERVER_URL !== "https://github.com" || env.GITHUB_API_URL !== "https://api.github.com" || env.GITHUB_REPOSITORY !== repository || env.GITHUB_REPOSITORY_ID !== String(config.repositoryId) || env.GITHUB_REPOSITORY_OWNER !== "reacon-io" || env.GITHUB_REPOSITORY_OWNER_ID !== OWNER_ID || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" || env.GITHUB_WORKFLOW_REF !== workflowRef || !sha(env.GITHUB_SHA) || env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA || env.RUNNER_ENVIRONMENT !== "github-hosted" || !id(env.GITHUB_RUN_ID) || !id(env.GITHUB_RUN_ATTEMPT) || typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN !== "string" || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || env.ACTIONS_ID_TOKEN_REQUEST_TOKEN.length > 32768 || /\s/.test(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)) throw new Error("Not the configured company publisher job");
  let endpoint;
  try {
    endpoint = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".actions.githubusercontent.com") || endpoint.port || endpoint.username || endpoint.password || endpoint.hash) throw new Error();
  } catch {
    throw new Error("Unexpected GitHub job identity endpoint");
  }
  if (endpoint.searchParams.has("audience")) throw new Error("Unexpected preselected GitHub identity audience");
  const requestUrl = `${env.ACTIONS_ID_TOKEN_REQUEST_URL}${endpoint.search ? "&" : "?"}audience=${encodeURIComponent(AUDIENCE)}`;
  async function json(url, headers = {}) {
    let response2;
    try {
      response2 = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(3e4), headers: { Accept: "application/json", "User-Agent": "reacon-sdk-publisher", ...headers } });
    } catch {
      throw new Error("GitHub identity transport failed; details suppressed");
    }
    if (response2.status !== 200) {
      let detail = "";
      try {
        const reader = response2.body.getReader(), chunks = [];
        let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 8192) {
            await reader.cancel();
            throw new Error();
          }
          chunks.push(value);
        }
        const text = Buffer.concat(chunks).toString("utf8");
        let message;
        try {
          const body = JSON.parse(text);
          message = body.message ?? body.error_description ?? body.error?.message ?? body.error;
        } catch {
          message = text.replace(/<[^>]*>/g, " ");
        }
        if (typeof message === "string") detail = message.split(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN).join("[redacted]").replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z0-9_./+=-]{32,}/g, "[redacted]").replace(/[^A-Za-z0-9 .,;:!?()\[\]'_-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
      } catch {
      }
      throw new Error(`GitHub identity HTTP ${response2.status}${detail ? `: ${detail}` : ""}`);
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of response2.body) {
        size += chunk.length;
        if (size > 128 * 1024) throw new Error();
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks));
    } catch {
      throw new Error("Invalid GitHub identity response; details suppressed");
    }
  }
  let response;
  if (tokenProvider !== void 0) {
    if (typeof tokenProvider !== "function") throw new Error("Invalid GitHub token provider");
    try {
      response = { value: await tokenProvider(AUDIENCE) };
    } catch (error) {
      const message = typeof error?.message === "string" ? error.message : "";
      const envelope = message.match(/Failed to get ID Token\.[\s\S]*?Error Code\s*:\s*(\d{3})\s+Error Message:\s*([\s\S]*)/);
      let detail = "";
      if (envelope) {
        const safe = envelope[2].split(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN).join("[redacted]").split(env.ACTIONS_ID_TOKEN_REQUEST_URL).join("[url]").replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z0-9_./+=-]{32,}/g, "[redacted]").replace(/[^A-Za-z0-9 .,;:!?()\[\]'_-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
        detail = ` HTTP ${envelope[1]}${safe ? `: ${safe}` : ""}`;
      }
      throw new Error(`Official GitHub token request failed${detail || "; details suppressed"}`);
    }
  } else response = await json(requestUrl, { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` });
  let header, claims, parts;
  try {
    if (typeof response.value !== "string" || response.value.length > 32768) throw new Error();
    parts = response.value.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    header = JSON.parse(Buffer.from(parts[0], "base64url"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url"));
    if (header.alg !== "RS256" || header.typ !== "JWT" || typeof header.kid !== "string" || !header.kid || header.crit !== void 0 || !claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error();
  } catch {
    throw new Error("Malformed GitHub job identity token");
  }
  const keySet = await json(`${ISSUER}/.well-known/jwks`);
  try {
    if (!Array.isArray(keySet.keys) || keySet.keys.length > 100) throw new Error();
    const candidates = keySet.keys.filter((key3) => key3.kid === header.kid);
    if (candidates.length !== 1 || candidates[0].kty !== "RSA" || candidates[0].use !== "sig" || candidates[0].alg !== void 0 && candidates[0].alg !== "RS256") throw new Error();
    const key2 = createPublicKey({ key: candidates[0], format: "jwk" });
    if (key2.asymmetricKeyDetails.modulusLength < 2048 || !verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key2, Buffer.from(parts[2], "base64url"))) throw new Error();
  } catch {
    throw new Error("GitHub job identity signature verification failed");
  }
  const seconds = now() / 1e3;
  if (!Number.isFinite(seconds) || claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.sub !== `repo:reacon-io@${OWNER_ID}/reacon-${config.family}@${config.repositoryId}:environment:release` || claims.environment !== "release" || claims.repository !== repository || claims.repository_id !== String(config.repositoryId) || claims.repository_owner !== "reacon-io" || claims.repository_owner_id !== OWNER_ID || claims.repository_visibility !== config.visibility || claims.ref !== "refs/heads/main" || claims.ref_type !== "branch" || claims.sha !== env.GITHUB_SHA || claims.workflow_ref !== workflowRef || claims.workflow_sha !== env.GITHUB_WORKFLOW_SHA || claims.event_name !== "workflow_dispatch" || claims.runner_environment !== "github-hosted" || claims.run_id !== env.GITHUB_RUN_ID || claims.run_attempt !== env.GITHUB_RUN_ATTEMPT || claims.job_workflow_ref !== void 0 && claims.job_workflow_ref !== workflowRef || claims.job_workflow_sha !== void 0 && claims.job_workflow_sha !== env.GITHUB_SHA || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || !Number.isFinite(claims.nbf) || claims.exp < seconds + 30 || claims.exp > seconds + 900 || claims.iat > seconds + 30 || claims.iat < seconds - 600 || claims.nbf > seconds + 30 || claims.exp <= claims.iat || claims.nbf > claims.exp) throw new Error("GitHub job identity claims do not match this publisher");
  return {
    formatVersion: 1,
    kind: "sdk-github-publisher-identity",
    observedAt: new Date(now()).toISOString(),
    family: config.family,
    repository,
    repositoryId: Number(config.repositoryId),
    visibility: config.visibility,
    workflow: "publish.yml",
    workflowRef,
    workflowCommit: env.GITHUB_WORKFLOW_SHA,
    sourceCommit: env.GITHUB_SHA,
    environment: "release",
    event: "workflow_dispatch",
    runnerEnvironment: "github-hosted",
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    workerId: `gh-${config.repositoryId}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,
    signatureVerified: true,
    signingKeyId: header.kid,
    verifiedClaimsSha256: createHash("sha256").update(parts[1]).digest("hex"),
    tokenExpiresAt: new Date(claims.exp * 1e3).toISOString()
  };
}

// scripts/public-api/lib/github-release-state.mjs
import { mkdir as mkdir2, mkdtemp, realpath as realpath3, rm as rm2 } from "node:fs/promises";
import { join as join3, resolve as resolve3 } from "node:path";

// scripts/public-api/lib/git-release-state.mjs
import { mkdir, lstat, realpath, rm } from "node:fs/promises";
import { resolve as resolve2, join } from "node:path";
import { randomUUID } from "node:crypto";

// scripts/public-api/contract.mjs
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key2, item]) => [key2, canonical(item)]));
  return value;
}

// scripts/public-api/lib/git-release-state.mjs
init_generator();

// scripts/public-api/lib/release-versions.mjs
var PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.([1-9]\d*))?$/;
var STAGES = { alpha: 0, beta: 1, rc: 2 };
var VERSION_PROPERTY = { typescript: "npmVersion", python: "packageVersion", go: "packageVersion", rust: "packageVersion", php: "artifactVersion", ruby: "gemVersion", java: "artifactVersion", kotlin: "artifactVersion", csharp: "packageVersion" };
function parseReleaseVersion(version) {
  if (typeof version !== "string" || version.length > 64) throw new Error("Invalid canonical release version");
  const match = PATTERN.exec(version);
  if (!match) throw new Error("Use X.Y.Z or X.Y.Z-(alpha|beta|rc).N with N >= 1");
  const core = match.slice(1, 4).map(Number);
  const sequence = match[5] === void 0 ? null : Number(match[5]);
  if (core.some((number) => !Number.isSafeInteger(number) || number > 65534) || sequence !== null && (!Number.isSafeInteger(sequence) || sequence > 2147483647)) throw new Error("Release version exceeds the cross-language numeric limits");
  return { canonical: version, core, base: core.join("."), stage: match[4] ?? null, sequence, prerelease: sequence !== null };
}
function compareCore(left, right) {
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return Math.sign(left[index] - right[index]);
  return 0;
}
function compareReleaseVersions(left, right) {
  const a = parseReleaseVersion(left), b = parseReleaseVersion(right);
  const core = compareCore(a.core, b.core);
  if (core) return core;
  if (a.prerelease !== b.prerelease) return a.prerelease ? -1 : 1;
  if (!a.prerelease) return 0;
  return Math.sign(STAGES[a.stage] - STAGES[b.stage]) || Math.sign(a.sequence - b.sequence);
}
function renderReleaseVersion(family2, version, { availability = "private", packageName } = {}) {
  if (!Object.hasOwn(VERSION_PROPERTY, family2)) throw new Error("Unknown SDK family");
  if (!["private", "public"].includes(availability)) throw new Error("Explicit API availability must be private or public");
  const parsed = parseReleaseVersion(version);
  if (availability === "private" && !parsed.prerelease) throw new Error("Private API environments may publish prereleases only");
  let packageVersion = parsed.canonical;
  if (family2 === "python" && parsed.prerelease) packageVersion = `${parsed.base}${{ alpha: "a", beta: "b", rc: "rc" }[parsed.stage]}${parsed.sequence}`;
  if (family2 === "ruby" && parsed.prerelease) packageVersion = `${parsed.base}.${parsed.stage}.${parsed.sequence}`;
  const result = {
    family: family2,
    canonicalVersion: version,
    packageVersion,
    gitTag: `v${version}`,
    prerelease: parsed.prerelease,
    availability,
    generatorProperties: { [VERSION_PROPERTY[family2]]: packageVersion },
    publishable: false
  };
  if (family2 === "typescript") result.npmDistTag = parsed.prerelease ? "next" : "latest";
  if (family2 === "go") {
    if (typeof packageName !== "string" || !/^github\.com\/reacon-io\/reacon-go(?:\/v(?:[2-9]|[1-9]\d+))?$/.test(packageName)) throw new Error("Go requires the explicit company module identity");
    const base = packageName.replace(/\/v\d+$/, "");
    result.modulePath = parsed.core[0] >= 2 ? `${base}/v${parsed.core[0]}` : base;
    result.requiresModulePathChange = result.modulePath !== packageName;
    result.moduleVersion = `v${version}`;
  }
  if (family2 === "php") result.composerVersionSource = "git-tag";
  return result;
}

// scripts/public-api/lib/release-state.mjs
import { isDeepStrictEqual } from "node:util";

// scripts/public-api/lib/central-deployment-state.mjs
var hash = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
var id2 = (value) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(value ?? "");
var uuid = (value) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value ?? "");
var instant = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
var states = ["PENDING", "VALIDATING", "VALIDATED", "PUBLISHING", "PUBLISHED", "FAILED"];
function fields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key2) => !allowed.includes(key2))) throw new Error("Invalid Central journal fields");
}
var centralDeploymentName = (family2, version, bundleSha256) => `reacon-${family2}-${version}-${bundleSha256}`;
function validateCentralDeployment(value, { family: family2, version, identitySha256, attempts }) {
  fields(value, [
    "identitySha256",
    "bundleManifestSha256",
    "bundleSha256",
    "deploymentName",
    "uploadAttemptId",
    "uploadStartedAt",
    "absence",
    "deploymentId",
    "uploadEvidenceSha256",
    "status",
    "staged",
    "publishAttempts"
  ]);
  const attempt = attempts.find((entry) => entry.attemptId === value.uploadAttemptId);
  if (!["java", "kotlin"].includes(family2) || value.identitySha256 !== identitySha256 || !hash(value.identitySha256) || !hash(value.bundleManifestSha256) || !hash(value.bundleSha256) || value.deploymentName !== centralDeploymentName(family2, version, value.bundleSha256) || !attempt || !instant(value.uploadStartedAt) || Date.parse(value.uploadStartedAt) < Date.parse(attempt.startedAt) || !Array.isArray(value.publishAttempts)) throw new Error("Invalid Central upload binding");
  fields(value.absence, ["evidenceSha256", "at"]);
  if (!hash(value.absence.evidenceSha256) || !instant(value.absence.at) || Date.parse(value.uploadStartedAt) - Date.parse(value.absence.at) < 0 || Date.parse(value.uploadStartedAt) - Date.parse(value.absence.at) > 6e4) throw new Error("Central upload absence evidence is stale");
  if (value.deploymentId !== void 0 && (!uuid(value.deploymentId) || !hash(value.uploadEvidenceSha256))) throw new Error("Invalid Central deployment receipt");
  if (value.uploadEvidenceSha256 && !value.deploymentId) throw new Error("Orphan Central receipt");
  if (value.status) {
    fields(value.status, ["state", "evidenceSha256", "at"]);
    if (!value.deploymentId || !states.includes(value.status.state) || !hash(value.status.evidenceSha256) || !instant(value.status.at) || Date.parse(value.status.at) < Date.parse(value.uploadStartedAt)) throw new Error("Invalid Central status evidence");
  }
  if (value.staged) {
    fields(value.staged, ["evidenceSha256", "at"]);
    if (!value.deploymentId || !hash(value.staged.evidenceSha256) || !instant(value.staged.at) || Date.parse(value.staged.at) < Date.parse(value.uploadStartedAt)) throw new Error("Invalid staged bundle evidence");
  }
  const seen = /* @__PURE__ */ new Set();
  for (const publish of value.publishAttempts) {
    fields(publish, ["attemptId", "at", "acknowledgementSha256"]);
    const worker = attempts.find((entry) => entry.attemptId === publish.attemptId);
    if (!value.deploymentId || !value.staged || !id2(publish.attemptId) || !worker || seen.has(publish.attemptId) || !instant(publish.at) || Date.parse(publish.at) < Date.parse(worker.startedAt) || Date.parse(publish.at) < Date.parse(value.uploadStartedAt) || publish.acknowledgementSha256 !== void 0 && !hash(publish.acknowledgementSha256)) throw new Error("Invalid Central publication intent");
    seen.add(publish.attemptId);
  }
  return value;
}

// scripts/public-api/lib/release-state.mjs
var FAMILIES2 = ["typescript", "python", "go", "rust", "php", "ruby", "java", "kotlin", "csharp"];
var PUBLICATION_UNITS = {
  typescript: ["npm"],
  python: ["wheel", "sdist"],
  go: ["tag"],
  rust: ["crate"],
  php: ["tag", "packagist"],
  ruby: ["gem"],
  java: ["central"],
  kotlin: ["central"],
  csharp: ["nuget"]
};
function publicationUnitNames(family2, units2) {
  const names2 = ["java", "kotlin"].includes(family2) && Object.hasOwn(units2 ?? {}, "maven") ? ["maven"] : PUBLICATION_UNITS[family2];
  if (!names2 || !units2 || JSON.stringify(Object.keys(units2).sort()) !== JSON.stringify([...names2].sort()))
    throw Error("Invalid publication unit set (incomplete or conflicting)");
  return names2;
}
var hash2 = (value) => {
  if (!/^[a-f0-9]{64}$/.test(value ?? "")) throw new Error("Checksummed evidence is required");
  return value;
};
var id3 = (value) => {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(value ?? "")) throw new Error("Invalid release/run identity");
  return value;
};
var instant2 = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid event time");
  return Date.parse(value);
};
function keys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key2) => !allowed.includes(key2))) throw new Error("Unexpected release-state fields");
}
function emptyReleaseState() {
  return { formatVersion: 1, sequence: 0, activeReleaseId: null, docsReleaseId: null, baselines: {}, versionOwners: {}, releases: {} };
}
var allPublished = (pkg) => pkg.mode === "unchanged" || Object.values(pkg.units ?? {}).length > 0 && Object.values(pkg.units).every((unit) => unit.state === "published");
var allInstalled = (pkg) => Boolean(pkg.installEvidenceSha256) && allPublished(pkg);
function releasePhase(release) {
  if (release.superseded) return "superseded";
  if (release.docs) return "docs_promoted";
  const packages = Object.values(release.packages);
  if (packages.every(allInstalled)) return "install_verified";
  if (packages.every(allPublished)) return "published";
  const units2 = packages.filter((pkg) => pkg.mode === "changed").flatMap((pkg) => Object.values(pkg.units ?? {}));
  if (units2.some((unit) => unit.state === "collision")) return "collision";
  if (units2.some((unit) => unit.state === "published")) return "partially_published";
  if (units2.some((unit) => ["publishing", "uncertain"].includes(unit.state))) return "publishing";
  if (release.compatibility) return "deployment_verified";
  if (packages.every((pkg) => pkg.mode === "unchanged" || pkg.testEvidenceSha256)) return "tested";
  return "prepared";
}
function validatePackagePreviewState(preview) {
  keys(preview, [
    "sourceRevision",
    "contractSha256",
    "generationSha256",
    "sourceSha256",
    "artifactManifestSha256",
    "testEvidenceSha256",
    "candidateSha256",
    "approvalSha256",
    "evidenceSha256",
    "expiresAt"
  ]);
  if (!/^[a-f0-9]{40}$/.test(preview.sourceRevision ?? "")) throw Error("Invalid preview source");
  for (const name of [
    "contractSha256",
    "generationSha256",
    "sourceSha256",
    "artifactManifestSha256",
    "testEvidenceSha256",
    "candidateSha256",
    "approvalSha256",
    "evidenceSha256"
  ]) hash2(preview[name]);
  instant2(preview.expiresAt);
}
function publicationAuthorized(release, family2, now, remainingMilliseconds = 0) {
  const time = typeof now === "number" ? now : instant2(now);
  if (!release || release.superseded || !Number.isFinite(time) || !Number.isSafeInteger(remainingMilliseconds) || remainingMilliseconds < 0) return false;
  if (Date.parse(release.compatibility?.expiresAt) > time + remainingMilliseconds) return true;
  const pkg = release.packages?.[family2], proof = pkg?.preview;
  return Boolean(release.availability === "private" && pkg?.mode === "changed" && proof && parseReleaseVersion(pkg.canonicalVersion).prerelease && proof.sourceRevision === release.sourceRevision && proof.contractSha256 === release.contractSha256 && proof.generationSha256 === release.generationSha256 && proof.sourceSha256 === pkg.sourceSha256 && proof.artifactManifestSha256 === pkg.artifactManifestSha256 && proof.testEvidenceSha256 === pkg.testEvidenceSha256 && Date.parse(proof.expiresAt) > time + remainingMilliseconds);
}
function validateReleaseState(state) {
  keys(state, ["formatVersion", "sequence", "activeReleaseId", "docsReleaseId", "baselines", "versionOwners", "releases"]);
  if (state.formatVersion !== 1 || !Number.isSafeInteger(state.sequence) || state.sequence < 0 || !state.baselines || !state.versionOwners || !state.releases) throw new Error("Invalid release state");
  keys(state.baselines, FAMILIES2);
  keys(state.releases, Object.keys(state.releases));
  keys(state.versionOwners, Object.keys(state.versionOwners));
  if (state.activeReleaseId !== null && !Object.hasOwn(state.releases, state.activeReleaseId)) throw new Error("Active release is missing");
  if (state.docsReleaseId !== null && !state.releases[state.docsReleaseId]?.docs) throw new Error("Published docs release is missing");
  const events = /* @__PURE__ */ new Set();
  for (const [releaseId2, release] of Object.entries(state.releases)) {
    id3(releaseId2);
    keys(release, ["releaseId", "sourceRevision", "contractSha256", "generationSha256", "availability", "packages", "events", "compatibility", "docs", "superseded"]);
    if (!/^[a-f0-9]{40}$/.test(release.sourceRevision) || !["private", "public"].includes(release.availability)) throw new Error("Invalid release source or availability");
    hash2(release.contractSha256);
    hash2(release.generationSha256);
    if (release.releaseId !== releaseId2 || JSON.stringify(Object.keys(release.packages).sort()) !== JSON.stringify([...FAMILIES2].sort())) throw new Error("Release state must include every SDK family");
    if (!Array.isArray(release.events) || !release.events.length || !release.docs && !release.superseded && state.activeReleaseId !== releaseId2 || (release.docs || release.superseded) && state.activeReleaseId === releaseId2 || release.docs && release.superseded) throw new Error("Invalid release lifecycle");
    let lastSequence = 0, lastTime = 0;
    for (const event of release.events) {
      keys(event, ["sequence", "action", "at"]);
      const time = instant2(event.at);
      if (!Number.isSafeInteger(event.sequence) || event.sequence <= lastSequence || event.sequence > state.sequence || events.has(event.sequence) || time < lastTime || !["versions_reserved", "candidate_tested", "compatibility_verified", "package_preview_authorized", "registry_observed", "publication_started", "previous_attempt_stopped", "public_install_verified", "docs_promoted", "release_superseded", "central_deployment_updated", "central_publication_resumed"].includes(event.action)) throw new Error("Invalid release event history");
      events.add(event.sequence);
      lastSequence = event.sequence;
      lastTime = time;
    }
    if (release.compatibility) {
      keys(release.compatibility, ["evidenceSha256", "expiresAt", "trigger"]);
      hash2(release.compatibility.evidenceSha256);
      instant2(release.compatibility.expiresAt);
      if (!["deployment", "sdk-only"].includes(release.compatibility.trigger)) throw new Error("Invalid compatibility trigger");
    }
    for (const [family2, pkg] of Object.entries(release.packages)) {
      keys(pkg, ["mode", "canonicalVersion", "packageVersion", "previousVersion", "impact", "migrationDocumentSha256", "artifactManifestSha256", "sourceSha256", "testEvidenceSha256", "units", "installEvidenceSha256", "releaseId", "preview"]);
      if (!["changed", "unchanged"].includes(pkg.mode)) throw new Error("Invalid SDK package mode");
      const rendered = renderReleaseVersion(family2, pkg.canonicalVersion, { availability: release.availability, packageName: family2 === "go" ? "github.com/reacon-io/reacon-go" : void 0 });
      if (pkg.packageVersion !== rendered.packageVersion) throw new Error("Invalid native package version");
      if (pkg.mode === "changed" && state.versionOwners[`${family2}@${pkg.canonicalVersion}`] !== releaseId2) throw new Error("SDK reservation ownership mismatch");
      if (Boolean(pkg.units) !== Boolean(pkg.testEvidenceSha256)) throw new Error("Candidate test evidence and units must be bound together");
      if (pkg.preview) {
        validatePackagePreviewState(pkg.preview);
        if (!parseReleaseVersion(pkg.canonicalVersion).prerelease || !pkg.units || pkg.preview.sourceSha256 !== pkg.sourceSha256 || pkg.preview.artifactManifestSha256 !== pkg.artifactManifestSha256 || pkg.preview.testEvidenceSha256 !== pkg.testEvidenceSha256 || pkg.mode === "changed" && (release.availability !== "private" || pkg.preview.sourceRevision !== release.sourceRevision || pkg.preview.contractSha256 !== release.contractSha256 || pkg.preview.generationSha256 !== release.generationSha256))
          throw Error("Preview state differs from its qualified package");
      }
      if (pkg.units) {
        hash2(pkg.artifactManifestSha256);
        hash2(pkg.sourceSha256);
        hash2(pkg.testEvidenceSha256);
        publicationUnitNames(family2, pkg.units);
        for (const unit of Object.values(pkg.units)) {
          keys(unit, ["identitySha256", "state", "attempts", "observation", "centralDeployment"]);
          hash2(unit.identitySha256);
          if (!["ready", "absent", "publishing", "uncertain", "published", "collision"].includes(unit.state) || !Array.isArray(unit.attempts)) throw new Error("Invalid publication unit state");
          for (const attempt of unit.attempts) {
            keys(attempt, ["attemptId", "runId", "startedAt", "stoppedEvidenceSha256"]);
            id3(attempt.attemptId);
            id3(attempt.runId);
            instant2(attempt.startedAt);
            if (attempt.stoppedEvidenceSha256) hash2(attempt.stoppedEvidenceSha256);
          }
          if (unit.centralDeployment) validateCentralDeployment(unit.centralDeployment, {
            family: family2,
            version: pkg.packageVersion,
            identitySha256: unit.identitySha256,
            attempts: unit.attempts
          });
          if (unit.observation) {
            keys(unit.observation, ["status", "evidenceSha256", "at", "identitySha256"]);
            hash2(unit.observation.evidenceSha256);
            instant2(unit.observation.at);
            if (!["found", "absent", "unknown"].includes(unit.observation.status)) throw new Error("Invalid registry observation state");
            if (unit.observation.status === "found") hash2(unit.observation.identitySha256);
          }
          if (unit.state === "published" && (unit.observation?.status !== "found" || unit.observation.identitySha256 !== unit.identitySha256)) throw new Error("Published unit lacks matching registry evidence");
          if (unit.state === "collision" && (unit.observation?.status !== "found" || unit.observation.identitySha256 === unit.identitySha256)) throw new Error("Collision lacks mismatching registry evidence");
          if (unit.state === "publishing" && (!unit.attempts.length || unit.attempts.at(-1).stoppedEvidenceSha256)) throw new Error("Publishing unit lacks an active attempt");
          if (unit.state === "absent" && (unit.observation?.status !== "absent" || unit.attempts.length && !unit.attempts.at(-1).stoppedEvidenceSha256)) throw new Error("Unsafe retry state");
        }
      }
      if (pkg.installEvidenceSha256) {
        hash2(pkg.installEvidenceSha256);
        if (!allPublished(pkg)) throw new Error("Install evidence precedes publication");
      }
      if (pkg.mode === "unchanged") {
        const owner = state.releases[pkg.releaseId], original = owner?.packages[family2];
        if (!owner || !(owner.docs || owner.superseded) || original?.mode !== "changed" || owner.events[0].sequence >= release.events[0].sequence || !allInstalled(original) || !isDeepStrictEqual(pkg, { ...original, mode: "unchanged", releaseId: owner.releaseId })) {
          throw new Error("Unchanged package must match an installed published baseline");
        }
      }
    }
    if (release.docs) {
      keys(release.docs, ["artifactSha256", "evidenceSha256", "at"]);
      hash2(release.docs.artifactSha256);
      hash2(release.docs.evidenceSha256);
      instant2(release.docs.at);
      if (!release.compatibility || !Object.values(release.packages).every(allInstalled)) throw new Error("Docs advanced before SDK qualification");
    }
    if (release.superseded) {
      keys(release.superseded, ["reason", "decisionEvidenceSha256", "at"]);
      hash2(release.superseded.decisionEvidenceSha256);
      instant2(release.superseded.at);
      if (!["version-collision", "withdraw-candidate", "corrective-release"].includes(release.superseded.reason)) throw new Error("Invalid supersession reason");
    }
  }
  if (events.size !== state.sequence) throw new Error("Release state event sequence has gaps");
  for (const [version, releaseId2] of Object.entries(state.versionOwners)) {
    const [family2, canonicalVersion] = version.split("@");
    const pkg = state.releases[releaseId2]?.packages[family2];
    if (!pkg || pkg.mode !== "changed" || pkg.canonicalVersion !== canonicalVersion || version !== `${family2}@${canonicalVersion}`) throw new Error("Orphan SDK reservation");
  }
  for (const [family2, baseline] of Object.entries(state.baselines)) {
    const { releaseId: releaseId2, ...pkg } = baseline;
    if (!allPublished(pkg) || !isDeepStrictEqual(pkg, state.releases[releaseId2]?.packages[family2])) throw new Error("Published baseline does not match its release");
  }
  for (const family2 of FAMILIES2) {
    const published = Object.values(state.releases).filter((release) => release.packages[family2].mode === "changed" && allPublished(release.packages[family2])).sort((a, b) => compareReleaseVersions(a.packages[family2].canonicalVersion, b.packages[family2].canonicalVersion));
    if (published.length && state.baselines[family2]?.releaseId !== published.at(-1).releaseId) throw new Error("Latest successful publication baseline was lost");
  }
  return state;
}

// scripts/public-api/lib/git-release-state.mjs
var REF = "refs/heads/main";
var TRACKING = "refs/remotes/release/main";
var FILE = "release-state.json";
var bytesFor = (state) => Buffer.from(JSON.stringify(canonical(state), null, 2) + "\n");
var ConcurrentReleaseState = class extends Error {
  constructor() {
    super("Release state advanced concurrently; reload before continuing");
    this.name = "ConcurrentReleaseState";
  }
};
var UncertainReleaseStateCommit = class extends Error {
  constructor(commit) {
    super("Release-state push outcome is uncertain; reconcile before any publication");
    this.name = "UncertainReleaseStateCommit";
    this.commit = commit;
  }
};
async function gitReleaseStateStore({ directory: directory2, remote, runGit = defaultRunGit }) {
  const hosted = remote === "https://github.com/reacon-io/reacon-sdk-releases.git";
  if (!hosted && (typeof remote !== "string" || !remote.startsWith("/") || await realpath(remote) !== remote)) throw new Error("Release state remote must be the company repo or an explicit real local path");
  directory2 = resolve2(directory2);
  await mkdir(directory2, { recursive: true, mode: 448 });
  if (await realpath(directory2) !== directory2 || !(await lstat(directory2)).isDirectory()) throw new Error("Release state checkout must not use symlinks");
  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([key2]) => !key2.startsWith("GIT_")));
  Object.assign(baseEnv, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Reacon SDK Releases",
    GIT_AUTHOR_EMAIL: "sdk-releases@reacon.io",
    GIT_COMMITTER_NAME: "Reacon SDK Releases",
    GIT_COMMITTER_EMAIL: "sdk-releases@reacon.io"
  });
  const git = (args, input, extraEnv) => runGit([
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.attributesFile=/dev/null",
    "-c",
    "credential.helper=",
    "-c",
    "fetch.recurseSubmodules=false",
    "--git-dir",
    directory2,
    ...args
  ], input, { ...baseEnv, ...extraEnv });
  try {
    await lstat(join(directory2, "HEAD"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await runGit(["-c", "init.templateDir=", "init", "--bare", "--object-format=sha1", directory2], void 0, baseEnv);
  }
  if (String(await git(["rev-parse", "--is-bare-repository"])).trim() !== "true") throw new Error("Dedicated bare state checkout required");
  async function read() {
    await git(["fetch", "--no-tags", "--no-write-fetch-head", remote, `+${REF}:${TRACKING}`]);
    const commit2 = String(await git(["rev-parse", TRACKING])).trim();
    if (!/^[a-f0-9]{40}$/.test(commit2)) throw new Error("Unexpected state repository object format");
    const entry = String(await git(["ls-tree", commit2, "--", FILE])).trim();
    let state;
    if (!entry) state = emptyReleaseState();
    else {
      if (!/^100644 blob [a-f0-9]{40}\trelease-state\.json$/.test(entry)) throw new Error("Release state must be a regular Git blob");
      state = validateReleaseState(JSON.parse(await git(["show", `${commit2}:${FILE}`])));
    }
    return { commit: commit2, state, stateSha256: sha256(bytesFor(state)) };
  }
  async function commit({ expectedCommit, state }) {
    validateReleaseState(state);
    const current = await read();
    if (current.commit !== expectedCommit) throw new ConcurrentReleaseState();
    const bytes = bytesFor(state);
    if (sha256(bytes) === current.stateSha256) return current;
    if (state.sequence !== current.state.sequence + 1) throw new Error("One state event per compare-and-swap commit is required");
    const index = join(directory2, `index-${randomUUID()}`), env = { GIT_INDEX_FILE: index };
    let nextCommit;
    try {
      await git(["read-tree", expectedCommit], void 0, env);
      const blob = String(await git(["hash-object", "-w", "--stdin", "--no-filters"], bytes)).trim();
      await git(["update-index", "--add", "--cacheinfo", `100644,${blob},${FILE}`], void 0, env);
      const tree = String(await git(["write-tree"], void 0, env)).trim();
      nextCommit = String(await git(["commit-tree", tree, "-p", expectedCommit], Buffer.from(`SDK release state event ${state.sequence}
`))).trim();
    } finally {
      await rm(index, { force: true });
      await rm(`${index}.lock`, { force: true });
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await git(["push", "--porcelain", remote, `${nextCommit}:${REF}`]);
        break;
      } catch (error) {
        let observed2;
        try {
          observed2 = await read();
        } catch {
          throw new UncertainReleaseStateCommit(nextCommit);
        }
        if (observed2.commit === nextCommit) return observed2;
        try {
          await git(["merge-base", "--is-ancestor", nextCommit, observed2.commit]);
          return observed2;
        } catch {
        }
        if (observed2.commit !== expectedCommit) throw new ConcurrentReleaseState();
        if (attempt === 0 && ["repository-unavailable", "transport", "timeout"].includes(error.gitFailureCategory)) continue;
        const category = ["repository-unavailable", "transport", "timeout", "authentication", "dns", "tls", "other"].includes(error.gitFailureCategory) ? error.gitFailureCategory : "unknown";
        throw new Error(`Release state push was rejected (${category}); do not start publication`);
      }
    }
    let observed;
    try {
      observed = await read();
    } catch {
      throw new UncertainReleaseStateCommit(nextCommit);
    }
    if (observed.commit !== nextCommit) {
      try {
        await git(["merge-base", "--is-ancestor", nextCommit, observed.commit]);
      } catch {
        throw new ConcurrentReleaseState();
      }
    }
    return observed;
  }
  return { read, commit, remote, directory: directory2 };
}
function classifyGitFailure(detail, timedOut = false) {
  return timedOut ? "timeout" : /authentication failed|invalid username|could not read Username|error: 401|error: 403/i.test(detail) ? "authentication" : /Could not resolve host/i.test(detail) ? "dns" : /SSL certificate|certificate verify/i.test(detail) ? "tls" : /repository not found|repository .* not found/i.test(detail) ? "repository-unavailable" : /RPC failed|HTTP\/2|remote end hung up|connection reset|Failed to connect|error: 50[0234]/i.test(detail) ? "transport" : "other";
}
async function defaultRunGit(args, input, env) {
  const { spawn: spawn3 } = await import("node:child_process");
  return await new Promise((resolveRun, reject) => {
    const child = spawn3("/usr/bin/git", args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 3e4);
    const chunks = [];
    let size = 0;
    const diagnostics = [];
    let diagnosticSize = 0;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) child.kill("SIGTERM");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      diagnosticSize += chunk.length;
      if (diagnosticSize <= 16384) diagnostics.push(chunk);
    });
    child.stdin.on("error", () => {
    });
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("Git state command failed"));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 && size <= 16 * 1024 * 1024) return resolveRun(Buffer.concat(chunks));
      const detail = Buffer.concat(diagnostics).toString("utf8");
      const category = classifyGitFailure(detail, timedOut);
      const error = new Error(`Git state command failed (${category})`);
      error.gitFailureCategory = category;
      reject(error);
    });
    child.stdin.end(input);
  });
}

// scripts/public-api/lib/github-release-access.mjs
import { createPrivateKey, sign } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
var API = "https://api.github.com";
var API_VERSION = "2026-03-10";
var OWNER = "reacon-io";
var OWNER_ID2 = 334414696;
var MAX_RESPONSE = 2 * 1024 * 1024;
var RELEASE_PERMISSIONS = { metadata: "read", contents: "write", pull_requests: "write", actions: "write" };
var encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
var positiveId = (value) => Number.isSafeInteger(value) && value > 0;
var samePermissions = (actual, expected) => actual && Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([name, level]) => actual[name] === level);
function appJwt(clientId, privateKey, now = Date.now()) {
  if (typeof clientId !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(clientId)) throw new Error("Invalid GitHub App client ID");
  if (!Number.isFinite(now) || now < 0) throw new Error("Invalid clock");
  let key2;
  try {
    key2 = createPrivateKey(privateKey);
  } catch {
    throw new Error("Invalid GitHub App private key");
  }
  if (key2.asymmetricKeyType !== "rsa" || key2.asymmetricKeyDetails.modulusLength < 2048) throw new Error("GitHub App key must be RSA, at least 2048 bits");
  const seconds = Math.floor(now / 1e3);
  const input = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: clientId, iat: seconds - 60, exp: seconds + 540 })}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), key2).toString("base64url")}`;
}
async function githubRequest(fetchImpl, token, path, { method = "GET", body, expectedStatus = 200 } = {}) {
  if (typeof path !== "string") throw new Error("Invalid GitHub API path");
  const [pathname, query, ...extra] = path.split("?");
  const validatedPath = pathname.replace(/(\/compare\/[a-f0-9]{40})\.\.\.([a-f0-9]{40})$/, "$1-to-$2");
  if (!/^\/[A-Za-z0-9_/.-]+$/.test(pathname) || pathname.startsWith("//") || validatedPath.includes("..") || extra.length)
    throw new Error("Invalid GitHub API path");
  if (query !== void 0) {
    let decoded;
    try {
      decoded = decodeURIComponent(query);
    } catch {
      throw new Error("Invalid GitHub API path");
    }
    if (!/^[A-Za-z0-9_=&.:%/-]+$/.test(query) || !/^[A-Za-z0-9_=&.:/-]+$/.test(decoded) || decoded.includes(".."))
      throw new Error("Invalid GitHub API path");
  }
  let response;
  const readLease = method === "POST" && /^\/app\/installations\/[0-9]+\/access_tokens$/.test(path) && expectedStatus === 201 && Array.isArray(body?.repositories) && body.repositories.length === 1 && body.permissions && Object.keys(body.permissions).length > 0 && Object.values(body.permissions).every((value) => value === "read");
  const retryable = method === "GET" || readLease;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetchImpl(`${API}${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(3e4),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "reacon-sdk-release-access",
          ...body === void 0 ? {} : { "Content-Type": "application/json" }
        },
        ...body === void 0 ? {} : { body: JSON.stringify(body) }
      });
    } catch {
      throw new Error("GitHub API transport failed (details suppressed to protect credentials)");
    }
    if (!retryable || ![500, 502, 503, 504].includes(response.status) || attempt >= 2) break;
    await response.body?.cancel();
    await delay(1e3 * (attempt + 1));
  }
  if (response.status !== expectedStatus) {
    await response.body?.cancel();
    throw new Error(`GitHub API ${method} request failed: HTTP ${response.status}`);
  }
  if (expectedStatus === 204) {
    await response.body?.cancel();
    return;
  }
  const chunks = [];
  let length = 0;
  try {
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > MAX_RESPONSE) throw new Error("Response too large");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid GitHub API JSON response");
  }
}
function validateRepositoryInventory(inventory, packages) {
  if (inventory.formatVersion !== 1 || inventory.organization !== OWNER || inventory.organizationId !== OWNER_ID2) throw new Error("Unexpected GitHub organization");
  if (!positiveId(inventory.releaseApp?.appId) || !positiveId(inventory.releaseApp?.installationId) || typeof inventory.releaseApp?.clientId !== "string") throw new Error("Recorded GitHub App identities are required");
  if (!samePermissions(inventory.releaseApp?.permissions, RELEASE_PERMISSIONS)) throw new Error("Release app may only use the approved repository permissions");
  const repos = [inventory.releaseStateRepository, ...inventory.sdkRepositories];
  if (repos.length !== 10 || new Set(repos.map((repo) => repo.name)).size !== 10 || new Set(repos.map((repo) => repo.repositoryId)).size !== 10 || repos.some((repo) => !positiveId(repo.repositoryId) || !/^reacon-[a-z-]+$/.test(repo.name) || !/^[a-f0-9]{40}$/.test(repo.initialCommit))) throw new Error("Invalid repository inventory");
  if (inventory.releaseStateRepository.name !== "reacon-sdk-releases" || inventory.releaseStateRepository.visibility !== "private") throw new Error("Release state must remain private");
  if (inventory.sdkRepositories.length !== packages.length || packages.some((pkg) => inventory.sdkRepositories.filter((repo) => repo.family === pkg.id && `${OWNER}/${repo.name}` === pkg.repository).length !== 1)) throw new Error("SDK repository identities disagree");
  return repos.map((repo) => repo.name).sort();
}
function githubReleaseStateCredentials(options) {
  const access = options.access ?? "read";
  if (!["read", "write"].includes(access)) throw new Error("Explicit read/write state access required");
  return repositoryCredentials(options, "state", access);
}
function repositoryCredentials({ inventory, packages, clientId, privateKey, fetchImpl = fetch, now = Date.now, visibility }, purpose, access) {
  validateRepositoryInventory(inventory, packages);
  const expectedVisibility = purpose === "sdk" ? "public" : ["actions", "dispatch", "review"].includes(purpose) ? visibility : "private";
  const selected = purpose === "state" ? [inventory.releaseStateRepository] : inventory.sdkRepositories;
  const allowed = new Map(selected.map((repo) => [`${OWNER}/${repo.name}`, repo.repositoryId]));
  return async ({ repository }) => {
    if (!allowed.has(repository)) throw new Error(purpose === "state" ? "GitHub state token requires the private release-state repository" : "GitHub write token requires a selected SDK repository");
    const jwt = appJwt(clientId, privateKey, now());
    const app = await githubRequest(fetchImpl, jwt, "/app");
    if (app.id !== inventory.releaseApp.appId || clientId !== inventory.releaseApp.clientId || app.client_id !== clientId || app.slug !== inventory.releaseApp.desiredSlug || app.owner?.login !== OWNER || app.owner?.id !== OWNER_ID2 || app.owner?.type !== "Organization" || !samePermissions(app.permissions, RELEASE_PERMISSIONS)) throw new Error("Unexpected company GitHub App");
    const installation = await githubRequest(fetchImpl, jwt, `/orgs/${OWNER}/installation`);
    if (installation.id !== inventory.releaseApp.installationId || installation.app_id !== app.id || installation.app_slug !== app.slug || installation.account?.login !== OWNER || installation.account?.id !== OWNER_ID2 || installation.account?.type !== "Organization" || installation.repository_selection !== "selected" || installation.suspended_at !== null || !samePermissions(installation.permissions, RELEASE_PERMISSIONS)) throw new Error("Unexpected company GitHub installation");
    const permissions = {
      metadata: "read",
      contents: access,
      ...purpose === "review" ? { pull_requests: access } : {},
      ...["ci", "actions"].includes(purpose) ? { actions: "read" } : {},
      ...purpose === "dispatch" ? { actions: "write" } : {}
    };
    const grant = await githubRequest(fetchImpl, jwt, `/app/installations/${installation.id}/access_tokens`, {
      method: "POST",
      expectedStatus: 201,
      body: { repositories: [repository.split("/")[1]], permissions }
    });
    if (typeof grant.token !== "string" || !grant.token || /\s/.test(grant.token)) throw new Error("Invalid GitHub installation token");
    let handedOff = false, revoked = false;
    const revoke = async () => {
      if (revoked) return;
      await githubRequest(fetchImpl, grant.token, "/installation/token", { method: "DELETE", expectedStatus: 204 });
      revoked = true;
    };
    try {
      const expiresAt = Date.parse(grant.expires_at);
      if (!samePermissions(grant.permissions, permissions) || !Number.isFinite(expiresAt) || expiresAt - now() < 3e4 || expiresAt - now() > 65 * 6e4) throw new Error("GitHub write token is broader or longer-lived than requested");
      const listing = await githubRequest(fetchImpl, grant.token, "/installation/repositories?per_page=100");
      const repo = listing.repositories?.[0];
      if (listing.total_count !== 1 || !Array.isArray(listing.repositories) || listing.repositories.length !== 1 || repo?.full_name !== repository || repo.name !== repository.split("/")[1] || repo.id !== allowed.get(repository) || repo.owner?.login !== OWNER || repo.owner?.id !== OWNER_ID2 || repo.owner?.type !== "Organization" || repo.private !== (expectedVisibility === "private") || repo.archived || repo.disabled || repo.fork || repo.default_branch !== "main" || expiresAt - now() < 3e4) throw new Error("GitHub repository scope, visibility or ownership mismatch");
      handedOff = true;
      return {
        kind: "github-app-installation",
        repository,
        repositoryId: repo.id,
        organizationId: OWNER_ID2,
        installationId: installation.id,
        appId: app.id,
        visibility: expectedVisibility,
        permissions,
        token: grant.token,
        expiresAt,
        revoke
      };
    } finally {
      if (!handedOff) await revoke();
    }
  };
}

// scripts/public-api/lib/github-release-state.mjs
init_build_concurrency();
import { setTimeout as delay2 } from "node:timers/promises";
import { AsyncLocalStorage } from "node:async_hooks";

// scripts/public-api/lib/disjoint-release-state.mjs
import { isDeepStrictEqual as equal } from "node:util";
function rebaseFamilyEvent(base, proposed, current) {
  [base, proposed, current].forEach(validateReleaseState);
  const reject = () => {
    throw new ConcurrentReleaseState();
  };
  const id4 = base.activeReleaseId;
  if (!id4 || proposed.activeReleaseId !== id4 || current.activeReleaseId !== id4 || current.sequence < base.sequence) reject();
  const release = base.releases[id4], next = proposed.releases[id4], live = current.releases[id4];
  if (releasePhase(live) === "collision") reject();
  const without = (object, keys2) => Object.fromEntries(Object.entries(object).filter(([key2]) => !keys2.includes(key2)));
  const event = next.events.at(-1), noop = equal(base, proposed);
  const compatibilityEvent = !noop && event?.action === "compatibility_verified";
  const independentOfCompatibility = !noop && ["candidate_tested", "package_preview_authorized", "registry_observed", "public_install_verified"].includes(event?.action);
  const ignoreCompatibility = compatibilityEvent || independentOfCompatibility;
  if (!noop && proposed.sequence !== base.sequence + 1) reject();
  for (const state of [proposed, current]) {
    if (!equal(without(state, ["sequence", "releases", "baselines"]), without(base, ["sequence", "releases", "baselines"])) || !equal(without(state.releases, [id4]), without(base.releases, [id4])) || !equal(
      without(state.releases[id4], ["packages", "events", ...ignoreCompatibility ? ["compatibility"] : []]),
      without(release, ["packages", "events", ...ignoreCompatibility ? ["compatibility"] : []])
    )) reject();
  }
  if (!equal(live.events.slice(0, release.events.length), release.events)) reject();
  if (noop) return structuredClone(current);
  if (next.events.length !== release.events.length + 1 || !equal(next.events.slice(0, -1), release.events) || !equal(live.events.slice(0, release.events.length), release.events)) reject();
  if (compatibilityEvent) {
    if (!equal(next.packages, release.packages) || !equal(proposed.baselines, base.baselines) || !equal(live.compatibility, release.compatibility)) reject();
    for (const family3 of FAMILIES2) {
      const pkg = release.packages[family3];
      if (pkg.testEvidenceSha256 && !equal(
        without(pkg, ["units", "installEvidenceSha256", "preview"]),
        without(live.packages[family3], ["units", "installEvidenceSha256", "preview"])
      )) reject();
    }
    const merged2 = structuredClone(current);
    merged2.sequence++;
    merged2.releases[id4].compatibility = structuredClone(next.compatibility);
    merged2.releases[id4].events.push({
      ...event,
      sequence: merged2.sequence,
      at: event.at > live.events.at(-1).at ? event.at : live.events.at(-1).at
    });
    return validateReleaseState(merged2);
  }
  if (!equal(next.compatibility, release.compatibility)) reject();
  if (![
    "candidate_tested",
    "package_preview_authorized",
    "registry_observed",
    "publication_started",
    "previous_attempt_stopped",
    "public_install_verified",
    "central_deployment_updated",
    "central_publication_resumed"
  ].includes(event.action)) reject();
  const changed = FAMILIES2.filter((f) => !equal(release.packages[f], next.packages[f]) || !equal(base.baselines[f], proposed.baselines[f]));
  if (!changed.length && event.action === "registry_observed") {
    const merged2 = structuredClone(current);
    merged2.sequence++;
    merged2.releases[id4].events.push({ ...event, sequence: merged2.sequence, at: event.at > live.events.at(-1).at ? event.at : live.events.at(-1).at });
    return validateReleaseState(merged2);
  }
  if (changed.length !== 1) reject();
  const family2 = changed[0];
  if (!equal(live.packages[family2], release.packages[family2]) || !equal(current.baselines[family2], base.baselines[family2])) reject();
  const merged = structuredClone(current);
  merged.releases[id4].packages[family2] = structuredClone(next.packages[family2]);
  if (Object.hasOwn(proposed.baselines, family2)) merged.baselines[family2] = structuredClone(proposed.baselines[family2]);
  else delete merged.baselines[family2];
  merged.sequence++;
  merged.releases[id4].events.push({
    ...event,
    sequence: merged.sequence,
    at: event.at > live.events.at(-1).at ? event.at : live.events.at(-1).at
  });
  return validateReleaseState(merged);
}

// scripts/public-api/lib/ledger-commit-lock.mjs
import { spawn } from "node:child_process";
import { lstat as lstat2, realpath as realpath2 } from "node:fs/promises";
import { isAbsolute, join as join2 } from "node:path";
async function withLedgerCommitLock(operation, directory2 = process.env.REACON_BUILD_JOB_DIRECTORY, { name = "ledger-commit", timeoutSeconds = 180 } = {}) {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(name) || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 1200)
    throw Error("Invalid controller lock");
  if (!directory2) return operation();
  const stat = await lstat2(directory2);
  if (!isAbsolute(directory2) || await realpath2(directory2) !== directory2 || !stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 63) !== 0) throw Error("Owned private build job required for ledger lock");
  const child = spawn(
    "/usr/bin/flock",
    [
      "--exclusive",
      "--timeout",
      String(timeoutSeconds),
      join2(directory2, name + ".lock"),
      process.execPath,
      "--input-type=module",
      "-e",
      'process.stdout.write("locked\\n"); process.stdin.resume(); process.stdin.on("end",()=>process.exit(0));'
    ],
    { stdio: ["pipe", "pipe", "ignore"], env: { PATH: "/usr/bin:/bin" } }
  );
  const closed = new Promise((resolve6, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve6() : reject(Error("Ledger commit lock failed")));
  });
  child.stdin.on("error", () => {
  });
  closed.catch(() => {
  });
  try {
    await new Promise((resolve6, reject) => {
      child.stdout.once("data", (bytes) => bytes.toString() === "locked\n" ? resolve6() : reject(Error("Unexpected ledger lock response")));
      closed.then(() => reject(Error("Ledger lock exited before acquisition")), reject);
    });
    return await operation();
  } finally {
    child.stdin.end();
    await closed;
  }
}

// scripts/public-api/lib/github-release-state.mjs
var RELEASE_STATE_REPOSITORY = "reacon-io/reacon-sdk-releases";
var REMOTE = `https://github.com/${RELEASE_STATE_REPOSITORY}.git`;
async function githubReleaseStateStore({
  directory: directory2,
  access = "read",
  inventory,
  packages,
  clientId,
  privateKey,
  fetchImpl = fetch,
  now = Date.now,
  runGit = defaultRunGit,
  waitImpl = delay2,
  commitLockDirectory = process.env.REACON_BUILD_JOB_DIRECTORY,
  leaseReuseMilliseconds = 6e4
}) {
  if (!Number.isSafeInteger(leaseReuseMilliseconds) || leaseReuseMilliseconds < 0 || leaseReuseMilliseconds > 6e4)
    throw Error("State credential reuse must be between zero and 60000 milliseconds");
  if (!["read", "write"].includes(access)) throw new Error("State access must be read or write");
  const getCredentials = githubReleaseStateCredentials({ inventory, packages, clientId, privateKey, fetchImpl, now, access });
  const parent = resolve3(directory2);
  await mkdir2(parent, { recursive: true, mode: 448 });
  if (await realpath3(parent) !== parent) throw new Error("State cache parent cannot use symlinks");
  const cache = await mkdtemp(join3(parent, "github-state-"));
  let closed = false, credentialCleanupFailed = false;
  const transactions = new AsyncLocalStorage();
  const inOrder = serialQueue();
  const snapshots = /* @__PURE__ */ new Map();
  let pendingRead;
  let reusableLease, reuseUntil = 0, expiryTimer;
  const revokeLease = async () => {
    clearTimeout(expiryTimer);
    expiryTimer = void 0;
    if (!reusableLease) return;
    try {
      await reusableLease.revoke();
      reusableLease = void 0;
      reuseUntil = 0;
    } catch {
      credentialCleanupFailed = true;
      throw Error("GitHub state token revocation failed; stop and reconcile");
    }
  };
  const transaction = (operation, retainReadLease = false) => inOrder(async () => {
    if (closed) throw new Error("GitHub state store is closed");
    if (credentialCleanupFailed) throw new Error("GitHub state token revocation failed; stop and reconcile");
    if (reusableLease && now() >= reuseUntil) await revokeLease();
    const context = { lease: reusableLease };
    let passed = false;
    try {
      const result = await transactions.run(context, operation);
      passed = true;
      return result;
    } finally {
      if (!passed || !retainReadLease || now() >= reuseUntil) await revokeLease();
      else if (reusableLease && !expiryTimer) {
        expiryTimer = setTimeout(() => {
          expiryTimer = void 0;
          void inOrder(revokeLease).catch(() => {
          });
        }, Math.max(1, reuseUntil - now()));
        expiryTimer.unref();
      }
    }
  });
  const execute = async (args, input, env) => {
    if (closed) throw new Error("GitHub state store is closed");
    if (credentialCleanupFailed) throw new Error("GitHub state token revocation failed; stop and reconcile");
    const safeEnv = { PATH: "/usr/bin:/bin", HOME: cache, LANG: "C", LC_ALL: "C" };
    for (const key2 of [
      "GIT_CONFIG_NOSYSTEM",
      "GIT_CONFIG_GLOBAL",
      "GIT_ATTR_NOSYSTEM",
      "GIT_TERMINAL_PROMPT",
      "GIT_AUTHOR_NAME",
      "GIT_AUTHOR_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_COMMITTER_EMAIL",
      "GIT_INDEX_FILE"
    ]) {
      if (env[key2] !== void 0) safeEnv[key2] = env[key2];
    }
    const options = [
      "-c",
      "http.sslVerify=true",
      "-c",
      "http.followRedirects=false",
      "-c",
      "protocol.allow=never",
      "-c",
      "protocol.https.allow=always"
    ];
    if (!args.includes(REMOTE)) return runGit([...options, ...args], input, safeEnv);
    if (!args.includes("fetch") && !args.includes("push") || access === "read" && args.includes("push")) {
      throw new Error("Unexpected GitHub state transport operation");
    }
    const context = transactions.getStore();
    if (!context) throw new Error("GitHub state transport requires a scoped transaction");
    if (!context.lease) {
      context.lease = await getCredentials({ repository: RELEASE_STATE_REPOSITORY });
      reusableLease = context.lease;
      reuseUntil = Math.min(now() + leaseReuseMilliseconds, context.lease.expiresAt - 3e4);
    }
    const lease = context.lease;
    for (let attempt = 0; ; attempt++) {
      try {
        const authorization = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${lease.token}`).toString("base64")}`;
        return await runGit([...options, ...args], input, {
          ...safeEnv,
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: `http.${REMOTE}.extraheader`,
          GIT_CONFIG_VALUE_0: authorization
        });
      } catch (error) {
        if (!args.includes("fetch") || attempt >= 4 || !["repository-unavailable", "transport", "timeout"].includes(error.gitFailureCategory)) throw error;
      }
      await waitImpl(1e3 * 2 ** attempt);
    }
  };
  try {
    const store2 = await gitReleaseStateStore({ directory: cache, remote: REMOTE, runGit: execute });
    const read = async () => {
      const snapshot = await store2.read();
      if (snapshot.state.sequence === 0 && snapshot.commit !== inventory.releaseStateRepository.initialCommit) {
        throw new Error("Empty release state is only valid at the recorded bootstrap commit; reconcile repository history");
      }
      snapshots.set(snapshot.commit, structuredClone(snapshot.state));
      if (snapshots.size > 16) snapshots.delete(snapshots.keys().next().value);
      return snapshot;
    };
    return {
      read() {
        if (closed) return Promise.reject(new Error("GitHub state store is closed"));
        if (!pendingRead) {
          const operation = transaction(read, true).finally(() => {
            if (pendingRead === operation) pendingRead = void 0;
          });
          pendingRead = operation;
        }
        return pendingRead.then((snapshot) => structuredClone(snapshot));
      },
      async commit(request) {
        if (access !== "write") throw new Error("Read-only GitHub state store cannot commit");
        pendingRead = void 0;
        return transaction(() => withLedgerCommitLock(async () => {
          const base = snapshots.get(request.expectedCommit);
          const before = await read();
          let state = request.state;
          if (before.commit !== request.expectedCommit) {
            if (!base) throw new ConcurrentReleaseState();
            state = rebaseFamilyEvent(base, state, before.state);
          }
          const result = await store2.commit({ expectedCommit: before.commit, state });
          snapshots.set(result.commit, structuredClone(result.state));
          return result;
        }, commitLockDirectory));
      },
      remote: REMOTE,
      access,
      async close() {
        return inOrder(async () => {
          if (closed) return;
          closed = true;
          try {
            await revokeLease();
          } finally {
            await rm2(cache, { recursive: true, force: true });
          }
        });
      }
    };
  } catch (error) {
    closed = true;
    await rm2(cache, { recursive: true, force: true });
    throw error;
  }
}

// scripts/public-api/lib/github-artifact.mjs
import { createHash as createHash3 } from "node:crypto";
async function downloadGithubArtifact({ repository, artifact, token, maxBytes, fetchImpl = fetch }) {
  if (!/^reacon-io\/reacon-[a-z]+$/.test(repository) || !Number.isSafeInteger(artifact?.id) || artifact.id <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(artifact.size) || artifact.size <= 0 || artifact.size > maxBytes || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest) || artifact.expired !== false || typeof token !== "string" || !token)
    throw new Error("Invalid bounded GitHub artifact request");
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`, {
      redirect: "manual",
      signal: AbortSignal.timeout(3e4),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10"
      }
    });
    if (response.status !== 302) throw new Error();
    const url = new URL(response.headers.get("location"));
    await response.body?.cancel();
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || !(url.hostname.endsWith(".blob.core.windows.net") || url.hostname.endsWith(".actions.githubusercontent.com"))) throw new Error();
    const download = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(6e4) });
    if (download.status !== 200) throw new Error();
    const chunks = [];
    let size = 0;
    for await (const chunk of download.body) {
      size += chunk.length;
      if (size > maxBytes || size > artifact.size) throw new Error();
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== artifact.size || `sha256:${createHash3("sha256").update(bytes).digest("hex")}` !== artifact.digest) throw new Error();
    return bytes;
  } catch {
    throw new Error("GitHub artifact retrieval or digest verification failed; transport details suppressed");
  }
}

// scripts/public-api/lib/ruby-rust-upload.mjs
import { mkdtemp as mkdtemp2, writeFile, rm as rm3, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve as resolve4, join as join4 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
init_generator();

// scripts/public-api/lib/native-package-upload.mjs
import { spawn as spawn2 } from "node:child_process";
init_generator();
var NPM_METADATA = String.raw`
const {createRequire}=require('node:module');
const pacote=createRequire(process.argv[1])('pacote');
pacote.manifest(process.argv[2],{ignoreScripts:true,cache:process.argv[3],fullMetadata:true})
 .then(value=>console.log(JSON.stringify({name:value.name,version:value.version,publishConfig:value.publishConfig??{}})))
 .catch(()=>process.exit(1));
`;
var PYTHON_METADATA = String.raw`
import sys, tarfile, zipfile, email.parser, json
path = sys.argv[1]
if path.endswith('.whl'):
    with zipfile.ZipFile(path) as archive:
        entries = [entry for entry in archive.infolist() if entry.filename.endswith('.dist-info/METADATA')]
        if len(entries) != 1 or entries[0].file_size > 2 * 1024 * 1024: raise ValueError('Invalid wheel metadata')
        data = archive.read(entries[0])
else:
    with tarfile.open(path, 'r:gz') as archive:
        entries = [entry for entry in archive.getmembers() if entry.name.count('/') == 1 and entry.name.endswith('/PKG-INFO')]
        if len(entries) != 1 or not entries[0].isfile() or entries[0].size > 2 * 1024 * 1024: raise ValueError('Invalid sdist metadata')
        data = archive.extractfile(entries[0]).read()
metadata = email.parser.BytesParser().parsebytes(data)
if len(metadata.get_all('Name', [])) != 1 or len(metadata.get_all('Version', [])) != 1: raise ValueError('Ambiguous metadata')
print(json.dumps({'name': metadata['Name'], 'version': metadata['Version']}))
`;
async function runPublisherProcess({ command, args, cwd, env }) {
  return await new Promise((resolve6, reject) => {
    const child = spawn2(command, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let size = 0, failed = false, killTimer;
    function stop() {
      if (failed) return;
      failed = true;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
      }
      killTimer = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
        }
      }, 2e3);
    }
    const timer = setTimeout(stop, 12e4);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) stop();
      else chunks.push(chunk);
    });
    child.stderr.resume();
    const fail = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      const error = new Error("Native publisher command failed; details suppressed to protect credentials");
      try {
        const diagnostic = JSON.parse(Buffer.concat(chunks).toString("utf8")).error;
        const code = diagnostic?.code;
        if (["E401", "E403", "E404", "EOTP", "ENEEDAUTH", "EUSAGE", "EUNPROCESSABLE", "E422", "E409", "EPUBLISHCONFLICT", "EINTEGRITY", "EPRIVATE", "EINVALIDPROVENANCE"].includes(code)) error.publisherCode = code;
        if (error.publisherCode && typeof diagnostic.summary === "string") {
          let summary = diagnostic.summary;
          for (const [name, value] of Object.entries(env)) if (/TOKEN|PASSWORD|SECRET/i.test(name) && value) summary = summary.split(value).join("[redacted]");
          error.publisherSummary = summary.replace(/https?:\/\/\S+/g, "[url]").replace(/(?:npm_|gh[sopur]_)[A-Za-z0-9_]+/g, "[redacted]").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").replace(/[A-Za-z0-9_+/=-]{40,}/g, "[redacted]").slice(0, 1e3);
        }
      } catch {
      }
      reject(error);
    };
    child.once("error", fail);
    child.once("close", (code) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (failed || code !== 0) fail();
      else resolve6(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

// scripts/public-api/lib/ruby-rust-upload.mjs
var root2 = fileURLToPath2(new URL("../../../", import.meta.url));
var jsonBytes = (value) => Buffer.from(JSON.stringify(canonical(value), null, 2) + "\n");
var NAME = "reacon-sdk";
var registries = { ruby: "rubygems", rust: "crates.io" };
var endpoints = { ruby: "https://rubygems.org/api/v1/gems", rust: "https://crates.io/api/v1/crates/new" };
function encodeCrateUpload(metadata, bytes) {
  if (metadata?.name !== NAME || typeof metadata.vers !== "string" || !Array.isArray(metadata.deps)) throw new Error("Invalid crate upload metadata");
  const json = jsonBytes(metadata);
  if (json.length > 4 * 1024 * 1024 || bytes.length > 256 * 1024 * 1024) throw new Error("Crate upload exceeds supported limits");
  const jsonLength = Buffer.alloc(4), fileLength = Buffer.alloc(4);
  jsonLength.writeUInt32LE(json.length);
  fileLength.writeUInt32LE(bytes.length);
  return Buffer.concat([jsonLength, json, fileLength, bytes]);
}
async function inspectRetainedRubyRust({
  family: family2,
  identity: identity2,
  bytes,
  runProcess = runPublisherProcess,
  toolchainConfiguration = resolve4(root2, "sdk-generation/config/toolchain-images.json"),
  inspectorDirectory = resolve4(root2, "scripts/public-api")
}) {
  const directory2 = await mkdtemp2(join4(tmpdir(), "reacon-registry-archive-"));
  try {
    const file = join4(directory2, identity2.filename);
    await writeFile(file, bytes, { flag: "wx", mode: 256 });
    const config = JSON.parse(await readFile(toolchainConfiguration));
    const image = config.images[family2 === "ruby" ? "ruby" : "python"].image;
    if (!/^[a-z0-9/.-]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Inspector image must be pinned by digest");
    const script = family2 === "ruby" ? "inspect-ruby-package.rb" : "inspect-rust-package.py";
    const environment = { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: directory2, LANG: "C.UTF-8" };
    await runProcess({ command: "/usr/bin/docker", args: ["pull", image], cwd: directory2, env: environment });
    const args = [
      "run",
      "--pull=never",
      "--rm",
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=128",
      "--memory=512m",
      "--user",
      `${process.getuid()}:${process.getgid()}`,
      "--tmpfs=/tmp:rw,nosuid,nodev,size=64m",
      "--env",
      "HOME=/tmp",
      "--mount",
      `type=bind,source=${file},target=/input/${identity2.filename},readonly`,
      "--mount",
      `type=bind,source=${resolve4(inspectorDirectory, script)},target=/inspect/${script},readonly`,
      image,
      family2 === "ruby" ? "ruby" : "python",
      `/inspect/${script}`,
      `/input/${identity2.filename}`,
      identity2.version
    ];
    const result = JSON.parse(await runProcess({
      command: "/usr/bin/docker",
      args,
      cwd: directory2,
      env: environment
    }));
    return { ...result, inspectorImage: image };
  } finally {
    await rm3(directory2, { recursive: true, force: true });
  }
}
function rubyRustUploader({
  family: family2,
  getCredentials,
  inspectArchive = inspectRetainedRubyRust,
  fetchImpl = fetch,
  now = () => Date.now(),
  initialCrateBootstrapVersion
}) {
  if (!registries[family2]) throw new Error("Unsupported raw archive registry");
  if (initialCrateBootstrapVersion !== void 0 && (family2 !== "rust" || !/^0\.1\.0-beta\.\d+$/.test(initialCrateBootstrapVersion))) throw Error("Only the initial Rust beta supports API-token bootstrap");
  async function prepare(input) {
    const { identity: identity2, bytes } = input;
    if (identity2.registry !== registries[family2] || identity2.packageName !== NAME || !/^[0-9A-Za-z.-]+$/.test(identity2.version) || identity2.filename !== `${NAME}-${identity2.version}.${family2 === "ruby" ? "gem" : "crate"}` || bytes.length !== identity2.size || sha256(bytes) !== identity2.sha256) throw new Error("Retained archive identity mismatch");
    const inspected = await inspectArchive({ family: family2, identity: identity2, bytes });
    if (inspected.formatVersion !== 1 || inspected.publishable !== false || inspected.rebuilt !== false || inspected.executedPackageCode !== false) throw new Error("Invalid archive inspector result");
    if (family2 === "ruby") {
      if (inspected.kind !== "sdk-gem-upload-metadata" || inspected.name !== NAME || inspected.version !== identity2.version || inspected.platform !== "ruby" || !inspected.internalChecksumsVerified || inspected.rubyVersion !== "3.3.12" || inspected.rubygemsVersion !== "3.5.22") throw new Error("Gem metadata or toolchain mismatch");
    } else if (inspected.kind !== "sdk-crate-upload-metadata" || inspected.metadata?.name !== NAME || inspected.metadata.vers !== identity2.version || inspected.metadata.license !== "Apache-2.0") throw new Error("Crate metadata mismatch");
    const body = family2 === "ruby" ? bytes : encodeCrateUpload(inspected.metadata, bytes);
    return { body, report: {
      registry: identity2.registry,
      filename: identity2.filename,
      sha256: identity2.sha256,
      packageMetadataChecked: true,
      archiveFiles: inspected.archiveFiles,
      inspectorImage: inspected.inspectorImage,
      uploadBodySha256: sha256(body),
      uploadBodySize: body.length,
      ...family2 === "rust" ? { metadataSha256: sha256(jsonBytes(inspected.metadata)), dependencies: inspected.metadata.deps.length } : {},
      rebuilt: false,
      uploaded: false,
      publishable: false
    } };
  }
  return {
    preflight: async (input) => (await prepare(input)).report,
    upload: async (input) => {
      if (typeof input.assertCurrentIntent !== "function" || typeof getCredentials !== "function") throw new Error("Durable intent and explicit trusted-publisher credentials are required");
      const { identity: identity2 } = input;
      const { body } = await prepare(input);
      await input.assertCurrentIntent();
      const credential = await getCredentials({ registry: registries[family2], packageName: NAME });
      try {
        const trusted = credential.kind === "trusted-publisher" && credential.repository === `reacon-io/reacon-${family2}` && credential.workflow === "publish.yml" && credential.environment === "release" && credential.expiresAt <= now() + 36e5;
        const bootstrap = family2 === "rust" && initialCrateBootstrapVersion === identity2.version && credential.kind === "initial-crate-bootstrap" && credential.account === "reacon-achazal" && credential.version === identity2.version && credential.execution === "local-initial-beta-bootstrap" && credential.workloadIdentityVerified === false && credential.expiresAt <= now() + 7 * 864e5;
        if (!trusted && !bootstrap || credential.registry !== registries[family2] || credential.packageName !== NAME || typeof credential.token !== "string" || credential.token.length < 1 || /\s/.test(credential.token) || !Number.isFinite(credential.expiresAt) || credential.expiresAt <= now() + 3e4)
          throw new Error("Unexpected publication credential binding or lifetime");
        await input.assertCurrentIntent();
        let response;
        try {
          response = await fetchImpl(endpoints[family2], {
            method: family2 === "ruby" ? "POST" : "PUT",
            redirect: "error",
            signal: AbortSignal.timeout(12e4),
            headers: {
              Authorization: credential.token,
              "Content-Type": "application/octet-stream",
              Accept: family2 === "rust" ? "application/json" : "text/plain",
              "User-Agent": "Reacon-SDK-Releases/1.0 (https://github.com/reacon-io)"
            },
            body
          });
        } catch {
          throw new Error("Archive upload outcome is unknown; reconcile the registry");
        }
        if (!response.ok) {
          const chunks = [];
          let length = 0;
          try {
            for await (const chunk of response.body) {
              length += chunk.length;
              if (length > 16384) break;
              chunks.push(chunk);
            }
          } catch {
          }
          const detail = Buffer.concat(chunks).toString("utf8").split(credential.token).join("[redacted]").replace(/(?:npm_|gh[sopur]_)[A-Za-z0-9_]+/g, "[redacted]").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").replace(/[A-Za-z0-9_+/=-]{40,}/g, "[redacted]").slice(0, 2e3);
          const error = new Error(`Archive upload returned HTTP ${response.status}; reconcile the registry`);
          error.publicationDiagnostic = { stage: "registry-upload", status: response.status, reason: error.message, detail };
          throw error;
        }
        if (family2 === "rust") {
          const chunks = [];
          let size = 0;
          try {
            for await (const chunk of response.body) {
              size += chunk.length;
              if (size > 2 * 1024 * 1024) throw new Error();
              chunks.push(chunk);
            }
            const result = JSON.parse(Buffer.concat(chunks));
            if (!result || typeof result !== "object" || Array.isArray(result) || result.errors) throw new Error();
          } catch {
            throw new Error("Crate upload result requires registry reconciliation");
          }
        } else await response.body?.cancel();
        return { uploaded: true, registryVerificationRequired: true };
      } finally {
        if (typeof credential?.revoke === "function") await credential.revoke();
      }
    }
  };
}

// scripts/public-api/lib/nuget-registry.mjs
import { createHash as createHash4 } from "node:crypto";
init_generator();

// sdk-generation/ci/source/package-artifacts.mjs
var MAX_BYTES = 256 * 1024 * 1024;
function validateArtifactNames(family2, packageVersion, names2) {
  if (!Array.isArray(names2) || new Set(names2).size !== names2.length || names2.some((name) => !/^[A-Za-z0-9_.-]+$/.test(name))) throw new Error("Invalid package artifact filenames");
  const v = packageVersion;
  const maven = (name) => [`.jar`, `-sources.jar`, `-javadoc.jar`, `.pom`].map((suffix) => `${name}-${v}${suffix}`);
  const expected = {
    typescript: [`reacon-io-sdk-${v}.tgz`],
    go: [`.zip`, `.mod`, `.info`].map((suffix) => `v${v}${suffix}`),
    rust: [`reacon-sdk-${v}.crate`],
    php: [`reacon-sdk-${v}.zip`],
    ruby: [`reacon-sdk-${v}.gem`],
    java: maven("reacon-java"),
    kotlin: [...maven("reacon-kotlin"), `reacon-kotlin-${v}.module`],
    csharp: [`Reacon.Sdk.${v}.nupkg`],
    python: [`reacon_sdk-${v}-py3-none-any.whl`, `reacon_sdk-${v}.tar.gz`]
  }[family2];
  if (!expected || JSON.stringify([...names2].sort()) !== JSON.stringify(expected.sort())) throw new Error(`Missing or unexpected ${family2} package artifacts`);
}

// scripts/public-api/lib/package-artifacts.mjs
init_generator();
var MAX_BYTES2 = 256 * 1024 * 1024;

// scripts/public-api/lib/nuget-native.mjs
import { mkdtemp as mkdtemp3, readFile as readFile2, writeFile as writeFile2, rm as rm4 } from "node:fs/promises";
import { join as join5 } from "node:path";
import { tmpdir as tmpdir2 } from "node:os";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var root3 = fileURLToPath3(new URL("../../../", import.meta.url));
var serviceIndex = "https://api.nuget.org/v3/index.json";
var digest = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
function parseNugetVerification(output, fingerprints) {
  const identity2 = [...output.matchAll(/^Verifying ([A-Za-z0-9_.-]+)$/gm)];
  const hashes = [...output.matchAll(/^Content hash: ([A-Za-z0-9+/]{86}==)$/gm)];
  const repoBlocks = output.split(/^Signature type: Repository\r?$/m).slice(1);
  if (identity2.length !== 1 || hashes.length !== 1 || repoBlocks.length !== 1) throw new Error("Missing NuGet signature verification evidence");
  const repository = repoBlocks[0];
  const fingerprint = /^\s*SHA256 hash: ([A-Fa-f0-9]{64})\r?$/m.exec(repository)?.[1].toLowerCase();
  if (!repository.includes(`Service index: ${serviceIndex}`) || !fingerprints.includes(fingerprint)) throw new Error("NuGet signature is not from the advertised repository certificates");
  return {
    packageIdentity: identity2[0][1],
    contentSha512: hashes[0][1],
    repositoryFingerprint: fingerprint,
    repositorySignatureVerified: true
  };
}
async function inspectNugetArchive({
  bytes,
  version,
  fingerprints,
  verifySignature = false,
  runProcess = runPublisherProcess,
  toolchainConfiguration = join5(root3, "sdk-generation/config/toolchain-images.json"),
  inspectorPath = join5(root3, "scripts/public-api/inspect-nuget-package.py")
}) {
  const directory2 = await mkdtemp3(join5(tmpdir2(), "reacon-nuget-inspect-"));
  try {
    const file = join5(directory2, "package.nupkg");
    await writeFile2(file, bytes, { flag: "wx", mode: 256 });
    const config = JSON.parse(await readFile2(toolchainConfiguration));
    const image = config.images[verifySignature ? "csharp" : "python"].image;
    if (!/^[a-z0-9/.-]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error("NuGet inspector image must be pinned");
    const environment = { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: directory2, LANG: "C.UTF-8" };
    await runProcess({ command: "/usr/bin/docker", args: ["pull", image], cwd: directory2, env: environment });
    const args = [
      "run",
      "--pull=never",
      "--rm",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=128",
      "--memory=1g",
      "--user",
      `${process.getuid()}:${process.getgid()}`,
      "--tmpfs=/tmp:rw,nosuid,nodev,size=256m",
      "--env",
      "HOME=/tmp",
      "--env",
      "DOTNET_CLI_HOME=/tmp",
      "--env",
      "DOTNET_CLI_TELEMETRY_OPTOUT=1",
      "--env",
      "DOTNET_CLI_UI_LANGUAGE=en-US",
      "--env",
      "DOTNET_NUGET_SIGNATURE_VERIFICATION=true",
      "--mount",
      `type=bind,source=${file},target=/input/package.nupkg,readonly`
    ];
    if (verifySignature) {
      if (!Array.isArray(fingerprints) || !fingerprints.length || fingerprints.length > 20 || fingerprints.some((value) => !digest(value))) throw new Error("Explicit NuGet repository certificate policy is required");
      const certificates = fingerprints.map((value) => `<certificate fingerprint="${value}" hashAlgorithm="SHA256" allowUntrustedRoot="false" />`).join("");
      const policy = `<configuration><packageSources><clear /></packageSources><config><add key="signatureValidationMode" value="require" /></config><trustedSigners><clear /><repository name="nuget.org" serviceIndex="${serviceIndex}">${certificates}</repository></trustedSigners></configuration>`;
      await writeFile2(join5(directory2, "NuGet.Config"), policy, { flag: "wx", mode: 256 });
      args.push(
        "--mount",
        `type=bind,source=${join5(directory2, "NuGet.Config")},target=/input/NuGet.Config,readonly`,
        image,
        "dotnet",
        "nuget",
        "verify",
        "/input/package.nupkg",
        "--all",
        "--configfile",
        "/input/NuGet.Config",
        "--verbosity",
        "normal"
      );
    } else args.push(
      "--network=none",
      "--mount",
      `type=bind,source=${inspectorPath},target=/inspect.py,readonly`,
      image,
      "python",
      "-B",
      "/inspect.py",
      "/input/package.nupkg",
      version
    );
    const output = await runProcess({
      command: "/usr/bin/docker",
      args,
      cwd: directory2,
      env: environment
    });
    return { ...verifySignature ? parseNugetVerification(output, fingerprints) : JSON.parse(output), inspectorImage: image };
  } finally {
    await rm4(directory2, { recursive: true, force: true });
  }
}

// scripts/public-api/lib/nuget-registry.mjs
var INDEX = "https://api.nuget.org/v3/index.json";
var UPLOAD = "https://www.nuget.org/api/v2/package";
var jsonBytes2 = (value) => Buffer.from(JSON.stringify(canonical(value), null, 2) + "\n");
var hash512 = (value) => createHash4("sha512").update(value).digest("base64");
var digest2 = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
function nugetUnitIdentity(manifest, bytes) {
  if (manifest.formatVersion !== 1 || manifest.kind !== "sdk-package-artifacts" || manifest.family !== "csharp" || manifest.publishable !== false || !digest2(manifest.sourceSha256) || !digest2(manifest.contractSha256)) throw new Error("Invalid NuGet candidate");
  const version = renderReleaseVersion("csharp", manifest.canonicalVersion, { availability: manifest.canonicalVersion.includes("-") ? "private" : "public" });
  if (manifest.packageVersion !== version.packageVersion) throw new Error("NuGet version differs from candidate");
  validateArtifactNames("csharp", manifest.packageVersion, Object.keys(manifest.files));
  const filename = `Reacon.Sdk.${manifest.packageVersion}.nupkg`, file = manifest.files[filename];
  if (!digest2(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 256 * 1024 * 1024 || file.size !== bytes.length || sha256(bytes) !== file.sha256) throw new Error("Retained NuGet archive changed");
  const identity2 = {
    formatVersion: 1,
    kind: "sdk-nuget-content",
    registry: "nuget",
    packageName: "Reacon.Sdk",
    version: manifest.packageVersion,
    contentSha512: hash512(bytes)
  };
  return { identity: identity2, identitySha256: sha256(jsonBytes2(identity2)), filename, file };
}
function nugetUploader({ getCredentials, inspectArchive = inspectNugetArchive, fetchImpl = fetch, now = () => Date.now() }) {
  async function prepare({ identity: identity2, bytes, filename, file }) {
    if (identity2.kind !== "sdk-nuget-content" || identity2.registry !== "nuget" || identity2.packageName !== "Reacon.Sdk" || !/^[0-9A-Za-z.-]+$/.test(identity2.version) || filename !== `Reacon.Sdk.${identity2.version}.nupkg` || bytes.length !== file.size || sha256(bytes) !== file.sha256 || hash512(bytes) !== identity2.contentSha512) throw new Error("NuGet upload differs from retained identity");
    const report = await inspectArchive({ bytes, version: identity2.version });
    if (report.kind !== "sdk-nuget-upload-metadata" || report.formatVersion !== 1 || report.name !== identity2.packageName || report.version !== identity2.version || report.contentSha512 !== identity2.contentSha512 || report.unsigned !== true || report.rebuilt !== false || report.executedPackageCode !== false || report.publishable !== false) throw new Error("Unexpected NuGet metadata inspection");
    return { ...report, submittedSha256: file.sha256, submittedSize: file.size, uploaded: false };
  }
  return {
    preflight: prepare,
    upload: async (input) => {
      if (typeof input.assertCurrentIntent !== "function" || typeof getCredentials !== "function") throw new Error("NuGet requires durable intent and explicit OIDC credentials");
      try {
        await prepare(input);
      } catch (error) {
        error.publicationDiagnostic = { stage: "nuget-preflight", reason: "Retained archive inspection failed", errorCode: error.code ?? null };
        throw error;
      }
      await input.assertCurrentIntent();
      const credential = await getCredentials({ registry: "nuget", packageName: "Reacon.Sdk" });
      if (credential.kind !== "trusted-publisher" || credential.registry !== "nuget" || credential.packageName !== "Reacon.Sdk" || credential.repository !== "reacon-io/reacon-csharp" || credential.workflow !== "publish.yml" || credential.environment !== "release" || typeof credential.token !== "string" || !credential.token || /\s/.test(credential.token) || !Number.isFinite(credential.expiresAt) || credential.expiresAt <= now() + 3e4 || credential.expiresAt > now() + 36e5) throw new Error("Unexpected NuGet credential binding");
      const body = new FormData();
      body.append("package", new Blob([input.bytes], { type: "application/octet-stream" }), input.filename);
      await input.assertCurrentIntent();
      let response;
      try {
        response = await fetchImpl(UPLOAD, {
          method: "PUT",
          body,
          redirect: "error",
          signal: AbortSignal.timeout(12e4),
          headers: { "X-NuGet-ApiKey": credential.token, "X-NuGet-Protocol-Version": "4.1.0", "User-Agent": "Reacon-SDK-Releases/1.0 (https://github.com/reacon-io)" }
        });
      } catch {
        throw new Error("NuGet upload outcome unknown; reconcile before retry");
      }
      if (![201, 202].includes(response.status)) {
        const chunks = [];
        let length = 0;
        try {
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length > 16384) break;
            chunks.push(chunk);
          }
        } catch {
        }
        const reason = Buffer.concat(chunks).toString("utf8").split(credential.token).join("[redacted]").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").replace(/[A-Za-z0-9_+\/=-]{40,}/g, "[redacted]").slice(0, 2e3);
        const error = new Error(`NuGet upload returned HTTP ${response.status}; reconcile before retry`);
        error.publicationDiagnostic = { stage: "nuget-upload", status: response.status, reason };
        throw error;
      }
      await response.body?.cancel();
      return { uploaded: true, registryVerificationRequired: true };
    }
  };
}
async function nugetRegistry({
  manifest: input,
  readArtifact,
  retainEvidence,
  store: store2,
  upload,
  verifyArchive = inspectNugetArchive,
  fetchImpl = fetch,
  now = () => (/* @__PURE__ */ new Date()).toISOString()
}) {
  const manifest = structuredClone(input), manifestSha256 = sha256(jsonBytes2(manifest));
  if (typeof readArtifact !== "function" || typeof retainEvidence !== "function") throw new Error("Retained NuGet storage required");
  const file = Object.values(manifest.files ?? {})[0];
  if (!digest2(file?.sha256)) throw new Error("Invalid NuGet artifact reference");
  const original = Buffer.from(await readArtifact(file.sha256));
  const expected = nugetUnitIdentity(manifest, original), { identity: identity2, identitySha256 } = expected;
  function bind(subject) {
    const pkg = subject.package;
    if (subject.family !== "csharp" || subject.unit !== "nuget" || pkg?.canonicalVersion !== manifest.canonicalVersion || pkg.packageVersion !== manifest.packageVersion || pkg.sourceSha256 !== manifest.sourceSha256 || pkg.artifactManifestSha256 !== manifestSha256 || pkg.units?.nuget?.identitySha256 !== identitySha256 || subject.contractSha256 !== manifest.contractSha256) throw new Error("NuGet subject differs from retained candidate");
  }
  async function inspect(subject) {
    bind(subject);
    const evidence = {
      formatVersion: 1,
      kind: "sdk-registry-observation",
      registry: "nuget",
      packageName: identity2.packageName,
      version: identity2.version,
      expectedIdentitySha256: identitySha256,
      observedAt: now(),
      requests: []
    };
    async function retained(bytes) {
      const result = await retainEvidence(bytes);
      if (result?.sha256 !== sha256(bytes)) throw new Error("NuGet evidence retention mismatch");
      return result.sha256;
    }
    async function get(url, binary = false) {
      const address = new URL(url);
      if (address.origin !== "https://api.nuget.org" || address.username || address.password || address.hash || address.search) throw new Error("Unexpected NuGet public endpoint");
      const record = { url };
      evidence.requests.push(record);
      let response;
      try {
        response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(3e4), headers: { Accept: binary ? "application/octet-stream" : "application/json" } });
      } catch {
        record.outcome = "transport-error";
        return {};
      }
      record.status = response.status;
      if (response.status !== 200) {
        await response.body?.cancel();
        return { status: response.status };
      }
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > (binary ? 256 : 2) * 1024 * 1024) throw new Error();
          chunks.push(chunk);
        }
      } catch {
        record.outcome = "invalid-body";
        return {};
      }
      const bytes = Buffer.concat(chunks);
      record.bodySha256 = await retained(bytes);
      record.size = bytes.length;
      if (binary) return { status: 200, bytes };
      try {
        return { status: 200, data: JSON.parse(bytes) };
      } catch {
        return {};
      }
    }
    async function finish(status, reason, actualIdentity) {
      Object.assign(evidence, { status, reason, ...actualIdentity ? { actualIdentity } : {} });
      return {
        status,
        evidenceSha256: await retained(jsonBytes2(evidence)),
        ...actualIdentity ? { identitySha256: sha256(jsonBytes2(actualIdentity)) } : {}
      };
    }
    const unknown = (reason) => finish("unknown", reason);
    const conflict = (reason) => finish("found", reason, { kind: "sdk-registry-conflict", expectedIdentitySha256: identitySha256, reason });
    const index = await get(INDEX);
    if (!Array.isArray(index.data?.resources)) return unknown("service-index-unavailable");
    const resource = (type) => {
      const matches = index.data.resources.filter((value) => value?.["@type"] === type);
      if (matches.length !== 1) return null;
      try {
        const url = new URL(matches[0]["@id"]);
        if (url.origin !== "https://api.nuget.org" || url.username || url.password || url.search || url.hash) return null;
        return url.href;
      } catch {
        return null;
      }
    };
    const base = resource("PackageBaseAddress/3.0.0"), registration = resource("RegistrationsBaseUrl/3.6.0"), signatures = resource("RepositorySignatures/5.0.0");
    if (!base?.endsWith("/") || !registration?.endsWith("/") || !signatures) return unknown("untrusted-service-resources");
    const id4 = identity2.packageName.toLowerCase(), version = identity2.version.toLowerCase();
    const versions = await get(`${base}${id4}/index.json`);
    if (versions.status === 404) return finish("absent", "package-not-found");
    if (!Array.isArray(versions.data?.versions) || versions.data.versions.some((value) => typeof value !== "string")) return unknown("invalid-version-index");
    if (!versions.data.versions.includes(version)) return finish("absent", "version-not-found");
    const details = await get(`${registration}${id4}/${version}.json`);
    if (details.data?.listed === false) return conflict("package-unlisted");
    const download = `${base}${id4}/${version}/${id4}.${version}.nupkg`;
    if (details.data?.listed !== true || details.data.packageContent !== download) return unknown("registration-unavailable");
    const certificates = await get(signatures);
    const list = certificates.data?.signingCertificates;
    if (certificates.data?.allRepositorySigned !== true || !Array.isArray(list) || !list.length || list.length > 20) return unknown("repository-signature-policy-unavailable");
    const fingerprints = list.map((value) => value?.fingerprints?.["2.16.840.1.101.3.4.2.1"]);
    if (fingerprints.some((value) => !digest2(value))) return unknown("invalid-repository-certificates");
    const downloaded = await get(download, true);
    if (downloaded.status !== 200) return unknown("package-download-unavailable");
    let verified;
    try {
      verified = await verifyArchive({ bytes: downloaded.bytes, version, fingerprints, verifySignature: true });
    } catch {
      return unknown("signature-verification-failed");
    }
    if (verified.repositorySignatureVerified !== true || verified.packageIdentity !== `Reacon.Sdk.${identity2.version}` || !fingerprints.includes(verified.repositoryFingerprint) || !/^[A-Za-z0-9+/]{86}==$/.test(verified.contentSha512 ?? "")) return unknown("invalid-signature-evidence");
    evidence.signatureVerificationSha256 = await retained(jsonBytes2(verified));
    return finish("found", "verified-nuget-content", { ...identity2, contentSha512: verified.contentSha512 });
  }
  async function publish(subject) {
    bind(subject);
    if (!store2 || typeof upload !== "function") throw new Error("NuGet publication requires durable state and an uploader");
    async function assertCurrentIntent() {
      const { state } = await store2.read(), release = state.releases[subject.releaseId], pkg = release?.packages.csharp;
      const unit = pkg?.units.nuget, attempt = unit?.attempts.at(-1);
      const observed = Date.parse(now());
      if (state.activeReleaseId !== subject.releaseId || release?.sourceRevision !== subject.sourceRevision || release.contractSha256 !== manifest.contractSha256 || pkg?.artifactManifestSha256 !== manifestSha256 || unit?.identitySha256 !== identitySha256 || unit.state !== "publishing" || attempt?.attemptId !== subject.attemptId || attempt.runId !== subject.runId || attempt.stoppedEvidenceSha256 || !Number.isFinite(observed) || !publicationAuthorized(release, "csharp", observed)) throw new Error("No current durable NuGet publication intent");
    }
    await assertCurrentIntent();
    const bytes = Buffer.from(await readArtifact(file.sha256));
    nugetUnitIdentity(manifest, bytes);
    await upload({ ...expected, bytes, assertCurrentIntent });
  }
  return { inspect, publish, manifestSha256, ...expected };
}

// scripts/public-api/lib/registry-oidc.mjs
var REGISTRIES = {
  python: { name: "pypi", audience: "pypi", exchange: "https://pypi.org/_/oidc/mint-token" },
  ruby: { name: "rubygems", audience: "rubygems.org", exchange: "https://rubygems.org/api/v1/oidc/trusted_publisher/exchange_token" },
  rust: { name: "crates.io", audience: "crates.io", exchange: "https://crates.io/api/v1/trusted_publishing/tokens" },
  csharp: { name: "nuget", audience: "https://www.nuget.org", exchange: "https://www.nuget.org/api/v2/token" }
};
var tokenString = (value) => typeof value === "string" && value.length > 0 && value.length < 32768 && !/\s/.test(value);
var userAgent = "Reacon-SDK-Releases/1.0 (https://github.com/reacon-io)";
function registryOidcCredentials({ family: family2, environment, nugetUsername, tokenProvider, fetchImpl = fetch, now = () => Date.now() }) {
  const registry = REGISTRIES[family2];
  if (!registry) throw new Error("Unsupported trusted-publishing registry");
  if (family2 === "csharp" && (typeof nugetUsername !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(nugetUsername))) throw new Error("Verified NuGet policy-creator username is required");
  const env = { ...environment }, repository = `reacon-io/reacon-${family2}`;
  const workflowRef = `${repository}/.github/workflows/publish.yml@refs/heads/main`;
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== repository || !/^[1-9]\d*$/.test(env.GITHUB_REPOSITORY_ID ?? "") || env.GITHUB_REPOSITORY_OWNER_ID !== "334414696" || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_WORKFLOW_REF !== workflowRef || env.GITHUB_SERVER_URL !== "https://github.com" || env.RUNNER_ENVIRONMENT !== "github-hosted" || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "") || !tokenString(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)) throw new Error("Expected company publishing workflow OIDC environment");
  let oidcUrl;
  try {
    oidcUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (oidcUrl.protocol !== "https:" || !oidcUrl.hostname.endsWith(".actions.githubusercontent.com") || oidcUrl.port || oidcUrl.username || oidcUrl.password || oidcUrl.hash) throw new Error();
  } catch {
    throw new Error("Unexpected GitHub OIDC endpoint");
  }
  if (oidcUrl.searchParams.has("audience")) throw new Error("Unexpected preselected GitHub OIDC audience");
  const requestUrl = `${env.ACTIONS_ID_TOKEN_REQUEST_URL}${oidcUrl.search ? "&" : "?"}audience=${encodeURIComponent(registry.audience)}`;
  async function request(url, init, json = true) {
    let response;
    try {
      response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(3e4) });
    } catch {
      throw new Error("Trusted-publisher request failed; response details suppressed");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Trusted-publisher request returned HTTP ${response.status}`);
    }
    if (!json) {
      await response.body?.cancel();
      return;
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 65536) throw new Error();
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks));
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
      return data;
    } catch {
      throw new Error("Invalid trusted-publisher response; details suppressed");
    }
  }
  return async ({ registry: requestedRegistry, packageName }) => {
    if (requestedRegistry !== registry.name || packageName !== (family2 === "csharp" ? "Reacon.Sdk" : "reacon-sdk")) throw new Error("Unexpected credential request");
    let github;
    if (tokenProvider !== void 0) {
      if (typeof tokenProvider !== "function") throw new Error("Invalid registry OIDC token provider");
      try {
        github = { value: await tokenProvider(registry.audience) };
      } catch {
        throw new Error("Registry OIDC token request failed; details suppressed");
      }
    } else github = await request(requestUrl, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`, Accept: "application/json" } });
    let claims;
    try {
      if (!tokenString(github.value) || github.value.split(".").length !== 3) throw new Error();
      claims = JSON.parse(Buffer.from(github.value.split(".")[1], "base64url"));
      const seconds = now() / 1e3;
      if (claims.iss !== "https://token.actions.githubusercontent.com" || claims.aud !== registry.audience || claims.sub !== `repo:reacon-io@334414696/reacon-${family2}@${env.GITHUB_REPOSITORY_ID}:environment:release` || claims.environment !== "release" || claims.repository !== repository || claims.repository_id !== env.GITHUB_REPOSITORY_ID || claims.repository_owner_id !== "334414696" || claims.ref !== env.GITHUB_REF || claims.sha !== env.GITHUB_SHA || claims.workflow_ref !== workflowRef || claims.job_workflow_ref !== void 0 && claims.job_workflow_ref !== workflowRef || claims.runner_environment !== "github-hosted" || claims.run_id !== env.GITHUB_RUN_ID || claims.run_attempt !== env.GITHUB_RUN_ATTEMPT || !Number.isFinite(claims.exp) || claims.exp < seconds + 30 || !Number.isFinite(claims.iat) || claims.iat > seconds + 30 || claims.iat < seconds - 600 || claims.nbf !== void 0 && (!Number.isFinite(claims.nbf) || claims.nbf > seconds + 30)) throw new Error();
    } catch {
      throw new Error("GitHub OIDC claims do not match the current company release job");
    }
    const issuedBefore = now();
    const result = await request(registry.exchange, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent,
        ...family2 === "csharp" ? { Authorization: `Bearer ${github.value}` } : {}
      },
      body: JSON.stringify(family2 === "csharp" ? { username: nugetUsername, tokenType: "ApiKey" } : family2 === "python" ? { token: github.value } : { jwt: github.value })
    });
    const token = family2 === "ruby" ? result.rubygems_api_key : family2 === "csharp" ? result.apiKey : result.token;
    const expiresAt = family2 === "ruby" ? Date.parse(result.expires_at) : issuedBefore + (family2 === "csharp" ? 60 : family2 === "python" ? 15 : 30) * 60 * 1e3;
    if (!tokenString(token) || !Number.isFinite(expiresAt) || expiresAt <= now() + 3e4 || expiresAt > now() + 36e5 || family2 === "ruby" && (!Array.isArray(result.scopes) || result.scopes.length !== 1 || result.scopes[0] !== "push_rubygem" || result.gem !== void 0 && result.gem?.name !== "reacon-sdk")) throw new Error("Unexpected registry token scope or lifetime");
    let revoked = false;
    return {
      kind: "trusted-publisher",
      registry: registry.name,
      packageName,
      repository,
      workflow: "publish.yml",
      environment: "release",
      token,
      expiresAt,
      ...family2 === "rust" ? { revoke: async () => {
        if (revoked) return;
        await request(registry.exchange, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent } }, false);
        revoked = true;
      } } : {}
    };
  };
}
async function qualifyRegistryOidc({ maskCredential, ...options }) {
  if (!["python", "ruby", "rust", "csharp"].includes(options.family) || typeof maskCredential !== "function")
    throw new Error("Explicit supported registry qualification and credential masking are required");
  const request = {
    registry: REGISTRIES[options.family].name,
    packageName: options.family === "csharp" ? "Reacon.Sdk" : "reacon-sdk"
  };
  const credential = await registryOidcCredentials(options)(request);
  try {
    maskCredential(credential.token);
    return {
      registry: credential.registry,
      packageName: credential.packageName,
      repository: credential.repository,
      workflow: credential.workflow,
      environment: credential.environment,
      expiresAt: new Date(credential.expiresAt).toISOString(),
      credentialPersisted: false,
      packageUploaded: false,
      ...options.family === "rust" ? { temporaryTokenRevoked: true } : {}
    };
  } finally {
    try {
      if (typeof credential.revoke === "function") await credential.revoke();
    } finally {
      credential.token = void 0;
    }
  }
}

// sdk-generation/release/github-bootstrap.json
var github_bootstrap_default = {
  formatVersion: 1,
  observedOn: "2026-09-27",
  observationMethod: "Signed-in GitHub browser, reacon-achazal; each repository creation and resulting private repository page verified",
  organization: "reacon-io",
  organizationId: 334414696,
  plan: "Team",
  administrator: "reacon-achazal",
  releaseStateRepository: {
    name: "reacon-sdk-releases",
    visibility: "private",
    defaultBranch: "main",
    initialCommit: "a9a9d44f9b932ab03e99f0b0c2581303c846251c",
    initialContents: [
      "README.md"
    ],
    repositoryId: 1390806251
  },
  sdkRepositories: [
    {
      family: "typescript",
      name: "reacon-typescript",
      initialCommit: "a481d0040701bdfa725c7ebc5288c859878cc5af",
      initialContents: [
        "README.md",
        "LICENSE"
      ],
      repositoryId: 1390807111,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "b9a81e0f1004d344a9ca65bbe05def9e0f4c062d",
      sdkPullRequest: "https://github.com/reacon-io/reacon-typescript/pull/1",
      mainSourceMerged: true,
      sdkReviewCommit: "95ae03e9d148743bf614ced3d9c1d747daa96e75",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "95ae03e9d148743bf614ced3d9c1d747daa96e75",
        passed: true,
        report: "sdk-generation/release/typescript-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:45:46.302Z"
      },
      mainCommit: "38709040091eab679d85665ea7bd188f00ca4f4f",
      mainCi: {
        commit: "38709040091eab679d85665ea7bd188f00ca4f4f",
        passed: true,
        observedAt: "2026-09-27T18:13:12.286Z",
        report: "sdk-generation/release/typescript-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/typescript-source-promotion.json"
    },
    {
      family: "python",
      name: "reacon-python",
      initialCommit: "78f8516ee313e68a061b9453bc05223e9f891033",
      initialContents: [
        "README.md"
      ],
      repositoryId: 1390807788,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "359526376b302227e7bdbed48b2913cdeb51f14b",
      sdkPullRequest: "https://github.com/reacon-io/reacon-python/pull/1",
      mainSourceMerged: true,
      sdkReviewCommit: "ab62221ad559f82c9901087a4980d263e12cd222",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "ab62221ad559f82c9901087a4980d263e12cd222",
        passed: true,
        report: "sdk-generation/release/python-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:47:11.181Z"
      },
      mainCommit: "0cda0f5deff7e54c2a7a3ec2b0fd04e9794fe416",
      mainCi: {
        commit: "0cda0f5deff7e54c2a7a3ec2b0fd04e9794fe416",
        passed: true,
        observedAt: "2026-09-27T18:13:12.285Z",
        report: "sdk-generation/release/python-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/python-source-promotion.json"
    },
    {
      family: "go",
      name: "reacon-go",
      initialCommit: "17b65cd8e63738e1bb371eae07cad391ac37e72a",
      initialContents: [
        "README.md"
      ],
      repositoryId: 1390808315,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "206c46773f1b184a2339e0634cc4e810fd869edb",
      privateDraftPullRequest: "https://github.com/reacon-io/reacon-go/pull/1",
      mainSourceMerged: true,
      releasesPublished: false,
      sdkReviewCommit: "966fa080bd480cbc49d5a7dc05114152833fb2e3",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "966fa080bd480cbc49d5a7dc05114152833fb2e3",
        passed: true,
        report: "sdk-generation/release/go-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:35:01.079Z"
      },
      sdkPullRequest: "https://github.com/reacon-io/reacon-go/pull/1",
      mainCommit: "882b9b0462cdada1ea574d48e80f8464755bc828",
      mainCi: {
        commit: "882b9b0462cdada1ea574d48e80f8464755bc828",
        passed: true,
        observedAt: "2026-09-27T18:13:12.434Z",
        report: "sdk-generation/release/go-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/go-source-promotion.json"
    },
    {
      family: "rust",
      name: "reacon-rust",
      initialCommit: "9f6b62e2ec3d8ca63518ef1a7b7ae8ee9914746e",
      initialContents: [
        "README.md"
      ],
      repositoryId: 1390808889,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "995115351cedbf01f33e3bd5ccf9924532e795fe",
      sdkPullRequest: "https://github.com/reacon-io/reacon-rust/pull/1",
      mainSourceMerged: true,
      sdkReviewCommit: "14448cc874ed72774ca35fb5edc3c44fd48c4c35",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "14448cc874ed72774ca35fb5edc3c44fd48c4c35",
        passed: true,
        report: "sdk-generation/release/rust-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:59:03.095Z"
      },
      mainCommit: "3db7a85ed41753dcb64f1e239af29fefa862b73b",
      mainCi: {
        commit: "3db7a85ed41753dcb64f1e239af29fefa862b73b",
        passed: true,
        observedAt: "2026-09-27T18:18:53.185Z",
        report: "sdk-generation/release/rust-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/rust-source-promotion.json"
    },
    {
      family: "php",
      name: "reacon-php",
      initialCommit: "5f1bf2497e4099a4be2fad39adf374919b8c8f9d",
      initialContents: [
        "README.md"
      ],
      repositoryId: 1390809378,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "b579654a7e398e5ef5eae0d1a8b7012e1aca3bbc",
      privateDraftPullRequest: "https://github.com/reacon-io/reacon-php/pull/1",
      mainSourceMerged: true,
      releasesPublished: false,
      sdkReviewCommit: "7833ea6f17ca2e42f6951f23359fd90d308315fb",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "7833ea6f17ca2e42f6951f23359fd90d308315fb",
        passed: true,
        report: "sdk-generation/release/php-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:34:37.212Z"
      },
      sdkPullRequest: "https://github.com/reacon-io/reacon-php/pull/1",
      mainCommit: "05382bd873807229a6d0db994995ff939a876158",
      mainCi: {
        commit: "05382bd873807229a6d0db994995ff939a876158",
        passed: true,
        observedAt: "2026-09-27T18:13:12.277Z",
        report: "sdk-generation/release/php-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/php-source-promotion.json"
    },
    {
      family: "ruby",
      name: "reacon-ruby",
      initialCommit: "b50c7c2cbae4453ea584d5f596a0d33615cb3354",
      initialContents: [
        "README.md"
      ],
      repositoryId: 1390809984,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "7f86dbe1a481de2c7028e2a31656544ac4425a27",
      sdkPullRequest: "https://github.com/reacon-io/reacon-ruby/pull/1",
      mainSourceMerged: true,
      sdkReviewCommit: "f992a8baf0a302dd0f98f7dc62acf06621c64c93",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "f992a8baf0a302dd0f98f7dc62acf06621c64c93",
        passed: true,
        report: "sdk-generation/release/ruby-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:47:11.123Z"
      },
      mainCommit: "9a7899943d4d15ba7bfa9e6ffd74dd0a90bce67d",
      mainCi: {
        commit: "9a7899943d4d15ba7bfa9e6ffd74dd0a90bce67d",
        passed: true,
        observedAt: "2026-09-27T18:15:33.221Z",
        report: "sdk-generation/release/ruby-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/ruby-source-promotion.json"
    },
    {
      family: "java",
      name: "reacon-java",
      initialCommit: "0a80ff3daeaf9ddc3c1812a0df4e06342be9ef5f",
      initialContents: [
        "README.md"
      ],
      repositoryId: 1390810718,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "5df350103385f43c636554d396050571ce836693",
      sdkPullRequest: "https://github.com/reacon-io/reacon-java/pull/1",
      mainSourceMerged: true,
      sdkReviewCommit: "1ca4f231f726eacb0ae2c6cd6934a1667e48a0aa",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "1ca4f231f726eacb0ae2c6cd6934a1667e48a0aa",
        passed: true,
        report: "sdk-generation/release/java-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:50:05.074Z"
      },
      mainCommit: "04d6a1cf499a9d5824b1b3694b22f912873d5463",
      mainCi: {
        commit: "04d6a1cf499a9d5824b1b3694b22f912873d5463",
        passed: true,
        observedAt: "2026-09-27T18:15:33.215Z",
        report: "sdk-generation/release/java-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/java-source-promotion.json"
    },
    {
      family: "kotlin",
      name: "reacon-kotlin",
      initialCommit: "38837d6408b10a19bfb5288eda4033b472b984f9",
      initialContents: [
        "README.md"
      ],
      repositoryId: 1390811441,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "9614bca16561f76a56a6cf33dc4c206058693732",
      sdkPullRequest: "https://github.com/reacon-io/reacon-kotlin/pull/1",
      mainSourceMerged: true,
      sdkReviewCommit: "3d8dacb54cf121bfd0ef985053983f91d41d5dbb",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "3d8dacb54cf121bfd0ef985053983f91d41d5dbb",
        passed: true,
        report: "sdk-generation/release/kotlin-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:59:02.536Z"
      },
      mainCommit: "30559160d59a0b05fdf0f5ef88ab15310dd8e3c6",
      mainCi: {
        commit: "30559160d59a0b05fdf0f5ef88ab15310dd8e3c6",
        passed: true,
        observedAt: "2026-09-27T18:18:53.213Z",
        report: "sdk-generation/release/kotlin-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/kotlin-source-promotion.json"
    },
    {
      family: "csharp",
      name: "reacon-csharp",
      initialCommit: "f160fd0f5e3d7f7ea9630b448b0b60fe1d8be101",
      initialContents: [
        "README.md"
      ],
      repositoryId: 1390811914,
      sdkSourcePushed: true,
      sdkSourceBranch: "codex/sdk-source-0.1.0-beta.1",
      sdkSourceCommit: "b41c34f0542bc08196bccd4c1d33e88ec97dafb6",
      sdkPullRequest: "https://github.com/reacon-io/reacon-csharp/pull/1",
      mainSourceMerged: true,
      sdkReviewCommit: "ad25eba0310611e7a735a307cfc632bbec18e247",
      sourceCi: {
        scope: "private-draft-branch",
        workflow: ".github/workflows/ci.yml",
        commit: "ad25eba0310611e7a735a307cfc632bbec18e247",
        passed: true,
        report: "sdk-generation/release/csharp-repository-ci.json",
        mainInstalled: true,
        releaseQualification: false,
        observedAt: "2026-09-27T17:59:02.673Z"
      },
      mainCommit: "4b76a66ce1b5e4fd90d9f1fd061ece50c05443ab",
      mainCi: {
        commit: "4b76a66ce1b5e4fd90d9f1fd061ece50c05443ab",
        passed: true,
        observedAt: "2026-09-27T18:18:53.221Z",
        report: "sdk-generation/release/csharp-main-ci.json",
        releaseQualification: false
      },
      promotionReport: "sdk-generation/release/csharp-source-promotion.json"
    }
  ],
  sdkRepositoryDefaults: {
    visibility: "private",
    defaultBranch: "main",
    sdkSourcePushed: true,
    releasesPublished: false
  },
  releaseApp: {
    status: "installed-authentication-verified",
    desiredName: "Reacon SDK Releases",
    desiredSlug: "reacon-sdk-releases",
    registrationUrl: "https://github.com/organizations/reacon-io/settings/apps/new",
    owner: "reacon-io",
    installationSelection: "selected-repositories-only",
    permissions: {
      metadata: "read",
      contents: "write",
      pull_requests: "write",
      actions: "write"
    },
    webhooks: false,
    userAuthorization: false,
    privateKeyStored: true,
    installationVerified: true,
    appId: 5098070,
    clientId: "Iv23liget0AY8Kz3UVo3",
    installationId: 165498005,
    settingsUrl: "https://github.com/organizations/reacon-io/settings/apps/reacon-sdk-releases",
    installationUrl: "https://github.com/organizations/reacon-io/settings/installations/165498005",
    installationVerificationMethod: "Signed-in installation settings: success notice, selected repository mode, exact ten names and approved permissions",
    authenticationVerified: true,
    unavailableKeyFingerprint: "SHA256:N+JRD0Z4ma3fZeVnZfWHoD49hURMk5he2ICMEs3m9io=",
    keyDownloadStatus: "User-downloaded replacement secured locally; Downloads copy removed after byte comparison",
    authenticationVerifiedAt: "2026-09-27T17:08:39.365Z",
    activeKeyFingerprint: "SHA256:vqaxcIt1+WFePAu/ZtiTBr5UKKLIGkiQbbGeLcMZ4VU=",
    activeKeyId: 4630649,
    keyStorage: "owner-only-local-file-outside-repository",
    secretStoreConfigured: false,
    obsoleteKeyRevoked: true,
    obsoleteKeyRevokedAt: "2026-09-27T17:10:16.565Z",
    obsoleteKeyRevocationEvidence: "Signed-in GitHub settings show only the replacement fingerprint and disable deleting the sole remaining key",
    ownershipAuditReport: "github-access-audit.json",
    ownershipAuditReportSha256: "1013916248403bf41bb709c7e16d4dec8dda016b73f568d26249bbcb66847994",
    stateReadReport: "github-state-read.json",
    stateReadReportSha256: "94c4e84f77fa42bc51dbaf19e30b5db82a71769147f93e34b5dc91cc5f56357c"
  },
  protectionsConfigured: false,
  publisherWorkflowsConfigured: false,
  publishable: false,
  mainBranchProtection: {
    rulesetId: 24079930,
    url: "https://github.com/organizations/reacon-io/settings/rules/24079930",
    enforcement: "active",
    target: "default-branches-of-nine-sdk-repositories",
    releaseStateExcluded: true,
    pullRequestsRequired: true,
    requiredApprovals: 0,
    requiredCheck: "sdk-conformance",
    checkSource: "GitHub Actions (enforced by additive ruleset 24080557)",
    strictStatusChecks: true,
    blockForcePushes: true,
    blockDeletion: true,
    bypassActors: [],
    bypassObservationMethod: "saved signed-in organization UI",
    report: "sdk-generation/release/github-main-protection.json",
    completeReleaseProtection: false,
    sourceBindingSetup: {
      status: "active-verified",
      rulesetId: 24080557,
      url: "https://github.com/organizations/reacon-io/settings/rules/24080557",
      file: "sdk-generation/release/github-conformance-source.ruleset.json",
      expectedIntegrationId: 15368,
      enforcement: "active",
      bypassActors: [],
      scope: "default-branches-of-nine-sdk-repositories",
      verifiedBy: "saved administrator UI and per-repository effective-rule API",
      report: "sdk-generation/release/github-main-protection.json"
    }
  },
  tagProtection: {
    target: "refs/tags/v* in the nine SDK repositories",
    releaseStateExcluded: true,
    immutability: {
      rulesetId: 24080341,
      enforcement: "active",
      rules: [
        "update",
        "deletion",
        "non_fast_forward"
      ],
      bypassActors: []
    },
    creation: {
      rulesetId: 24080398,
      enforcement: "active",
      rules: [
        "creation"
      ],
      bypassActors: [
        {
          actorType: "Integration",
          actorId: 5098070,
          name: "Reacon SDK Releases",
          mode: "always"
        }
      ]
    },
    bypassObservationMethod: "saved signed-in organization ruleset editor; read-only API omits bypass actors",
    report: "sdk-generation/release/github-main-protection.json",
    writeProbePerformed: false
  },
  releaseEnvironments: {
    status: "configured-main-only",
    report: "sdk-generation/release/github-release-environments.json",
    count: 9,
    liveJobVerified: false
  }
};

// scripts/public-api/lib/file-publication-targets.mjs
var units = { typescript: ["npm"], python: ["wheel", "sdist"], ruby: ["gem"], rust: ["crate"], csharp: ["nuget"] };
var labels = { typescript: "npm", python: "PyPI", ruby: "RubyGems", rust: "crates.io", csharp: "NuGet" };
function filePublicationTarget(family2) {
  const record = github_bootstrap_default.sdkRepositories.find((item) => item.family === family2);
  if (!Object.hasOwn(units, family2) || !record || record.name !== `reacon-${family2}` || !Number.isSafeInteger(record.repositoryId) || github_bootstrap_default.organization !== "reacon-io" || github_bootstrap_default.organizationId !== 334414696) throw Error("Unsupported company file publisher");
  return {
    family: family2,
    repository: `reacon-io/${record.name}`,
    repositoryId: record.repositoryId,
    units: [...units[family2]],
    label: labels[family2]
  };
}

// scripts/public-api/lib/file-publication-worker.mjs
init_generator();

// scripts/public-api/lib/file-registry.mjs
import { createHash as createHash5 } from "node:crypto";
init_generator();
var MAX_FILE = 256 * 1024 * 1024;
var jsonBytes3 = (value) => Buffer.from(JSON.stringify(canonical(value), null, 2) + "\n");
var names = { typescript: "@reacon-io/sdk", python: "reacon-sdk", ruby: "reacon-sdk", rust: "reacon-sdk" };
var registries2 = { typescript: "npm", python: "pypi", ruby: "rubygems", rust: "crates.io" };
var familyUnits = { typescript: { npm: ".tgz" }, python: { wheel: ".whl", sdist: ".tar.gz" }, ruby: { gem: ".gem" }, rust: { crate: ".crate" } };
var digest3 = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
function registryUnitIdentity(manifest, unit) {
  if (!names[manifest.family] || manifest.formatVersion !== 1 || manifest.kind !== "sdk-package-artifacts" || manifest.publishable !== false || !digest3(manifest.sourceSha256) || !digest3(manifest.contractSha256)) throw new Error("Invalid registry candidate");
  const rendered = renderReleaseVersion(manifest.family, manifest.canonicalVersion, {
    availability: manifest.canonicalVersion.includes("-") ? "private" : "public"
  });
  if (rendered.packageVersion !== manifest.packageVersion) throw new Error("Registry version does not match candidate");
  validateArtifactNames(manifest.family, manifest.packageVersion, Object.keys(manifest.files));
  for (const file of Object.values(manifest.files)) if (!digest3(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE) throw new Error("Invalid registry file identity");
  const suffix = familyUnits[manifest.family]?.[unit];
  if (!suffix) throw new Error("Unsupported registry publication unit");
  const filename = Object.keys(manifest.files).find((name) => name.endsWith(suffix));
  const identity2 = {
    formatVersion: 1,
    kind: "sdk-registry-file",
    registry: registries2[manifest.family],
    packageName: names[manifest.family],
    version: manifest.packageVersion,
    filename,
    ...manifest.files[filename]
  };
  return { identity: identity2, identitySha256: sha256(jsonBytes3(identity2)) };
}
function artifactFileRegistry({
  manifest: input,
  readArtifact,
  retainEvidence,
  store: store2,
  upload,
  fetchImpl = fetch,
  now = () => (/* @__PURE__ */ new Date()).toISOString()
}) {
  const manifest = structuredClone(input), manifestSha256 = sha256(jsonBytes3(manifest));
  if (!familyUnits[manifest.family]) throw new Error("Unsupported file registry");
  for (const unit of Object.keys(familyUnits[manifest.family])) registryUnitIdentity(manifest, unit);
  if (typeof readArtifact !== "function" || typeof retainEvidence !== "function") throw new Error("Retained artifact and evidence storage are required");
  function bind(subject) {
    const expected = registryUnitIdentity(manifest, subject.unit), pkg = subject.package;
    if (subject.family !== manifest.family || pkg?.canonicalVersion !== manifest.canonicalVersion || pkg.packageVersion !== manifest.packageVersion || pkg.artifactManifestSha256 !== manifestSha256 || pkg.sourceSha256 !== manifest.sourceSha256 || subject.contractSha256 !== manifest.contractSha256 || pkg.units?.[subject.unit]?.identitySha256 !== expected.identitySha256) throw new Error("Registry subject differs from retained candidate");
    return expected;
  }
  async function get(url, evidence, maxBytes) {
    const parsed = new URL(url);
    const hosts = {
      typescript: ["registry.npmjs.org"],
      python: ["pypi.org", "files.pythonhosted.org"],
      ruby: ["rubygems.org"],
      rust: ["crates.io", "static.crates.io"]
    }[manifest.family];
    if (parsed.protocol !== "https:" || !hosts.includes(parsed.hostname) || parsed.port || parsed.username || parsed.password || parsed.hash) throw new Error("Untrusted registry URL");
    let response;
    const pypiMetadata = manifest.family === "python" && parsed.hostname === "pypi.org" && maxBytes !== MAX_FILE;
    try {
      response = await fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(3e4),
        headers: {
          Accept: pypiMetadata ? "application/vnd.pypi.simple.v1+json" : maxBytes === MAX_FILE ? "application/octet-stream" : "application/json",
          ...pypiMetadata ? { "Accept-Encoding": "identity" } : {},
          "User-Agent": "Reacon-SDK-Releases/1.0 (https://github.com/reacon-io)"
        }
      });
    } catch {
      evidence.requests.push({ url, outcome: "transport-error" });
      return { status: 0 };
    }
    const entry = { url, status: response.status };
    evidence.requests.push(entry);
    if (pypiMetadata) {
      entry.acceptEncoding = "identity";
      const serial = response.headers.get("x-pypi-last-serial");
      if (/^[0-9]{1,20}$/.test(serial ?? "")) entry.pypiLastSerial = serial;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: response.status };
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maxBytes) throw new Error("Oversized registry response");
        chunks.push(chunk);
      }
    } catch {
      entry.outcome = "invalid-body";
      return { status: 0 };
    }
    const bytes = Buffer.concat(chunks), stored = await retainEvidence(bytes);
    if (stored?.sha256 !== sha256(bytes)) throw new Error("Registry response was not retained correctly");
    entry.bodySha256 = stored.sha256;
    entry.size = bytes.length;
    return { status: 200, bytes };
  }
  async function inspect(subject) {
    const { identity: identity2, identitySha256 } = bind(subject);
    const evidence = {
      formatVersion: 1,
      kind: "sdk-registry-observation",
      observedAt: now(),
      registry: identity2.registry,
      packageName: identity2.packageName,
      version: identity2.version,
      unit: subject.unit,
      expectedIdentitySha256: identitySha256,
      requests: []
    };
    async function finish(status, actualIdentity2, reason) {
      Object.assign(evidence, { status, reason, ...actualIdentity2 ? { actualIdentity: actualIdentity2 } : {} });
      const bytes = jsonBytes3(evidence), reference = await retainEvidence(bytes);
      if (reference?.sha256 !== sha256(bytes)) throw new Error("Registry observation was not retained correctly");
      return {
        status,
        evidenceSha256: reference.sha256,
        ...actualIdentity2 ? { identitySha256: sha256(jsonBytes3(actualIdentity2)) } : {}
      };
    }
    const unknown = (reason) => finish("unknown", null, reason);
    const collision = (reason) => finish("found", {
      kind: "sdk-registry-conflict",
      expectedIdentitySha256: identitySha256,
      reason,
      observationsSha256: sha256(jsonBytes3(evidence.requests))
    }, reason);
    const url = {
      typescript: `https://registry.npmjs.org/@reacon-io%2Fsdk/${identity2.version}`,
      python: "https://pypi.org/simple/reacon-sdk/",
      ruby: `https://rubygems.org/api/v2/rubygems/reacon-sdk/versions/${identity2.version}.json?platform=ruby`,
      rust: `https://crates.io/api/v1/crates/reacon-sdk/${identity2.version}`
    }[manifest.family];
    const metadata = await get(url, evidence, 2 * 1024 * 1024);
    if (metadata.status === 404) return finish("absent", null, "version-not-found");
    if (metadata.status !== 200) return unknown("metadata-unavailable");
    let data;
    try {
      data = JSON.parse(metadata.bytes);
    } catch {
      return unknown("invalid-metadata");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return unknown("invalid-metadata");
    let downloadUrl, published;
    if (manifest.family === "typescript") {
      if (data.name !== identity2.packageName || data.version !== identity2.version) return collision("package-metadata-mismatch");
      downloadUrl = data.dist?.tarball;
      if (downloadUrl !== `https://registry.npmjs.org/@reacon-io/sdk/-/sdk-${identity2.version}.tgz`) return unknown("unexpected-tarball-url");
      published = data.dist;
    } else if (manifest.family === "python") {
      if (typeof data.name !== "string" || data.name.toLowerCase().replace(/[-_.]+/g, "-") !== identity2.packageName) return collision("package-metadata-mismatch");
      if (!/^1\.[0-9]+$/.test(data.meta?.["api-version"] ?? "") || !Array.isArray(data.files)) return unknown("invalid-file-index");
      const allowed = Object.keys(manifest.files), seen = /* @__PURE__ */ new Set();
      const escapedVersion = identity2.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const releaseFilename = new RegExp(`^reacon[-_.]+sdk[-_]${escapedVersion}(?:[-.]|$)`, "i");
      const releaseFiles = [];
      for (const file of data.files) {
        if (!file || typeof file.filename !== "string") return unknown("invalid-file-index");
        if (!/^reacon[-_.]+sdk[-_]/i.test(file.filename)) return collision("unexpected-release-file");
        if (!releaseFilename.test(file.filename)) continue;
        if (!allowed.includes(file.filename) || seen.has(file.filename)) return collision("unexpected-release-file");
        seen.add(file.filename);
        releaseFiles.push(file);
      }
      published = releaseFiles.find((file) => file.filename === identity2.filename);
      if (!published) return finish("absent", null, "file-not-yet-uploaded");
      if (published.yanked !== false) return published.yanked === true ? collision("file-yanked") : unknown("invalid-yank-status");
      downloadUrl = published.url;
      try {
        const parsed = new URL(downloadUrl);
        if (parsed.origin !== "https://files.pythonhosted.org" || parsed.username || parsed.password || parsed.search || parsed.hash || !parsed.pathname.startsWith("/packages/") || decodeURIComponent(parsed.pathname.split("/").at(-1)) !== identity2.filename) throw new Error();
      } catch {
        return unknown("unexpected-file-url");
      }
    }
    if (manifest.family === "ruby") {
      if (data.name !== identity2.packageName || data.version !== identity2.version || data.platform !== "ruby") return collision("package-metadata-mismatch");
      if (data.yanked !== false) return data.yanked === true ? collision("file-yanked") : unknown("invalid-yank-status");
      downloadUrl = `https://rubygems.org/gems/${identity2.filename}`;
      if (data.gem_uri !== downloadUrl || !digest3(data.sha)) return unknown("invalid-gem-metadata");
      published = data;
    } else if (manifest.family === "rust") {
      published = data.version;
      if (published?.crate !== identity2.packageName || published.num !== identity2.version) return collision("package-metadata-mismatch");
      if (published.yanked !== false) return published.yanked === true ? collision("file-yanked") : unknown("invalid-yank-status");
      if (!digest3(published.checksum)) return unknown("invalid-crate-checksum");
      downloadUrl = `https://static.crates.io/crates/reacon-sdk/${identity2.filename}`;
    }
    const content = await get(downloadUrl, evidence, MAX_FILE);
    if (content.status !== 200) return unknown("package-download-unavailable");
    const actualIdentity = { ...identity2, sha256: sha256(content.bytes), size: content.bytes.length };
    if (manifest.family === "typescript") {
      const integrity = `sha512-${createHash5("sha512").update(content.bytes).digest("base64")}`;
      if (published.integrity !== integrity) return collision("registry-integrity-mismatch");
    } else if (manifest.family === "python") {
      if (published.hashes?.sha256 !== actualIdentity.sha256 || published.size !== actualIdentity.size) return collision("registry-integrity-mismatch");
    } else if ((manifest.family === "ruby" ? published.sha : published.checksum) !== actualIdentity.sha256) return collision("registry-integrity-mismatch");
    return finish("found", actualIdentity, "downloaded-file-identity");
  }
  async function publish(subject) {
    const { identity: identity2, identitySha256 } = bind(subject);
    if (!store2 || typeof upload !== "function") throw new Error("Publication requires durable state and a trusted uploader");
    async function assertCurrentIntent() {
      const current = await store2.read(), release = current.state.releases[subject.releaseId];
      const pkg = release?.packages[subject.family], unit = pkg?.units?.[subject.unit], attempt = unit?.attempts.at(-1);
      const observedAt = Date.parse(now());
      if (current.state.activeReleaseId !== subject.releaseId || release?.sourceRevision !== subject.sourceRevision || release.contractSha256 !== subject.contractSha256 || pkg?.artifactManifestSha256 !== manifestSha256 || Object.values(release.packages).some((candidate) => Object.values(candidate.units ?? {}).some((item) => item.state === "collision")) || unit?.identitySha256 !== identitySha256 || unit.state !== "publishing" || attempt?.attemptId !== subject.attemptId || attempt.runId !== subject.runId || attempt.stoppedEvidenceSha256 || !Number.isFinite(observedAt) || !publicationAuthorized(release, subject.family, observedAt)) throw new Error("No current durable publication intent");
    }
    await assertCurrentIntent();
    const bytes = Buffer.from(await readArtifact(identity2.sha256));
    if (sha256(bytes) !== identity2.sha256 || bytes.length !== identity2.size) throw new Error("Retained publication bytes changed");
    await upload({ identity: identity2, bytes, attemptId: subject.attemptId, runId: subject.runId, assertCurrentIntent });
  }
  return { inspect, publish, manifestSha256 };
}

// scripts/public-api/lib/file-publication-worker.mjs
async function runFilePublicationWorker({
  family: family2,
  unitName,
  identity: identity2,
  releaseId: releaseId2,
  attemptId,
  store: store2,
  loadPackage,
  upload,
  retainEvidence,
  verifyArchive,
  fetchImpl = fetch,
  now = () => (/* @__PURE__ */ new Date()).toISOString(),
  wait = (ms) => new Promise((resolve6) => setTimeout(resolve6, ms)),
  waitForIntentMs = 6e5
}) {
  const { repositoryId, units: units2 } = filePublicationTarget(family2);
  if (!repositoryId || !units2.includes(unitName) || identity2.family !== family2 || identity2.repository !== `reacon-io/reacon-${family2}` || identity2.repositoryId !== repositoryId || identity2.visibility !== "public" || identity2.signatureVerified !== true || identity2.environment !== "release" || identity2.workerId !== `gh-${identity2.repositoryId}-${identity2.runId}-${identity2.runAttempt}` || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(releaseId2 ?? "") || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(attemptId ?? "") || !Number.isSafeInteger(waitForIntentMs) || waitForIntentMs < 0 || waitForIntentMs > 6e5) {
    throw new Error("Expected a verified public company file publisher identity and bounded attempt");
  }
  const started = Date.parse(now());
  if (!Number.isFinite(started)) throw new Error("Valid publication clock required");
  const timings = { startedAt: new Date(started).toISOString() };
  let snapshot, release, pkg, unit;
  for (; ; ) {
    snapshot = await store2.read();
    validateReleaseState(snapshot.state);
    release = snapshot.state.releases[releaseId2];
    pkg = release?.packages[family2];
    unit = pkg?.units?.[unitName];
    if (snapshot.state.activeReleaseId !== releaseId2 || !release || release.superseded || releasePhase(release) === "collision" || !pkg?.testEvidenceSha256 || !unit || !publicationAuthorized(release, family2, now())) {
      throw new Error("Coordinator has not qualified an active, compatible SDK candidate");
    }
    const attempt = unit.attempts.at(-1);
    if (attempt?.attemptId === attemptId && attempt.runId === identity2.workerId && !attempt.stoppedEvidenceSha256) {
      if (!["publishing", "uncertain", "published"].includes(unit.state)) throw new Error("Attempt has no publication intent");
      break;
    }
    if (attempt && !attempt.stoppedEvidenceSha256 || !["ready", "absent"].includes(unit.state)) throw new Error("Another publication attempt owns this unit");
    if (Date.parse(now()) - started >= waitForIntentMs) throw new Error("No durable intent arrived for this worker; nothing uploaded");
    await wait(5e3);
  }
  timings.intentReadyAt = now();
  let loaded;
  try {
    loaded = await loadPackage();
  } catch {
    timings.completedAt = now();
    return {
      formatVersion: 1,
      kind: "sdk-file-publication-worker",
      family: family2,
      unit: unitName,
      observedAt: timings.completedAt,
      timings,
      releaseId: releaseId2,
      attemptId,
      workerId: identity2.workerId,
      repository: identity2.repository,
      workflowCommit: identity2.workflowCommit,
      stateCommit: snapshot.commit,
      artifactManifestSha256: pkg.artifactManifestSha256,
      identitySha256: unit.identitySha256,
      sourceRevision: release.sourceRevision,
      contractSha256: release.contractSha256,
      uploadAttempted: false,
      uploadReturned: false,
      uploadFailure: { stage: "package-load", reason: "Package retrieval or extraction failed before upload" },
      packagePublished: false,
      releaseStateUpdated: false,
      publicInstallVerified: false
    };
  }
  timings.packageLoadedAt = now();
  const manifest = {
    formatVersion: 1,
    kind: "sdk-package-artifacts",
    family: family2,
    canonicalVersion: pkg.canonicalVersion,
    packageVersion: pkg.packageVersion,
    sourceSha256: pkg.sourceSha256,
    contractSha256: release.contractSha256,
    files: loaded.files,
    publishable: false
  };
  const manifestSha256 = sha256(Buffer.from(JSON.stringify(canonical(manifest), null, 2) + "\n"));
  const native = family2 === "csharp" ? nugetUnitIdentity(manifest, loaded.bytes) : null;
  const expected = native ? { ...native, identity: { ...native.identity, ...native.file } } : registryUnitIdentity(manifest, unitName);
  if (manifestSha256 !== pkg.artifactManifestSha256 || expected.identitySha256 !== unit.identitySha256 || !Buffer.isBuffer(loaded.bytes) || loaded.bytes.length !== expected.identity.size || sha256(loaded.bytes) !== expected.identity.sha256) throw new Error("CI package differs from the qualified release");
  const subject = {
    releaseId: releaseId2,
    sourceRevision: release.sourceRevision,
    contractSha256: release.contractSha256,
    family: family2,
    unit: unitName,
    package: structuredClone(pkg),
    attemptId,
    runId: identity2.workerId
  };
  const registry = await (family2 === "csharp" ? nugetRegistry : artifactFileRegistry)({
    manifest,
    store: store2,
    upload,
    fetchImpl,
    now,
    retainEvidence,
    ...verifyArchive ? { verifyArchive } : {},
    readArtifact: async (digest4) => {
      if (digest4 !== expected.identity.sha256) throw new Error("Unexpected artifact request");
      return loaded.bytes;
    }
  });
  const observations = [];
  const inspect = async () => {
    const startedAt = now(), observation = await registry.inspect(subject);
    observations.push({ startedAt, completedAt: now(), ...observation });
    return observation;
  };
  const before = await inspect();
  let uploadAttempted = false, uploadReturned = false, uploadFailure = null;
  if (before.status === "found" && before.identitySha256 !== expected.identitySha256) throw new Error("Registry version collision; nothing uploaded");
  if (before.status === "absent" && unit.state === "publishing") {
    uploadAttempted = true;
    timings.uploadStartedAt = now();
    try {
      await registry.publish(subject);
      uploadReturned = true;
      timings.uploadReturnedAt = now();
    } catch (error) {
      const known = [
        "Git state command failed",
        "GitHub state token revocation failed; stop and reconcile",
        "No current durable publication intent",
        "npm would publish a different package identity",
        "Bootstrap credential must belong to the dedicated Reacon work account",
        "Initial npm registration requires a prerelease and explicit bootstrap credential",
        "Native publisher command failed; details suppressed to protect credentials",
        "Gem metadata or toolchain mismatch",
        "Invalid archive inspector result",
        "Unexpected trusted-publisher credential binding or lifetime",
        "Unexpected registry token scope or lifetime",
        "GitHub OIDC claims do not match the current company release job",
        "Registry OIDC token request failed; details suppressed",
        "Trusted-publisher request failed; response details suppressed",
        "Invalid trusted-publisher response; details suppressed",
        "Archive upload outcome is unknown; reconcile the registry",
        "NuGet upload outcome unknown; reconcile before retry",
        "No current durable NuGet publication intent",
        "Unexpected NuGet credential binding"
      ];
      const recognizedStatus = /^(?:Trusted-publisher request returned HTTP [1-5][0-9]{2}|Archive upload returned HTTP [1-5][0-9]{2}; reconcile the registry)$/.test(error.message);
      uploadFailure = error.publicationDiagnostic ?? { stage: "upload", reason: known.includes(error.message) || recognizedStatus ? error.message : "Unrecognized upload error; details suppressed" };
    }
  }
  if (uploadAttempted) timings.uploadFinishedAt = now();
  let after = uploadAttempted ? await inspect() : before;
  let propagationChecks = 0;
  while (uploadAttempted && after.status !== "found" && propagationChecks < 12 && !(family2 === "typescript" && uploadReturned && after.status === "absent")) {
    await wait(5e3);
    after = await inspect();
    propagationChecks++;
  }
  timings.completedAt = now();
  return {
    formatVersion: 1,
    kind: "sdk-file-publication-worker",
    family: family2,
    unit: unitName,
    observedAt: timings.completedAt,
    timings,
    observations,
    awaitingRegistry: uploadReturned && uploadFailure === null && after.status === "absent",
    releaseId: releaseId2,
    attemptId,
    workerId: identity2.workerId,
    repository: identity2.repository,
    workflowCommit: identity2.workflowCommit,
    stateCommit: snapshot.commit,
    artifactManifestSha256: manifestSha256,
    identitySha256: expected.identitySha256,
    sourceRevision: release.sourceRevision,
    contractSha256: release.contractSha256,
    ciArtifact: loaded.ciArtifact,
    uploadAttempted,
    uploadReturned,
    uploadFailure,
    before,
    after,
    propagationChecks,
    packagePublished: after.status === "found" && after.identitySha256 === expected.identitySha256,
    releaseStateUpdated: false,
    publicInstallVerified: false
  };
}

// sdk-generation/ci/publisher/publish-file.mjs
init_generator();
var directory = dirname2(fileURLToPath4(import.meta.url));
var configuration = JSON.parse(await readFile3(join6(directory, "configuration.json")));
var identity = await githubPublisherIdentity({ configuration, environment: process.env, tokenProvider: () => getIDToken() });
var family = identity.family;
if (!["ruby", "rust", "csharp"].includes(family)) throw Error("Gem, crate or NuGet publisher required");
var target = filePublicationTarget(family);
var releaseId = process.env.REACON_RELEASE_ID;
var attemptPrefix = process.env.REACON_ATTEMPT_ID;
if (!/^[a-z0-9][a-z0-9-]{0,69}$/.test(attemptPrefix ?? "")) throw Error("Bounded unique attempt prefix required");
await mkdir3("sdk-release-results", { recursive: true });
await writeFile3("sdk-release-results/identity.json", JSON.stringify(identity, null, 2) + "\n");
if (process.env.REACON_QUALIFY_ONLY === "true") {
  const report = await qualifyRegistryOidc({
    family,
    nugetUsername: configuration.nugetUsername,
    environment: process.env,
    tokenProvider: getIDToken,
    maskCredential: setSecret
  });
  await writeFile3("sdk-release-results/registry-qualification.json", JSON.stringify(report, null, 2) + "\n");
  console.log("Registry trusted publisher verified; no package uploaded.");
  process.exit(0);
}
if (process.env.REACON_QUALIFY_ONLY && process.env.REACON_QUALIFY_ONLY !== "false") throw Error("Invalid qualification mode");
var artifactId = Number(process.env.REACON_CI_ARTIFACT_ID);
if (!Number.isSafeInteger(artifactId) || artifactId <= 0 || !process.env.GITHUB_TOKEN) throw Error("Retained CI artifact required");
var key = Buffer.from(process.env.REACON_GITHUB_APP_PRIVATE_KEY ?? "");
delete process.env.REACON_GITHUB_APP_PRIVATE_KEY;
if (!key.length) throw Error("Company release-state reader credential missing");
var temporary = await mkdtemp4(join6(tmpdir3(), "reacon-file-worker-"));
var store;
try {
  const inventory = JSON.parse(await readFile3(join6(directory, "github-bootstrap.json")));
  const { packages } = JSON.parse(await readFile3(join6(directory, "package-identities.json")));
  store = await githubReleaseStateStore({
    directory: join6(temporary, "state"),
    access: "read",
    inventory,
    packages,
    clientId: inventory.releaseApp.clientId,
    privateKey: key
  });
  const artifact = await githubRequest(fetch, process.env.GITHUB_TOKEN, `/repos/${identity.repository}/actions/artifacts/${artifactId}`);
  const archive = await downloadGithubArtifact({
    repository: identity.repository,
    artifact: { ...artifact, size: artifact.size_in_bytes },
    token: process.env.GITHUB_TOKEN,
    maxBytes: 128 * 1024 * 1024
  });
  const zip = join6(temporary, "ci.zip");
  await writeFile3(zip, archive);
  await promisify(execFile)("python3", [join6(directory, "unpack-ci-packages.py"), zip, temporary], { timeout: 3e4 });
  const manifest = JSON.parse(await readFile3(join6(temporary, "package-manifest.json")));
  const ciArtifact = { id: artifact.id, archiveSha256: sha256(archive), size: archive.length, workflowRunId: artifact.workflow_run?.id };
  const requestCredential = registryOidcCredentials({ family, nugetUsername: configuration.nugetUsername, environment: process.env, tokenProvider: getIDToken });
  const inspectNuget = (input) => inspectNugetArchive({ ...input, toolchainConfiguration: join6(directory, "toolchain-images.json"), inspectorPath: join6(directory, "inspect-nuget-package.py") });
  const getCredentials = async (input) => {
    const credential = await requestCredential(input);
    setSecret(credential.token);
    return credential;
  };
  const uploader = family === "csharp" ? nugetUploader({ inspectArchive: inspectNuget, getCredentials }) : rubyRustUploader({
    family,
    inspectArchive: (input) => inspectRetainedRubyRust({
      ...input,
      toolchainConfiguration: join6(directory, "toolchain-images.json"),
      inspectorDirectory: directory
    }),
    getCredentials: async (input) => {
      const credential = await requestCredential(input);
      setSecret(credential.token);
      return credential;
    }
  });
  const retainEvidence = async (bytes) => {
    const digest4 = sha256(bytes);
    await writeFile3(resolve5("sdk-release-results", `${digest4}.bin`), bytes);
    return { sha256: digest4, size: bytes.length };
  };
  for (const unitName of target.units) {
    const snapshot = await store.read(), release = snapshot.state.releases[releaseId];
    if (snapshot.state.activeReleaseId !== releaseId || !release || release.superseded) throw Error("Active reservation required");
    if (release.packages[family].units?.[unitName]?.state === "published") {
      await writeFile3(`sdk-release-results/${unitName}.json`, JSON.stringify({
        releaseId,
        unit: unitName,
        skipped: true,
        reason: "already-reconciled-published",
        uploadAttempted: false,
        stateCommit: snapshot.commit
      }) + "\n");
      continue;
    }
    console.log(`Publisher ${identity.workerId} waiting for ${unitName} intent.`);
    const report = await runFilePublicationWorker({
      family,
      unitName,
      identity,
      releaseId,
      attemptId: `${attemptPrefix}-${unitName}`,
      store,
      upload: uploader.upload,
      retainEvidence,
      ...family === "csharp" ? { verifyArchive: inspectNuget } : {},
      loadPackage: async () => {
        const suffix = family === "csharp" ? ".nupkg" : family === "ruby" ? ".gem" : ".crate";
        const names2 = Object.keys(manifest.files);
        if (names2.length !== 1 || !names2[0].endsWith(suffix) || names2.some((name) => !/^[A-Za-z0-9_.-]+$/.test(name))) throw Error("Expected one retained gem or crate");
        const filename = names2.find((name) => name.endsWith(suffix));
        return { files: manifest.files, bytes: await readFile3(join6(temporary, "artifacts", filename)), ciArtifact };
      }
    });
    await writeFile3(`sdk-release-results/${unitName}.json`, JSON.stringify(report, null, 2) + "\n");
    if (!report.packagePublished) throw Error("Registry outcome requires reconciliation; no automatic retry");
    console.log(`Exact ${unitName} observed in the registry; awaiting coordinator reconciliation.`);
  }
} finally {
  await store?.close();
  key.fill(0);
  await rm5(temporary, { recursive: true, force: true });
}
