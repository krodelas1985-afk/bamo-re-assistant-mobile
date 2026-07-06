import { supabase } from '@/lib/supabase';

/**
 * Assignment activity feed. Backed by get_my_assignment_feed(), a SECURITY
 * DEFINER RPC that returns the signed-in agent's assignment events — leads newly
 * assigned to them and leads reassigned away — with the lead name resolved
 * server-side (an agent can no longer read a lead once it leaves them, so the
 * name can't be joined client-side).
 */

export type AssignmentDirection = 'assigned_to_me' | 'reassigned_away';

export type AssignmentEvent = {
  id: string;
  leadId: string;
  leadName: string | null;
  direction: AssignmentDirection;
  method: string;
  createdAt: string;
};

type FeedRow = {
  id: string;
  lead_id: string;
  lead_name: string | null;
  direction: AssignmentDirection;
  method: string;
  created_at: string;
};

export async function fetchAssignmentFeed(): Promise<{
  data: AssignmentEvent[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_my_assignment_feed', { p_limit: 40 });
  if (error) return { data: [], error: error.message };
  const rows = (data as FeedRow[]) ?? [];
  return {
    data: rows.map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      leadName: r.lead_name,
      direction: r.direction,
      method: r.method,
      createdAt: r.created_at,
    })),
    error: null,
  };
}
