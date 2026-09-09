const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const mod = new Module('actions');
mod._compile(ts.transpileModule(
  fs.readFileSync('supabase/functions/baymo-chat/actions.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, 'actions.cjs');
const { proposeRecord, executeRecord, validDate } = mod.exports;
const secret = 'offline-test-secret';

function fixture() {
  const rows = {
    leads: [{ id: 'lead-a', name: 'Joanna', client_id: 'workspace-a', assigned_user_id: 'agent-a', phone: '123' }],
    tasks: [], appointments: [],
  };
  const state = { failRead: false, failWrite: false, loseResponse: false };
  const admin = { from(table) {
    const filters = [];
    let inserted;
    const run = () => {
      if (inserted) {
        if (state.failWrite) return { error: { message: 'offline' } };
        if (rows[table].some((row) => row.id === inserted.id)) return { error: { code: '23505' } };
        rows[table].push(inserted);
        return { error: state.loseResponse ? { message: 'response lost' } : null };
      }
      if (state.failRead) return { error: { message: 'offline' } };
      return { data: rows[table].filter((row) => filters.every((fn) => fn(row))) };
    };
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      gt(key, value) { filters.push((row) => Date.parse(row[key]) > Date.parse(value)); return query; },
      lt(key, value) { filters.push((row) => Date.parse(row[key]) < Date.parse(value)); return query; },
      limit() { return query; },
      insert(row) { inserted = row; return query; },
      async maybeSingle() { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return query;
  } };
  return { rows, state, scope: { admin, uid: 'agent-a', clientId: 'workspace-a', role: 'agent' } };
}

const appointment = {
  title: 'Property viewing', lead_id: 'lead-a',
  scheduled_at: '2099-09-10T14:00:00+08:00',
  appointment_type: 'viewing', location: 'Lipa House',
};

test('proposal is read-only and repeated confirmation creates one task', async () => {
  const { scope, rows } = fixture();
  const action = await proposeRecord(scope, 'create_task',
    { title: 'Call Joanna', lead_id: 'lead-a', due_date: '2099-09-10' }, secret);
  assert.equal(rows.tasks.length, 0);
  await Promise.all([executeRecord(scope, action, secret), executeRecord(scope, action, secret)]);
  await executeRecord(scope, action, secret);
  assert.equal(rows.tasks.length, 1);
  assert.equal(rows.tasks[0].task_type, 'Follow-up');
});

test('tampering and cross-account replay cannot write', async () => {
  const { scope, rows } = fixture();
  const action = await proposeRecord(scope, 'create_task', { title: 'Call' }, secret);
  await assert.rejects(executeRecord(scope, { ...action, title: 'Changed' }, secret), /invalid/);
  await assert.rejects(executeRecord({ ...scope, uid: 'other' }, action, secret), /invalid/);
  await assert.rejects(executeRecord({ ...scope, clientId: 'other' }, action, secret), /invalid/);
  assert.equal(rows.tasks.length, 0);
});

test('lead access is checked again at confirmation', async () => {
  const { scope, rows } = fixture();
  await assert.rejects(proposeRecord(scope, 'create_task', { title: 'Call', lead_id: 'missing' }, secret), /available/);
  const action = await proposeRecord(scope, 'create_task', { title: 'Call', lead_id: 'lead-a' }, secret);
  rows.leads[0].assigned_user_id = 'other';
  await assert.rejects(executeRecord(scope, action, secret), /available/);
  assert.equal(rows.tasks.length, 0);
});

test('invalid dates and incomplete appointments are rejected', async () => {
  const { scope } = fixture();
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2027-02-29'), false);
  await assert.rejects(proposeRecord(scope, 'create_task', { title: 'Call', due_date: '2099-02-30' }, secret), /valid due/);
  for (const change of [
    { scheduled_at: 'tomorrow at 2' },
    { scheduled_at: '2020-01-01T14:00:00+08:00' },
    { scheduled_at: '2099-02-30T14:00:00+08:00' },
    { location: '' }, { lead_id: null, contact_name: '' }, { appointment_type: 'unknown' },
  ]) await assert.rejects(proposeRecord(scope, 'create_appointment', { ...appointment, ...change }, secret));
});

test('calendar conflict is rechecked, and lost write responses recover safely', async () => {
  const { scope, rows, state } = fixture();
  const action = await proposeRecord(scope, 'create_appointment', appointment, secret);
  rows.appointments.push({ id: 'other', client_id: scope.clientId, created_by: scope.uid,
    status: 'scheduled', scheduled_at: '2099-09-10T14:30:00+08:00' });
  await assert.rejects(executeRecord(scope, action, secret), /within one hour/);
  rows.appointments[0].status = 'cancelled';
  state.loseResponse = true;
  assert.equal((await executeRecord(scope, action, secret)).ok, true);
  assert.equal(rows.appointments.length, 2);
  assert.equal(rows.appointments[1].contact_name, 'Joanna');
});

test('unconfirmed failures never report success', async () => {
  const { scope, rows, state } = fixture();
  const action = await proposeRecord(scope, 'create_task', { title: 'Call' }, secret);
  state.failRead = true;
  await assert.rejects(executeRecord(scope, action, secret), /verify/);
  state.failRead = false;
  state.failWrite = true;
  await assert.rejects(executeRecord(scope, action, secret), /not be confirmed/);
  assert.equal(rows.tasks.length, 0);
});
