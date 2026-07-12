const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { bootstrap, createApp } = require('../server');

test('boots normative snapshot and validates request', async (t) => {
  const runtime = bootstrap(path.join(__dirname, '..', 'snapshot.json'));
  const server = createApp(runtime).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/health`).then((response) => response.json());
  assert.equal(health.format, 'jsonspecs-snapshot');
  const response = await fetch(`${base}/v1/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ context: { pipelineId: 'entrypoints.fl_resident.full_validation', currentDate: '2026-03-29' }, payload: { beneficiary: { type: 'FL_RESIDENT' } } }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.control, 'STOP');
  assert.equal(Object.hasOwn(result, 'trace'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('rejects malformed request', async (t) => {
  const runtime = bootstrap(path.join(__dirname, '..', 'snapshot.json'));
  const server = createApp(runtime).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 400);
});
