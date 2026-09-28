const assert = require('node:assert/strict');
const fs = require('node:fs');
const sdk = globalThis.REACON_RECORDING_SDK ?? require(process.env.SDK_DIRECTORY);
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
  const results = [];
  for (const item of cases) {
    try {
      const config = new sdk.Configuration({ basePath: process.env.REACON_TEST_URL + '/' + item.id, ...(item.record.request.authentication !== 'none' ? { apiKey: 'recording-' + language } : {}) });
      const api = new sdk[item.apiClass](config);
      const params = { ...item.parameters };
      if (item.record.request.body !== undefined) params[item.requestModel[0].toLowerCase() + item.requestModel.slice(1)] = sdk[item.requestModel + 'FromJSON'](item.record.request.body);
      let error; let value;
      try {
        if (item.record.response.mediaType === 'text/csv') {
          await assert.rejects(() => api[item.record.operationId](params), /exportLeadsCsv/);
          value = await api.exportLeadsCsv(params);
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
