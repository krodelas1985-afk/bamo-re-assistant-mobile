// Run with node --test scripts/chat-history.test.cjs. No network or database access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const compiled = ts.transpileModule(
  fs.readFileSync('src/lib/chat-history-store.ts', 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const mod = new Module('chat-history-store');
mod._compile(compiled, 'chat-history-store.cjs');
const { ChatHistoryStore } = mod.exports;
const message = (content) => ({ role: 'user', content });
function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
}
async function add(store, text) {
  const id = store.create(text);
  store.update(id, () => [message(text)]);
  await store.retry();
  return id;
}

test('keeps the five most recently updated chats, including across restart', async () => {
  const storage = memoryStorage();
  const store = new ChatHistoryStore('alice', storage);
  await store.load();
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(await add(store, `Chat ${i}`));
  store.update(ids[0], (messages) => [
    ...messages,
    message('Continue oldest chat'),
  ]);
  await add(store, 'Sixth chat');
  const restarted = new ChatHistoryStore('alice', storage);
  await restarted.load();
  assert.equal(restarted.getSnapshot().conversations.length, 5);
  assert.ok(restarted.getSnapshot().conversations.some((c) => c.id === ids[0]));
  assert.ok(
    !restarted.getSnapshot().conversations.some((c) => c.id === ids[1]),
  );
  assert.equal(
    restarted.getSnapshot().conversations.find((c) => c.id === ids[0]).messages
      .length,
    2,
  );
});

test('isolates different accounts on the same device', async () => {
  const storage = memoryStorage();
  const alice = new ChatHistoryStore('alice', storage);
  const bob = new ChatHistoryStore('bob', storage);
  await Promise.all([alice.load(), bob.load()]);
  await add(alice, 'Private Alice conversation');
  await add(bob, 'Private Bob conversation');
  const restored = new ChatHistoryStore('bob', storage);
  await restored.load();
  assert.deepEqual(
    restored.getSnapshot().conversations.map((c) => c.title),
    ['Private Bob conversation'],
  );
});

test('deletion persists and a late response cannot resurrect a deleted chat', async () => {
  const storage = memoryStorage();
  const store = new ChatHistoryStore('alice', storage);
  await store.load();
  const id = await add(store, 'Delete me');
  store.remove(id);
  store.update(id, (messages) => [
    ...messages,
    { role: 'assistant', content: 'Late reply' },
  ]);
  await store.retry();
  const restarted = new ChatHistoryStore('alice', storage);
  await restarted.load();
  assert.deepEqual(restarted.getSnapshot().conversations, []);
});

test('queued writes preserve the latest reply despite slow storage', async () => {
  const storage = memoryStorage();
  const originalSet = storage.setItem;
  storage.setItem = async (key, value) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await originalSet(key, value);
  };
  const store = new ChatHistoryStore('alice', storage);
  await store.load();
  const id = store.create('Question');
  store.update(id, () => [message('Question')]);
  store.update(id, (messages) => [
    ...messages,
    { role: 'assistant', content: 'Answer' },
  ]);
  await store.retry();
  const restarted = new ChatHistoryStore('alice', storage);
  await restarted.load();
  assert.equal(
    restarted.getSnapshot().conversations[0].messages[1].content,
    'Answer',
  );
});

test('storage failures are visible and retry saves the in-memory conversation', async () => {
  const storage = memoryStorage();
  const write = storage.setItem;
  storage.setItem = async () => {
    throw new Error('Device full');
  };
  const store = new ChatHistoryStore('alice', storage);
  await store.load();
  await add(store, 'Keep my message');
  assert.match(store.getSnapshot().error, /could not be saved/);
  storage.setItem = write;
  await store.retry();
  assert.equal(store.getSnapshot().error, null);
  assert.ok(storage.values.get(store.key).includes('Keep my message'));
});

test('failed hydration never overwrites existing history and can be retried', async () => {
  const storage = memoryStorage();
  storage.values.set('bamo.chatHistory.v1.alice', 'corrupt');
  const store = new ChatHistoryStore('alice', storage);
  await store.load();
  assert.equal(store.getSnapshot().ready, false);
  assert.throws(() => store.create('Overwrite'), /still loading/);
  assert.equal(storage.values.get(store.key), 'corrupt');
  storage.values.set(store.key, '[]');
  await store.retry();
  assert.equal(store.getSnapshot().ready, true);
});

test('restored proposals cannot replay interrupted actions; completed status survives', async () => {
  const storage = memoryStorage();
  const store = new ChatHistoryStore('alice', storage);
  await store.load();
  const id = store.create('Campaign');
  store.update(id, () =>
    ['open', 'working', 'confirmed', 'cancelled'].map((pendingState) => ({
      role: 'assistant',
      content: 'Enroll lead',
      pending: { type: 'enroll_campaign' },
      pendingState,
    })),
  );
  await store.retry();
  const restarted = new ChatHistoryStore('alice', storage);
  await restarted.load();
  assert.deepEqual(
    restarted
      .getSnapshot()
      .conversations[0].messages.map((m) => m.pendingState),
    ['expired', 'expired', 'confirmed', 'cancelled'],
  );
});
