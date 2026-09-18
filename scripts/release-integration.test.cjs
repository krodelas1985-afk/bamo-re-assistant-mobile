const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = new Module(file);
  mod.require = name => { if (name in mocks) return mocks[name]; throw new Error('Unexpected dependency: ' + name); };
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
  return mod.exports;
}
const { checkAiQuota } = load('supabase/functions/_shared/ai-quota.ts');
test('generation quota uses the authenticated workspace and handles cap/unlimited/error responses', async () => {
  const calls = [];
  const client = data => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data, error: null }; } });
  assert.equal(await checkAiQuota(client({ allowed: true }), 'own-workspace'), null);
  assert.deepEqual(calls[0], { name: 'consume_ai_credit', args: { p_client_id: 'own-workspace' } });
  assert.equal(await checkAiQuota(client({ allowed: true, unlimited: true }), 'own-workspace'), null);
  const full = await checkAiQuota(client({ allowed: false, used: 10, limit: 10 }), 'own-workspace');
  assert.equal(full.status, 402); assert.equal(full.body.code, 'ai_limit_reached');
  assert.equal((await checkAiQuota(client({ allowed: false, reason: 'no_client' }), 'missing')).status, 403);
  assert.equal((await checkAiQuota(client(null), 'own-workspace')).status, 503);
  assert.equal((await checkAiQuota({ rpc: async () => { throw Error('private database detail'); } }, 'own-workspace')).status, 503);
});
test('mobile connection reads require the backend permission fields and reject malformed responses', async () => {
  process.env.EXPO_PUBLIC_ADS_MANAGER_URL = 'https://ads.example.test';
  let response; let request;
  const original = global.fetch;
  global.fetch = async (url, options) => { request = { url, options }; return response; };
  try {
    const api = load('src/lib/page-connection.ts', { '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } }, error: null }) } } } });
    const state = { connected: true, enabled: true, can_manage: false, reconnect_required: false, connection: null, page: null };
    response = Response.json(state);
    assert.deepEqual(await api.fetchMetaConnection(), state);
    assert.equal(request.options.cache, 'no-store'); assert.equal(request.options.headers.Authorization, 'Bearer fixture-token');
    response = Response.json({ connected: true });
    await assert.rejects(api.fetchMetaConnection(), /service needs an update/);
    response = new Response('not json');
    await assert.rejects(api.fetchMetaConnection(), /invalid response/);
    response = Response.json({ login_url: 'fixture', expires_at: 'fixture' });
    await api.startMetaConnection();
    assert.equal(request.url, 'https://ads.example.test/api/auth/meta/client-login?return_app=mobile');
    assert.equal(request.options.method, 'POST');
    response = Response.json({ disconnected: true });
    assert.deepEqual(await api.disconnectMetaConnection(), { disconnected: true });
  } finally { global.fetch = original; }
});
test('usage limits distinguish unlimited plans and return friendly monthly-cap errors', async () => {
  const usage = load('src/lib/usage.ts', { '@/lib/supabase': { supabase: {} } });
  assert.equal(usage.atLimit({ used: 10, limit: 10 }), true);
  assert.equal(usage.atLimit({ used: 9, limit: 10 }), false);
  assert.equal(usage.atLimit({ used: 100, limit: null }), false);
  const message = await usage.aiLimitMessage({ context: Response.json({ code: 'ai_limit_reached', limit: 10 }) });
  assert.match(message, /10 free AI credits/);
  assert.equal(await usage.aiLimitMessage({ context: Response.json({ error: 'different failure' }) }), null);
});
test('auth resolves missing-profile gates and hides prior-account profile/gates after switching users', async () => {
  const values = []; let cursor = 0; let effects = [];
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState: initial => { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], value => { values[index] = value; }]; },
    useEffect: callback => { effects.push(callback); },
    useContext: () => { throw Error('not needed'); },
  };
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }) };
  const { AuthProvider } = load('src/contexts/auth-context.tsx', {
    react,
    'react/jsx-runtime': { jsx: (_, props) => props },
    '@/lib/supabase': { supabase: { from: () => query } },
    '@/lib/onboarding': { hasSubmittedOnboarding: async () => false },
    '@/lib/push': { registerForPushNotifications: async () => {}, removeMyPushToken: async () => {} },
    '@/lib/welcome-tour': { needsWelcomeTour: async () => false },
  });
  const render = () => { cursor = 0; effects = []; return AuthProvider({ children: null }).value; };
  render();
  values[0] = { user: { id: 'first-user' } };
  render(); await effects[1]();
  await new Promise(resolve => setImmediate(resolve));
  const noProfile = render();
  assert.equal(noProfile.profile, null);
  assert.equal(noProfile.needsOnboarding, false);
  assert.equal(noProfile.needsTour, false);
  values[1] = { id: 'first-user', client_id: 'old-workspace' };
  values[0] = { user: { id: 'second-user' } };
  const switched = render();
  assert.equal(switched.profile, null);
  assert.equal(switched.needsOnboarding, null);
  assert.equal(switched.needsTour, null);
  values[0] = null;
  assert.equal(render().profile, null);
});
