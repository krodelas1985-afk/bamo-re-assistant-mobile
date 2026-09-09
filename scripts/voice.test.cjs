const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const mod = new Module('transcription');
mod._compile(ts.transpileModule(
  fs.readFileSync('supabase/functions/baymo-chat/transcription.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, 'transcription.cjs');
const { transcribeVoiceFile, validateVoiceFile } = mod.exports;

function load(file, mocks) {
  const loaded = new Module(file);
  loaded.require = (name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, `${file}.cjs`);
  return loaded.exports;
}

const recording = (content = new Uint8Array(200), type = 'audio/mp4') =>
  new File([content], 'baymo-voice.m4a', { type });

test('accepts BaMo recording formats and rejects empty, oversized, or unrelated files', () => {
  assert.equal(validateVoiceFile(recording()), null);
  assert.equal(validateVoiceFile(recording(new Uint8Array(200), 'audio/webm')), null);
  assert.equal(validateVoiceFile(recording(new Uint8Array(200), 'audio/webm;codecs=opus')), null);
  assert.match(validateVoiceFile(null), /required/);
  assert.match(validateVoiceFile(recording(new Uint8Array(10))), /empty/);
  assert.match(validateVoiceFile(recording(new Uint8Array(8 * 1024 * 1024 + 1))), /too large/);
  assert.match(validateVoiceFile(recording(new Uint8Array(200), 'text/plain')), /not supported/);
});

test('sends multipart audio to the current transcription model and returns trimmed text', async () => {
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe');
    assert.equal(options.body.get('response_format'), 'json');
    assert.equal(options.body.get('file').name, 'baymo-voice.m4a');
    return new Response(JSON.stringify({ text: '  Schedule a viewing tomorrow.  ' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  assert.deepEqual(await transcribeVoiceFile(recording(), 'test-key', fetcher), {
    text: 'Schedule a viewing tomorrow.',
  });
});

test('returns useful errors without exposing provider details', async () => {
  const rejected = await transcribeVoiceFile(recording(), 'test-key', async () =>
    new Response('private provider detail', { status: 429 }));
  assert.deepEqual(rejected, {
    error: 'BayMo could not transcribe that recording. Please try again.',
    status: 502,
  });

  const silent = await transcribeVoiceFile(recording(), 'test-key', async () =>
    new Response(JSON.stringify({ text: ' ' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  assert.equal(silent.status, 422);
  assert.match(silent.error, /No speech/);

  const offline = await transcribeVoiceFile(recording(), 'test-key', async () => {
    throw new Error('secret network detail');
  });
  assert.equal(offline.status, 502);
  assert.match(offline.error, /could not reach/);
});

test('mobile client sends a reviewed recording through the authenticated function', async () => {
  let invocation;
  const { transcribeBayMoAudio } = load('src/lib/baymo-chat.ts', {
    '@/lib/supabase': {
      supabase: { functions: { invoke: async (name, options) => {
        invocation = { name, options };
        return { data: { text: 'Call Joanna tomorrow' }, error: null };
      } } },
    },
  });
  const result = await transcribeBayMoAudio(
    'data:audio/webm;base64,' + Buffer.from(new Uint8Array(200)).toString('base64'),
    true,
  );
  assert.deepEqual(result, { text: 'Call Joanna tomorrow', error: null });
  assert.equal(invocation.name, 'baymo-chat');
  assert.equal(invocation.options.body.get('action'), 'transcribe');
  assert.equal(invocation.options.body.get('audio').type, 'audio/webm');
});
