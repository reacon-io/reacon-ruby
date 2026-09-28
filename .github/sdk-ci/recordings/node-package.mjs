import { mkdtemp, readFile, rm, writeFile, readdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const source=process.env.SDK_DIRECTORY;
const directory=await mkdtemp(join(tmpdir(),'reacon-recorded-package-'));
try {
 let archive;
 if(process.env.REACON_REUSE_ARTIFACTS){
  const files=await readdir(process.env.REACON_REUSE_ARTIFACTS);assert.equal(files.length,1);assert.ok(files[0].endsWith('.tgz'));
  archive=join('/results/artifacts',files[0]);await copyFile(join(process.env.REACON_REUSE_ARTIFACTS,files[0]),archive);
 }else{
  const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination','/results/artifacts'],{cwd:source,encoding:'utf8'}))[0];
  assert.ok(packed.files.some(file=>file.path==='dist/esm/package.json'));
  assert.ok(packed.files.every(file=>['package.json','README.md','LICENSE'].includes(file.path)||file.path.startsWith('dist/')));
  archive=join('/results/artifacts',packed.filename);
 }
 await writeFile(join(directory,'package.json'),JSON.stringify({private:true}));
 execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund','--cache','/cache/npm',archive],{cwd:directory,stdio:'inherit'});
 const installed=join(directory,'node_modules/@reacon-io/sdk');
 const metadata=JSON.parse(await readFile(join(installed,'package.json')));assert.equal(metadata.license,'Apache-2.0');
 assert.equal(metadata.version,process.env.REACON_SDK_PACKAGE_VERSION);
 const example=`import { LeadsApi, ExportLeadsRequest, MailGetPortfolioResponse200, MailGetTrackingDomainResponse200 } from '@reacon-io/sdk';
declare const api: LeadsApi;
const request: ExportLeadsRequest = { selectionScopes: [{ action: 'include' }] };
const csv: Promise<string> = api.exportLeadsCsv({teamId:'synthetic-team', exportLeadsRequest:request});
void csv;
const portfolio: MailGetPortfolioResponse200 = { portfolio: null, suppressions: [], teams: [] };
const tracking: MailGetTrackingDomainResponse200 = { domain: null };
// @ts-expect-error a required nullable property must still be present
const absentPortfolio: MailGetPortfolioResponse200 = { suppressions: [], teams: [] };
// @ts-expect-error nullable does not make the tracking domain optional
const absentTracking: MailGetTrackingDomainResponse200 = {};
void [portfolio, tracking, absentPortfolio, absentTracking];
`;
 for(const extension of ['mts','cts']){
  const file=join(directory,'consumer.'+extension);await writeFile(file,example);
  execFileSync(join(source,'node_modules/.bin/tsc'),['--noEmit','--strict','--target','ES2020','--module','NodeNext','--moduleResolution','NodeNext',file],{cwd:directory,stdio:'inherit'});
 }
 const esm=process.argv.includes('--esm');
 const loader=join(directory,esm?'run.mjs':'run.cjs');
 await writeFile(loader,esm?"import * as sdk from '@reacon-io/sdk'; globalThis.REACON_RECORDING_SDK=sdk; await import('file:///suite/typescript.cjs');":"globalThis.REACON_RECORDING_SDK=require('@reacon-io/sdk'); require('/suite/typescript.cjs');");
 execFileSync('node',[loader],{cwd:directory,stdio:'inherit',env:{...process.env,SDK_DIRECTORY:installed,REACON_TEST_LANGUAGE:esm?'typescript-esm':'typescript'}});
 console.log(`Installed npm package: ${esm?'ESM':'CommonJS'} recorded responses, package contents/license and both TypeScript declaration modes passed`);
}finally{await rm(directory,{recursive:true,force:true});}
