const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
]);

export function validateVoiceFile(value: unknown): string | null {
  if (!(value instanceof File)) return 'A voice recording is required.';
  if (value.size < 100) return 'The recording is empty. Please record again.';
  if (value.size > MAX_AUDIO_BYTES) return 'The recording is too large. Keep it under 60 seconds.';
  const mediaType = value.type.toLowerCase().split(';', 1)[0];
  if (!ALLOWED_AUDIO_TYPES.has(mediaType)) {
    return 'This audio format is not supported. Please record again in BaMo.';
  }
  return null;
}

export async function transcribeVoiceFile(
  value: unknown,
  openaiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<{ text?: string; error?: string; status?: number }> {
  const invalid = validateVoiceFile(value);
  if (invalid) return { error: invalid, status: 400 };
  const file = value as File;

  const body = new FormData();
  body.append('file', file, file.name || 'baymo-voice.m4a');
  body.append('model', TRANSCRIPTION_MODEL);
  body.append(
    'prompt',
    'Natural Philippine real estate conversation. The speaker may use Taglish. Preserve names, dates, times, amounts, and property terms.',
  );
  body.append('response_format', 'json');

  try {
    const response = await fetcher('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body,
    });
    if (!response.ok) {
      return { error: 'BayMo could not transcribe that recording. Please try again.', status: 502 };
    }
    const data = await response.json() as { text?: unknown };
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) return { error: 'No speech was detected. Please record again.', status: 422 };
    return { text };
  } catch {
    return { error: 'BayMo could not reach the transcription service. Please try again.', status: 502 };
  }
}
