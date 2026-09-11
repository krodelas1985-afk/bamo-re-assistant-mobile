const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
  // Android OEMs label the very same MPEG-4/AAC recording in several ways.
  // Rejecting these produced a 400 that looked, from the phone, exactly like
  // 'the microphone is broken'.
  'audio/aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'video/mp4',
  'audio/3gpp',
]);

/** Extensions allowed to vouch for an unhelpful media type. */
const ALLOWED_AUDIO_EXTENSIONS = /\.(m4a|mp4|webm|aac|mp3|wav|ogg|oga|3gp)$/;

export function validateVoiceFile(value: unknown): string | null {
  if (!(value instanceof File)) return 'A voice recording is required.';
  if (value.size < 100) return `The recording is empty (${value.size} bytes). Please record again.`;
  if (value.size > MAX_AUDIO_BYTES) return 'The recording is too large. Keep it under 60 seconds.';

  const mediaType = value.type.toLowerCase().split(';', 1)[0];
  const hasAudioExtension = ALLOWED_AUDIO_EXTENSIONS.test(value.name.toLowerCase());
  // An extension may vouch for a missing or generic type, and for any audio/*
  // or video/mp4 variant an OEM invents — but never for something plainly not
  // audio, such as text/plain.
  const typeIsPlausible =
    !mediaType ||
    mediaType === 'application/octet-stream' ||
    mediaType.startsWith('audio/') ||
    mediaType === 'video/mp4';

  if (!ALLOWED_AUDIO_TYPES.has(mediaType) && !(hasAudioExtension && typeIsPlausible)) {
    // Name what arrived: without it this 400 is undiagnosable from the phone.
    return `This audio format is not supported (received "${mediaType || 'no media type'}" ` +
      `for "${value.name || 'unnamed file'}"). Please record again in BaMo.`;
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
      console.warn('BayMo transcription provider rejected a request', { status: response.status });
      return { error: 'BayMo could not transcribe that recording. Please try again.', status: 502 };
    }
    const data = await response.json() as { text?: unknown };
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) return { error: 'No speech was detected. Please record again.', status: 422 };
    return { text };
  } catch (error) {
    console.warn('BayMo transcription provider request failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return { error: 'BayMo could not reach the transcription service. Please try again.', status: 502 };
  }
}
