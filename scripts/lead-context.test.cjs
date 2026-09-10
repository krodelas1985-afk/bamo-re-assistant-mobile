// Run with node --test scripts/lead-context.test.cjs. All database reads are fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = new Module(file);
  mod.require = (name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file + '.cjs',
  );
  return mod.exports;
}
const { resolveLeadContext } = load(
  'supabase/functions/baymo-chat/lead-context.ts',
);
const { ChatHistoryStore } = load('src/lib/chat-history-store.ts');
const scope = { uid: 'agent-a', role: 'agent', clientId: 'workspace-a' };
const rows = {
  leads: [
    {
      id: 'lead-a',
      name: 'Joanna',
      client_id: 'workspace-a',
      assigned_user_id: 'agent-a',
    },
    {
      id: 'lead-b',
      name: 'Joanna',
      client_id: 'workspace-a',
      assigned_user_id: 'agent-b',
    },
    {
      id: 'lead-c',
      name: 'Joanna',
      client_id: 'workspace-b',
      assigned_user_id: 'agent-a',
    },
  ],
  agent_listings: [
    {
      id: 'property-a',
      title: 'Lipa House',
      price: 4000000,
      client_id: 'workspace-a',
      created_by: 'agent-a',
    },
    {
      id: 'property-b',
      title: 'Other agent house',
      client_id: 'workspace-a',
      created_by: 'agent-b',
    },
    {
      id: 'property-c',
      title: 'Other workspace house',
      client_id: 'workspace-b',
      created_by: 'agent-a',
    },
  ],
};
function db(fail = false) {
  return {
    from(table) {
      const filters = [];
      let columns;
      const query = {
        select(value) {
          columns = value.split(',').map((v) => v.trim());
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        async maybeSingle() {
          if (fail) return { data: null, error: { message: 'offline' } };
          const row = rows[table].find((r) =>
            filters.every(([k, v]) => r[k] === v),
          );
          return {
            data: row
              ? Object.fromEntries(
                  columns.filter((k) => k in row).map((k) => [k, row[k]]),
                )
              : null,
            error: null,
          };
        },
      };
      return query;
    },
  };
}
test('general chat is unchanged and does not query lead data', async () => {
  assert.deepEqual(
    await resolveLeadContext(null, scope, undefined, undefined),
    {},
  );
});
test('uses the selected ID even when other leads share its name', async () => {
  const result = await resolveLeadContext(db(), scope, 'lead-a', undefined);
  assert.match(result.context, /"id":"lead-a"/);
  assert.doesNotMatch(result.context, /lead-b|lead-c/);
  assert.match(result.context, /No property is selected/);
});
test('rejects reassigned, other-workspace, deleted, and malformed lead selections', async () => {
  for (const id of ['lead-b', 'lead-c', 'deleted', {}, '']) {
    const result = await resolveLeadContext(db(), scope, id, undefined);
    assert.ok(result.error);
    assert.equal(result.context, undefined);
  }
});
test('validates property ownership separately and never invents a lead-property link', async () => {
  const result = await resolveLeadContext(db(), scope, 'lead-a', 'property-a');
  assert.match(result.context, /4000000/);
  assert.match(result.context, /not proof the buyer chose it/);
  for (const id of ['property-b', 'property-c', 'deleted', {}]) {
    const denied = await resolveLeadContext(db(), scope, 'lead-a', id);
    assert.ok(denied.error);
    assert.equal(denied.context, undefined);
  }
});
test('workspace admins remain fenced to their own workspace', async () => {
  const admin = { ...scope, role: 'admin' };
  assert.ok(
    (await resolveLeadContext(db(), admin, 'lead-b', 'property-b')).context,
  );
  assert.ok((await resolveLeadContext(db(), admin, 'lead-c', undefined)).error);
  assert.ok(
    (await resolveLeadContext(db(), admin, 'lead-a', 'property-c')).error,
  );
});
test('read failures and missing workspace do not yield fabricated context', async () => {
  assert.ok(
    (await resolveLeadContext(db(true), scope, 'lead-a', undefined)).error,
  );
  assert.ok(
    (
      await resolveLeadContext(
        db(),
        { ...scope, clientId: null },
        'lead-a',
        undefined,
      )
    ).error,
  );
});
test('lead/property context survives restart and legacy general history remains readable', async () => {
  const values = new Map();
  const storage = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => values.set(k, v),
  };
  const store = new ChatHistoryStore('agent-a', storage);
  await store.load();
  const general = store.create('General');
  store.update(general, () => [{ role: 'user', content: 'General' }]);
  const id = store.create('Summarize', {
    leadId: 'lead-a',
    leadName: 'Joanna',
  });
  store.update(id, () => [{ role: 'user', content: 'Summarize' }]);
  store.setContext(id, {
    leadId: 'lead-a',
    leadName: 'Joanna',
    listingId: 'property-a',
    listingTitle: 'Lipa House',
  });
  await store.retry();
  const restored = new ChatHistoryStore('agent-a', storage);
  await restored.load();
  assert.equal(
    restored.getSnapshot().conversations.find((c) => c.id === id).context
      .listingId,
    'property-a',
  );
  assert.equal(
    restored.getSnapshot().conversations.find((c) => c.id === general).context,
    undefined,
  );
  restored.setContext(id, { leadId: 'lead-a', leadName: 'Joanna' });
  await restored.retry();
  const cleared = new ChatHistoryStore('agent-a', storage);
  await cleared.load();
  assert.equal(
    cleared.getSnapshot().conversations.find((c) => c.id === id).context
      .listingId,
    undefined,
  );
});

test('the chat API carries only selected IDs and preserves general-chat requests', async () => {
  const requests = [];
  const { sendToBayMo } = load('src/lib/baymo-chat.ts', {
    'expo/fetch': { fetch: globalThis.fetch },
    'expo-file-system': { File: globalThis.File },
    'react-native': { Platform: { OS: 'web' } },
    '@/lib/supabase': {
      supabase: {
        functions: {
          invoke: async (name, args) => {
            requests.push({ name, ...args });
            return { data: { reply: 'ok' }, error: null };
          },
        },
      },
    },
  });
  await sendToBayMo(
    [{ role: 'user', content: 'Summarize' }],
    'chat',
    undefined,
    {
      leadId: 'lead-a',
      leadName: 'Untrusted label',
      listingId: 'property-a',
      listingTitle: 'Untrusted title',
    },
  );
  assert.equal(requests[0].body.context_lead_id, 'lead-a');
  assert.equal(requests[0].body.context_listing_id, 'property-a');
  assert.doesNotMatch(JSON.stringify(requests[0]), /Untrusted/);
  await sendToBayMo([{ role: 'user', content: 'Hello' }]);
  assert.equal('context_lead_id' in requests[1].body, false);
});

test('forms resolve a selected lead outside the first 200 options and reject missing leads', async () => {
  let missing = false;
  const { fetchLeadFormOptions } = load('src/lib/appointments.ts', {
    '@/lib/supabase': {
      supabase: {
        from: () => {
          const q = {
            select: () => q,
            order: () => q,
            eq: () => q,
            limit: async () => ({
              data: [{ id: 'other', name: 'Another lead' }],
            }),
            maybeSingle: async () => ({
              data: missing
                ? null
                : { id: 'lead-a', name: 'Joanna', phone: '0917' },
              error: null,
            }),
          };
          return q;
        },
      },
    },
  });
  const result = await fetchLeadFormOptions('lead-a');
  assert.equal(result.selected.id, 'lead-a');
  assert.ok(result.options.some((l) => l.id === 'lead-a'));
  missing = true;
  await assert.rejects(
    () => fetchLeadFormOptions('gone'),
    /could not be loaded/,
  );
});
