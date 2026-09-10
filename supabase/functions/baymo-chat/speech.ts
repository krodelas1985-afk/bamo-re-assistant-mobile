const SPEECH_MODEL = 'gpt-4o-mini-tts-2025-12-15';
const BAYMO_VOICE = 'cedar';
const MAX_SPEECH_CHARACTERS = 4_000;

const BAYMO_VOICE_INSTRUCTIONS =
  'Speak as a warm and confident Filipino real-estate virtual assistant from Metro Manila. ' +
  'Use natural Philippine English with a light Taglish cadence. Pronounce Filipino names, ' +
  'locations, peso amounts, dates, and property terms clearly. Keep a friendly, professional ' +
  'tone at a medium pace. Avoid British and strongly American pronunciation.';

export function prepareSpeechText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, MAX_SPEECH_CHARACTERS);
}

export async function generateBayMoSpeech(
  value: unknown,
  openaiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<{ audio?: ArrayBuffer; error?: string; status?: number }> {
  const input = prepareSpeechText(value);
  if (!input) return { error: 'There is no BayMo reply to read.', status: 400 };

  try {
    const response = await fetcher('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SPEECH_MODEL,
        voice: BAYMO_VOICE,
        input,
        instructions: BAYMO_VOICE_INSTRUCTIONS,
        response_format: 'aac',
        speed: 1,
      }),
    });
    if (!response.ok) {
      console.warn('BayMo speech provider rejected a request', { status: response.status });
      return { error: 'BayMo could not prepare the voice reply. Please try again.', status: 502 };
    }
    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) {
      return { error: 'BayMo returned an empty voice reply. Please try again.', status: 502 };
    }
    return { audio };
  } catch (error) {
    console.warn('BayMo speech provider request failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return { error: 'BayMo could not reach the voice service. Please try again.', status: 502 };
  }
}

export const BAYMO_SPEECH_CONFIG = {
  model: SPEECH_MODEL,
  voice: BAYMO_VOICE,
  instructions: BAYMO_VOICE_INSTRUCTIONS,
} as const;
