import { supabase } from '@/lib/supabase';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatTask = 'chat' | 'document';

/**
 * Calls the `baymo-chat` edge function. The user's JWT is attached automatically
 * by supabase-js, so the function can scope answers to the caller's own pipeline.
 * General chat runs on OpenAI; document drafts route to Anthropic when its key is set.
 */
export async function sendToBayMo(
  messages: ChatMessage[],
  task: ChatTask = 'chat',
  documentType?: string,
): Promise<{ reply: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('baymo-chat', {
    body: { messages, task, document_type: documentType },
  });
  if (error) return { reply: null, error: error.message };
  if (data?.error) return { reply: null, error: String(data.error) };
  return { reply: (data?.reply as string) ?? '', error: null };
}

export type QuickAction = { label: string; prompt: string; task: ChatTask; documentType?: string };

export const QUICK_ACTIONS: QuickAction[] = [
  { label: '🔥 Show my hot leads', prompt: 'Show me my hot leads right now.', task: 'chat' },
  { label: '📊 Summarize my week', prompt: 'Give me a short summary of my leads this week.', task: 'chat' },
  {
    label: '📄 Draft Authority to Sell',
    prompt: 'Draft an Authority to Sell for a property I am listing.',
    task: 'document',
    documentType: 'Authority to Sell',
  },
];
