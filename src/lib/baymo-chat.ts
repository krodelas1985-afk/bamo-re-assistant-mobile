import { supabase } from '@/lib/supabase';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatTask = 'chat' | 'document';

/**
 * An action BayMo proposed but did NOT execute. The chat renders it as a
 * Confirm/Cancel card; Confirm calls executePendingAction(). The model never
 * executes writes like this itself — the confirm round-trip is model-free.
 */
export type PendingAction = {
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
): Promise<{ reply: string | null; pendingAction: PendingAction | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('baymo-chat', {
    body: { messages, task, document_type: documentType },
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
    body: { action: 'execute_enroll', lead_id: action.lead_id, campaign_id: action.campaign_id },
  });
  if (error) return { ok: false, message: error.message };
  if (!data?.ok) return { ok: false, message: String(data?.error ?? 'Something went wrong.') };
  return { ok: true, message: String(data.message ?? 'Done!') };
}

export type QuickAction = { label: string; prompt: string; task: ChatTask; documentType?: string };

export const QUICK_ACTIONS: QuickAction[] = [
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
