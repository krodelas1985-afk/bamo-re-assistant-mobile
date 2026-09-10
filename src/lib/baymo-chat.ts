import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { getEdgeFunctionAuth, supabase } from '@/lib/supabase';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatTask = 'chat' | 'document';

/**
 * An action BayMo proposed but did NOT execute. The chat renders it as a
 * Confirm/Cancel card; Confirm calls executePendingAction(). The model never
 * executes writes like this itself — the confirm round-trip is model-free.
 */
export type RecordAction = {
  type: 'create_task' | 'create_appointment';
  id: string;
  title: string;
  lead_id: string | null;
  lead_name: string | null;
  notes: string | null;
  due_date: string | null; scheduled_at: string | null;
  appointment_type: 'viewing' | 'call' | 'event'; location: string | null;
  contact_name: string | null;
  warning: string;
  expires_at: number;
  signature: string;
};
export type PendingAction = RecordAction | {
  type: 'enroll_campaign';
  lead_id: string;
  lead_name: string;
  campaign_id: string;
  campaign_name: string;
  warning: string | null;
};

/**
 * Calls the `baymo-chat` edge function. The user's JWT is attached automatically
 * by supabase-js, so the function can scope answers to the caller's own pipeline.
 * Chat runs an agentic tool loop (search leads, conversation, schedule, tasks,
 * reminders, enrollment proposals); document drafts route to Anthropic when its
 * key is set.
 */
export async function sendToBayMo(
  messages: ChatMessage[],
  task: ChatTask = 'chat',
  documentType?: string,
  context?: { leadId: string; listingId?: string },
): Promise<{ reply: string | null; pendingAction: PendingAction | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('baymo-chat', {
    body: {
      messages, task, document_type: documentType,
      ...(context ? { context_lead_id: context.leadId, context_listing_id: context.listingId } : {}),
    },
  });
  if (error) return { reply: null, pendingAction: null, error: error.message };
  if (data?.error) return { reply: null, pendingAction: null, error: String(data.error) };
  return {
    reply: (data?.reply as string) ?? '',
    pendingAction: (data?.pending_action as PendingAction | undefined) ?? null,
    error: null,
  };
}

/** Execute a confirmed pending action (the user tapped Confirm on the card). */
export async function executePendingAction(
  action: PendingAction,
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('baymo-chat', {
    body: action.type === 'enroll_campaign'
      ? { action: 'execute_enroll', lead_id: action.lead_id, campaign_id: action.campaign_id }
      : { action: 'execute_record', proposal: action },
  });
  if (error) return { ok: false, message: error.message };
  if (!data?.ok) return { ok: false, message: String(data?.error ?? 'Something went wrong.') };
  return { ok: true, message: String(data.message ?? 'Done!') };
}

/** Uploads one temporary recording for transcription. Audio is not stored in Supabase. */
export async function transcribeBayMoAudio(
  uri: string,
): Promise<{ text: string | null; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const body = new FormData();
    body.append('action', 'transcribe');
    if (Platform.OS === 'web') {
      const audio = await fetch(uri).then((response) => response.blob());
      body.append('audio', audio, 'baymo-voice.webm');
    } else {
      const audio = new File(uri);
      if (!audio.exists || audio.size < 100) {
        return { text: null, error: 'No recording was created. Please record again.' };
      }
      // Some Android devices expose Expo's valid MPEG-4 recording with a
      // generated name that has no extension. Give the multipart upload a
      // stable extension so the Edge Function and transcription provider can
      // identify the recording correctly.
      body.append('audio', audio, 'baymo-voice.m4a');
    }
    const auth = await getEdgeFunctionAuth();
    const response = await expoFetch(auth.url, {
      method: 'POST',
      headers: {
        apikey: auth.anonKey,
        Authorization: `Bearer ${auth.accessToken}`,
      },
      body,
      signal: controller.signal,
    });
    let data: { text?: unknown; error?: unknown } = {};
    try {
      data = JSON.parse(await response.text()) as typeof data;
    } catch {
      // Some gateway failures return an HTML or empty body. The status below
      // still produces a safe, actionable message for the agent.
    }
    if (!response.ok) {
      return {
        text: null,
        error: typeof data.error === 'string'
          ? data.error
          : 'BayMo could not transcribe that recording. Please try again.',
      };
    }
    if (data?.error) return { text: null, error: String(data.error) };
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return text
      ? { text, error: null }
      : { text: null, error: 'No speech was detected. Please record again.' };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { text: null, error: 'Transcription took too long. Please try a shorter recording.' };
    }
    if (error instanceof Error && error.message.includes('session expired')) {
      return { text: null, error: error.message };
    }
    return { text: null, error: 'Could not reach BayMo. Check your connection and try again.' };
  } finally {
    clearTimeout(timeout);
  }
}

export type BayMoSpeechAudio = {
  uri: string;
  cleanup: () => void;
};

/** Generates BayMo's Cedar voice and keeps the temporary audio only on this device. */
export async function synthesizeBayMoSpeech(
  text: string,
): Promise<{ audio: BayMoSpeechAudio | null; error: string | null }> {
  const spoken = text.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 4_000);
  if (!spoken) return { audio: null, error: 'There is no BayMo reply to read.' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const auth = await getEdgeFunctionAuth();
    const response = await expoFetch(auth.url, {
      method: 'POST',
      headers: {
        apikey: auth.anonKey,
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'speak', text: spoken, audio_format: 'mp3' }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let message = 'BayMo could not prepare the voice reply. Please try again.';
      try {
        const detail = JSON.parse(await response.text()) as { error?: unknown };
        if (typeof detail.error === 'string') message = detail.error;
      } catch {
        // Keep the safe status message when a gateway returns an empty body.
      }
      return { audio: null, error: message };
    }

    if (Platform.OS === 'web') {
      const uri = URL.createObjectURL(await response.blob());
      return { audio: { uri, cleanup: () => URL.revokeObjectURL(uri) }, error: null };
    }

    const file = new File(Paths.cache, `baymo-cedar-${Date.now()}.mp3`);
    file.create({ overwrite: true });
    file.write(await response.bytes());
    return {
      audio: {
        uri: file.uri,
        cleanup: () => {
          if (file.exists) file.delete();
        },
      },
      error: null,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { audio: null, error: 'BayMo voice took too long. Please try again.' };
    }
    if (error instanceof Error && error.message.includes('session expired')) {
      return { audio: null, error: error.message };
    }
    return { audio: null, error: 'Could not reach BayMo voice. Check your connection and try again.' };
  } finally {
    clearTimeout(timeout);
  }
}

export type QuickAction = { label: string; prompt: string; task: ChatTask; documentType?: string };

export const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Create a task',
    prompt: 'Help me create a task. Ask me what needs doing and whether it needs a due date.',
    task: 'chat',
  },
  {
    label: 'Schedule appointment',
    prompt: 'Help me schedule an appointment. Ask me for the contact, type, date, time and location or call method.',
    task: 'chat',
  },
  { label: '🔥 Show my hot leads', prompt: 'Show me my hot leads right now.', task: 'chat' },
  { label: '📅 What’s my day?', prompt: 'What are my appointments and tasks for today?', task: 'chat' },
  { label: '📊 Summarize my week', prompt: 'Give me a short summary of my leads this week.', task: 'chat' },
  {
    label: '📄 Draft Authority to Sell',
    prompt: 'Draft an Authority to Sell for a property I am listing.',
    task: 'document',
    documentType: 'Authority to Sell',
  },
];
