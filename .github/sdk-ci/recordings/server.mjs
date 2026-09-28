import { operationIndex } from '../../../scripts/public-api/lib/recordings.mjs';
import { requestEquivalence } from './request-equivalence.mjs';
export function buildCases(records, contract) {
  const index = operationIndex(contract);
  // Deliberately malformed bodies document the server's validation response.
  // Typed SDK constructors may correctly reject them before an HTTP request;
  // they are not wire replay cases. Valid requests returning errors remain.
  // Exclusions are enumerated in recordingCoverage().sdkReplay below.
  for (const record of records) if (record.request.validation === 'intentional-invalid' &&
    !(record.response.status >= 400 && record.response.status < 500)) throw new Error('Invalid-request recording must demonstrate client error rejection');
  return records.filter(record => record.request.validation !== 'intentional-invalid').map(record => {
    const { operation, path } = index.get(record.operationId);
    const params = { ...record.request.query };
    const actual = record.request.path.split('/');
    path.split('/').forEach((segment, i) => { const match = /^\{(.+)\}$/.exec(segment); if (match) params[match[1]] = decodeURIComponent(actual[i]); });
    const requestSchema = operation.requestBody?.content?.['application/json']?.schema;
    if (record.request.body !== undefined && !requestSchema?.$ref) throw new Error('Add explicit request mapping for inline schemas');
    const responseSchema = operation.responses[record.response.status]?.content?.[record.response.mediaType]?.schema;
    const responseName = responseSchema?.$ref?.split('/').at(-1);
    const responseArray = responseName && contract.components.schemas[responseName]?.type === 'array';
    return { id: `${record.operationId}--${record.scenarioId}`, apiClass: operation.tags[0].replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, __, c) => c.toUpperCase()) + 'Api', parameters: params, requestEquivalence: requestEquivalence(requestSchema, record.request.body, contract.components.schemas), requestModel: requestSchema?.$ref?.split('/').at(-1), responseSchema, ...(responseArray ? { responseItemModel: responseName + 'Inner' } : {}), record };
  });
}
export { startRecordingServer } from './replay-server.mjs';
