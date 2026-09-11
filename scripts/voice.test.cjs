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

const speechMod = new Module('speech');
speechMod._compile(ts.transpileModule(
  fs.readFileSync('supabase/functions/baymo-chat/speech.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, 'speech.cjs');
const { BAYMO_SPEECH_CONFIG, generateBayMoSpeech, prepareSpeechText } = speechMod.exports;

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
  assert.equal(validateVoiceFile(recording(new Uint8Array(200), '')), null);
  assert.match(validateVoiceFile(null), /required/);
  assert.match(validateVoiceFile(recording(new Uint8Array(10))), /empty/);
  assert.match(validateVoiceFile(recording(new Uint8Array(8 * 1024 * 1024 + 1))), /too large/);
  assert.match(validateVoiceFile(recording(new Uint8Array(200), 'text/plain')), /not supported/);
  // Android OEMs label the same MPEG-4/AAC recording inconsistently; each of
  // these was a 400 that read on the phone as "the microphone is broken".
  assert.equal(validateVoiceFile(recording(new Uint8Array(200), 'audio/aac')), null);
  assert.equal(validateVoiceFile(recording(new Uint8Array(200), 'video/mp4')), null);
  assert.equal(validateVoiceFile(recording(new Uint8Array(200), 'application/octet-stream')), null);
  // A rejection must name what arrived, or the 400 is undiagnosable remotely.
  assert.match(validateVoiceFile(recording(new Uint8Array(200), 'text/plain')), /received "text\/plain"/);
  assert.match(validateVoiceFile(recording(new Uint8Array(10))), /10 bytes/);
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
  let request;
  const { transcribeBayMoAudio } = load('src/lib/baymo-chat.ts', {
    'expo/fetch': {
      fetch: async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ text: 'Call Joanna tomorrow' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    'expo-file-system': { File: class {} },
    'react-native': { Platform: { OS: 'web' } },
    '@/lib/supabase': {
      getEdgeFunctionAuth: async () => ({
        url: 'https://example.supabase.co/functions/v1/baymo-chat',
        anonKey: 'anon-key',
        accessToken: 'access-token',
      }),
      supabase: {},
    },
  });
  const result = await transcribeBayMoAudio(
    'data:audio/webm;base64,' + Buffer.from(new Uint8Array(200)).toString('base64'),
  );
  assert.deepEqual(result, { text: 'Call Joanna tomorrow', error: null });
  assert.equal(request.url, 'https://example.supabase.co/functions/v1/baymo-chat');
  assert.equal(request.options.headers.Authorization, 'Bearer access-token');
  assert.equal(request.options.headers.apikey, 'anon-key');
  assert.equal(request.options.body.get('action'), 'transcribe');
  assert.equal(request.options.body.get('audio').type, 'audio/webm');
});

test('Android client gives an extensionless Expo recording a stable M4A upload name', async () => {
  let request;
  class MockExpoFile extends Blob {
    constructor(uri) {
      super([new Uint8Array(200)], { type: 'audio/mp4' });
      this.uri = uri;
      this.name = 'recording';
      this.exists = true;
    }
  }
  const { transcribeBayMoAudio } = load('src/lib/baymo-chat.ts', {
    'expo/fetch': {
      fetch: async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ text: 'Mag schedule tayo bukas' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    'expo-file-system': { File: MockExpoFile },
    'react-native': { Platform: { OS: 'android' } },
    '@/lib/supabase': {
      getEdgeFunctionAuth: async () => ({
        url: 'https://example.supabase.co/functions/v1/baymo-chat',
        anonKey: 'anon-key',
        accessToken: 'access-token',
      }),
      supabase: {},
    },
  });
  assert.deepEqual(await transcribeBayMoAudio('file:///cache/recording.m4a'), {
    text: 'Mag schedule tayo bukas',
    error: null,
  });
  const uploaded = request.options.body.get('audio');
  assert.equal(uploaded.name, 'baymo-voice.m4a');
  assert.equal(uploaded.type, 'audio/mp4');
  assert.equal(uploaded.size, 200);
});

test('BayMo speech is pinned to Cedar with the approved Filipino direction', async () => {
  let request;
  const result = await generateBayMoSpeech('  **Kumusta!**   Viewing tayo bukas. ', 'test-key', async (url, options) => {
    request = { url, options };
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  }, 'mp3');
  assert.equal(request.url, 'https://api.openai.com/v1/audio/speech');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'gpt-4o-mini-tts-2025-12-15');
  assert.equal(body.voice, 'cedar');
  assert.equal(body.input, 'Kumusta! Viewing tayo bukas.');
  assert.match(body.instructions, /Filipino real-estate virtual assistant/);
  assert.match(body.instructions, /Taglish cadence/);
  assert.equal(body.response_format, 'mp3');
  assert.equal(result.audio.byteLength, 3);
  assert.equal(BAYMO_SPEECH_CONFIG.voice, 'cedar');
  assert.equal(prepareSpeechText('  ## Hello   there '), 'Hello there');
});

test('BayMo speech returns safe errors when the provider fails', async () => {
  const rejected = await generateBayMoSpeech('Hello', 'test-key', async () =>
    new Response('private provider detail', { status: 429 }));
  assert.equal(rejected.status, 502);
  assert.match(rejected.error, /could not prepare/);
  assert.equal(await prepareSpeechText('   '), null);
});

test('older APKs continue receiving the original AAC speech format', async () => {
  let requestedFormat;
  await generateBayMoSpeech('Hello', 'test-key', async (_url, options) => {
    requestedFormat = JSON.parse(options.body).response_format;
    return new Response(new Uint8Array([1]), { status: 200 });
  });
  assert.equal(requestedFormat, 'aac');
});

test('Android stores Cedar audio in temporary cache and deletes it after playback', async () => {
  let request;
  let createdFile;
  class MockCacheFile {
    constructor(directory, name) {
      this.uri = `${directory}/${name}`;
      this.exists = false;
      this.deleted = false;
      createdFile = this;
    }
    create() { this.exists = true; }
    write(bytes) { this.bytes = bytes; }
    delete() { this.deleted = true; this.exists = false; }
  }
  const { synthesizeBayMoSpeech } = load('src/lib/baymo-chat.ts', {
    'expo/fetch': {
      fetch: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          bytes: async () => new Uint8Array([7, 8, 9]),
        };
      },
    },
    'expo-file-system': { File: MockCacheFile, Paths: { cache: 'file:///cache' } },
    'react-native': { Platform: { OS: 'android' } },
    '@/lib/supabase': {
      getEdgeFunctionAuth: async () => ({
        url: 'https://example.supabase.co/functions/v1/baymo-chat',
        anonKey: 'anon-key',
        accessToken: 'access-token',
      }),
      supabase: {},
    },
  });
  const result = await synthesizeBayMoSpeech(' **Call** Edz tomorrow. ');
  assert.equal(request.url, 'https://example.supabase.co/functions/v1/baymo-chat');
  assert.deepEqual(JSON.parse(request.options.body), {
    action: 'speak',
    text: 'Call Edz tomorrow.',
    audio_format: 'mp3',
  });
  assert.match(result.audio.uri, /baymo-cedar-\d+\.mp3$/);
  assert.deepEqual([...createdFile.bytes], [7, 8, 9]);
  result.audio.cleanup();
  assert.equal(createdFile.deleted, true);
});
