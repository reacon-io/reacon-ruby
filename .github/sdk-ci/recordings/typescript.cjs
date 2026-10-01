const assert = require('node:assert/strict');
const fs = require('node:fs');
const sdk = globalThis.REACON_RECORDING_SDK ?? require(process.env.SDK_DIRECTORY);
const { fixtureFetch } = require([__dirname + '/../fixed-origin/fetch.cjs', __dirname + '/fixed-origin/fetch.cjs', '/fixed-origin/fetch.cjs', '/sdk/conformance/fixed-origin/fetch.cjs'].find(file => fs.existsSync(file)));
const language = process.env.REACON_TEST_LANGUAGE ?? 'typescript';
const cases = JSON.parse(fs.readFileSync(process.env.REACON_CASES_FILE));
function toWire(schema, value) {
  if (schema?.$ref) return sdk[schema.$ref.split('/').at(-1) + 'ToJSON'](value);
  if (schema?.type === 'array') return value.map(item => toWire(schema.items, item));
  return value;
}
(async () => {
  // Native union regressions: overlapping shapes must never discard supplied
  // fields, and the empty input is a real alternative, not a permissive map.
  for (const input of [{}, {limit: 2, listId: '00000000-0000-4000-8000-000000000001'}, {domain: 'example.invalid'}, {email: 'sdk@example.invalid', idempotencyKey: 'synthetic-regression-1', firstName: 'SDK'}, {sequenceId: '00000000-0000-4000-8000-000000000001', idempotencyKey: 'synthetic-regression-2', recipients: [{email: 'sdk@example.invalid'}]}]) {
    assert.deepEqual(JSON.parse(JSON.stringify(sdk.ProductToolRequestInputToJSON(sdk.ProductToolRequestInputFromJSON(input)))), input);
  }
  for (const input of [null, [], {unknown: true}, {domain: 'example.invalid', unknown: true}, {recipientId: '00000000-0000-4000-8000-000000000001'}]) {
    assert.throws(() => sdk.ProductToolRequestInputFromJSON(input), /Product tool input/);
  }
  // Open object models retain unknown fields without emitting native aliases
  // as extra wire properties. Unknown fields that collide with a native alias
  // still survive a shallow copy and a round trip.
  const mention = {domain:'example.invalid',email:'sdk@example.invalid',first_seen:'2026-09-01 00:00:00',last_seen:'2026-09-01 00:00:00',source_type:'synthetic',source_url:'https://example.invalid/a'};
  for (const extra of [{}, {unknown:null, nested:{items:[false,0,'',null]}}, {firstSeen:'additional firstSeen',sourceUrl:{additional:true}}]) {
    const input = {...mention,...extra};
    const native = sdk.EmailMentionFromJSON(input);
    assert.equal(native.firstSeen,mention.first_seen);assert.equal(native.sourceUrl,mention.source_url);
    assert.equal(Object.hasOwn(native,'first_seen'),false);
    assert.deepEqual(JSON.parse(JSON.stringify(sdk.EmailMentionToJSON({...native}))),input);
    native.firstSeen='2026-09-02 00:00:00';
    assert.deepEqual(JSON.parse(JSON.stringify(sdk.EmailMentionToJSON(native))),{...input,first_seen:'2026-09-02 00:00:00'});
  }
  const handwritten = {domain:mention.domain,email:mention.email,firstSeen:mention.first_seen,lastSeen:mention.last_seen,sourceType:mention.source_type,sourceUrl:mention.source_url,extension:{ok:true}};
  assert.deepEqual(JSON.parse(JSON.stringify(sdk.EmailMentionToJSON(handwritten))),{...mention,extension:{ok:true}});
  const results = [];
  for (const item of cases) {
    try {
      const config = new sdk.Configuration({ fetchApi: fixtureFetch(process.env.REACON_TEST_URL + '/' + item.id), ...(item.record.request.authentication !== 'none' ? { apiKey: 'recording-' + language } : {}) });
      const api = new sdk[item.apiClass](config);
      const params = { ...item.parameters };
      if (item.record.request.body !== undefined) params[item.requestModel[0].toLowerCase() + item.requestModel.slice(1)] = sdk[item.requestModel + 'FromJSON'](item.record.request.body);
      let error; let value;
      try {
        if (item.record.response.mediaType === 'text/csv') {
          await assert.rejects(() => api[item.record.operationId](params), /exportLeadsCsv/);
          value = await api.exportLeadsCsv(params);
        } else if (item.record.response.status === 204) {
          const response = await api[item.record.operationId + 'Raw'](params);
          assert.equal(response.raw.status, 204);
          assert.equal(await response.value(), undefined);
          value = null;
        } else value = await api[item.record.operationId](params);
      } catch (caught) { error = caught; }
      if (item.record.response.status >= 400) {
        assert.ok(error?.response, 'Expected SDK HTTP error');
        assert.equal(error.response.status, item.record.response.status);
        assert.deepEqual(await error.response.json(), item.record.response.body);
      } else {
        if (error) throw error;
        const result = item.responseItemModel ? value.map(v => sdk[item.responseItemModel + 'ToJSON'](v)) : toWire(item.responseSchema, value);
        // JS undefined properties are absent on the wire; null must survive.
        assert.deepEqual(JSON.parse(JSON.stringify(result)), item.record.response.body);
      }
      results.push({ id: item.id, passed: true });
    } catch (error) { results.push({ id: item.id, passed: false, error: error.stack }); }
  }
  fs.writeFileSync(process.env.REACON_RESULTS_FILE, JSON.stringify(results,null,2)+'\n');
  console.log(`${results.filter(x=>x.passed).length}/${results.length} recorded responses passed through TypeScript generated methods`);
  if (results.some(x=>!x.passed)) process.exitCode = 1;
})();
