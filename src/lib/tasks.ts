import { supabase } from '@/lib/supabase';

/**
 * Tasks data layer, table public.tasks (shared with the CRM). RLS scopes rows:
 * agents see tasks on their own leads or assigned directly to them; admins see
 * the whole client. Manual tasks created here always set assigned_to so a
 * lead-less task stays visible to its owner under the agent RLS.
 */

export type TaskStatus = 'pending' | 'completed' | 'overdue' | 'cancelled' | 'deferred';

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  due_date: string | null; // YYYY-MM-DD
  deferred_until: string | null;
  task_type: string | null;
  source: string | null; // manual | campaign | system | baymo
  assigned_to: string | null;
  created_by: string | null;
  lead_id: string | null;
  lead_name: string | null;
  updated_at: string | null;
};

export type TeamMember = { id: string; full_name: string | null; role: string | null };

type Row = Omit<Task, 'lead_name'> & { lead: { id: string; name: string | null } | null };

const SELECT =
  'id, title, notes, status, due_date, deferred_until, task_type, source, assigned_to, created_by, lead_id, updated_at, lead:leads(id, name)';

function mapRow(r: Row): Task {
  const { lead, ...rest } = r;
  return { ...rest, lead_name: lead?.name ?? null };
}

/** Today's date string (YYYY-MM-DD) in Asia/Manila, matching the CRM. */
export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export type TaskBucket = 'today' | 'upcoming' | 'deferred' | 'done';

/** Today also collects overdue and undated pending tasks — it's the "act now" list. */
export function bucketOf(t: Task, today = manilaToday()): TaskBucket {
  if (t.status === 'completed' || t.status === 'cancelled') return 'done';
  if (t.status === 'deferred') return 'deferred';
  if (!t.due_date || t.due_date <= today) return 'today';
  return 'upcoming';
}

export function isOverdue(t: Task, today = manilaToday()): boolean {
  return t.status === 'pending' && !!t.due_date && t.due_date < today;
}

/**
 * Who put this task on the list, as shown on the card chip. Anything machine-
 * generated (BaMo daily check, sequences, campaigns) reads as BaMo — the client
 * sees results, not the machinery underneath.
 */
export function sourceMeta(
  t: Task,
  myUserId: string | null,
): { kind: 'baymo' | 'team' | 'me'; label: string } {
  if (t.source && t.source !== 'manual') return { kind: 'baymo', label: '🤖 BaMo' };
  if (t.created_by && myUserId && t.created_by !== myUserId) return { kind: 'team', label: '🏢 Team' };
  return { kind: 'me', label: '✍️ Me' };
}

/** All open tasks (pending + deferred), soonest due first, undated last. */
export async function fetchOpenTasks(): Promise<{ data: Task[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .select(SELECT)
    .in('status', ['pending', 'deferred'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) return { data: [], error: error.message };
  return { data: ((data as unknown as Row[]) ?? []).map(mapRow), error: null };
}

/** Recently finished tasks for the Done tab. */
export async function fetchDoneTasks(): Promise<{ data: Task[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .select(SELECT)
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return { data: [], error: error.message };
  return { data: ((data as unknown as Row[]) ?? []).map(mapRow), error: null };
}

/** Pending tasks due today / overdue / undated — the Home "Today's tasks" strip. */
export async function fetchTodayTasks(limit = 4): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select(SELECT)
    .eq('status', 'pending')
    .or(`due_date.lte.${manilaToday()},due_date.is.null`)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(limit);
  return ((data as unknown as Row[]) ?? []).map(mapRow);
}

export type TaskInput = {
  title: string;
  notes: string | null;
  due_date: string | null;
  lead_id: string | null;
  task_type: string;
  assigned_to: string;
};

export async function createTask(
  clientId: string,
  userId: string,
  input: TaskInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tasks').insert({
    ...input,
    client_id: clientId,
    created_by: userId,
    status: 'pending',
    source: 'manual',
  });
  return { error: error ? error.message : null };
}

export async function completeTask(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return { error: error ? error.message : null };
}

/** Park until the given day; the nightly sweep flips it back to pending then. */
export async function deferTask(id: string, until: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'deferred', deferred_until: until, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? error.message : null };
}

/**
 * Reassignment goes through an RPC: a direct UPDATE fails RLS for agents once
 * the row stops being theirs (Postgres re-checks the new row against the
 * SELECT policy). The RPC validates visibility + same-client target instead.
 */
export async function reassignTask(id: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reassign_task', { p_task_id: id, p_user_id: userId });
  return { error: error ? error.message : null };
}

export async function deleteTask(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  return { error: error ? error.message : null };
}

/** Active teammates for the Assign picker (SECURITY DEFINER RPC — agents can't read profiles). */
export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const { data } = await supabase.rpc('get_my_team_members');
  return (data as TeamMember[]) ?? [];
}

// ── display helpers ───────────────────────────────────────────────────────

export function dueLabel(t: Task, today = manilaToday()): string {
  if (t.status === 'deferred' && t.deferred_until) return `Deferred to ${prettyDate(t.deferred_until)}`;
  if (!t.due_date) return 'Anytime';
  if (t.due_date === today) return 'Today';
  if (isOverdue(t, today)) return `Overdue · ${prettyDate(t.due_date)}`;
  return prettyDate(t.due_date);
}

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/** Date string N days from today (Manila), for the quick defer options. */
export function daysFromToday(n: number): string {
  const [y, m, d] = manilaToday().split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
