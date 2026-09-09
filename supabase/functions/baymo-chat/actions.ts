import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Scope = {
  admin: SupabaseClient;
  uid: string;
  clientId: string | null;
  role: string | null;
};
export type RecordAction = {
  type: "create_task" | "create_appointment";
  id: string;
  title: string;
  lead_id: string | null;
  lead_name: string | null;
  notes: string | null;
  due_date: string | null;
  scheduled_at: string | null;
  appointment_type: "viewing" | "call" | "event";
  location: string | null;
  contact_name: string | null;
  warning: string;
  expires_at: number;
  signature: string;
};

const clean = (v: unknown, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

async function signature(
  scope: Scope,
  action: Omit<RecordAction, "signature">,
  secret: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // Fixed field order also rejects client edits before execution.
  const text = JSON.stringify([
    scope.uid,
    scope.clientId,
    action.type,
    action.id,
    action.title,
    action.lead_id,
    action.lead_name,
    action.notes,
    action.due_date,
    action.scheduled_at,
    action.appointment_type,
    action.location,
    action.contact_name,
    action.warning,
    action.expires_at,
  ]);
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(text),
  );
  return Array.from(
    new Uint8Array(bytes),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

async function leadFor(scope: Scope, id: string) {
  let q = scope.admin.from("leads").select("id,name,phone").eq("id", id).eq(
    "client_id",
    scope.clientId,
  );
  if (scope.role === "agent") q = q.eq("assigned_user_id", scope.uid);
  const { data, error } = await q.maybeSingle();
  if (error || !data) {
    throw new Error("This lead is no longer available to you.");
  }
  return data;
}

async function checkSchedule(scope: Scope, time: string) {
  const start = Date.parse(time);
  const { data, error } = await scope.admin.from("appointments").select("id")
    .eq("client_id", scope.clientId).eq("created_by", scope.uid).eq(
      "status",
      "scheduled",
    )
    .gt("scheduled_at", new Date(start - 3600000).toISOString())
    .lt("scheduled_at", new Date(start + 3600000).toISOString()).limit(1);
  if (error) {
    throw new Error("Could not check your calendar. Please try again.");
  }
  if (data?.length) {
    throw new Error(
      "You have a booking within one hour of this time. Please choose another time.",
    );
  }
}

export async function proposeRecord(
  scope: Scope,
  type: RecordAction["type"],
  args: Record<string, unknown>,
  secret: string,
) {
  if (!scope.clientId) throw new Error("No workspace is available.");
  const title = clean(args.title);
  if (!title) throw new Error("Ask the agent for a task or appointment title.");
  const leadId = clean(args.lead_id) || null;
  const lead = leadId ? await leadFor(scope, leadId) : null;
  const due = clean(args.due_date) || null;
  if (due && !validDate(due)) {
    throw new Error("Ask for a valid due date (YYYY-MM-DD, Manila).");
  }
  const scheduled = clean(args.scheduled_at) || null;
  const appointmentType = args.appointment_type;
  const location = clean(args.location, 500) || null;
  const contact = lead?.name ?? (clean(args.contact_name) || null);
  if (type === "create_appointment") {
    if (
      !scheduled ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/.test(scheduled) ||
      !validDate(scheduled.slice(0, 10)) ||
      !Number.isFinite(Date.parse(scheduled)) ||
      Date.parse(scheduled) <= Date.now()
    ) {
      throw new Error(
        "Ask for a future date and explicit time in Manila, with AM/PM if ambiguous.",
      );
    }
    if (!["viewing", "call", "event"].includes(String(appointmentType))) {
      throw new Error("Ask whether this is a viewing, call, or event.");
    }
    if (!contact) {
      throw new Error("Ask which lead or contact the appointment is for.");
    }
    if (!location) {
      throw new Error("Ask for the meeting location or call method.");
    }
    await checkSchedule(scope, scheduled);
  }
  const action: RecordAction = {
    type,
    id: crypto.randomUUID(),
    title,
    lead_id: leadId,
    lead_name: lead?.name ?? null,
    notes: clean(args.notes, 2000) || null,
    due_date: type === "create_task" ? due : null,
    scheduled_at: type === "create_appointment" ? scheduled : null,
    appointment_type: (appointmentType as RecordAction["appointment_type"]) ||
      "call",
    location,
    contact_name: contact,
    warning: type === "create_task"
      ? "Saves a task only. No timed notification."
      : "Calendar check uses one-hour blocks. Saving does not notify the client.",
    expires_at: Date.now() + 30 * 60 * 1000,
    signature: "",
  };
  action.signature = await signature(scope, action, secret);
  return action;
}

/** Same signed UUID is used on every retry; the existing primary key prevents duplicates. */
export async function executeRecord(
  scope: Scope,
  value: unknown,
  secret: string,
) {
  const a = value as RecordAction;
  if (
    !scope.clientId || !a ||
    !["create_task", "create_appointment"].includes(a.type) ||
    typeof a.signature !== "string" ||
    await signature(scope, a, secret) !== a.signature
  ) {
    throw new Error(
      "This proposal is invalid. Ask BayMo to prepare a new one.",
    );
  }
  const table = a.type === "create_task" ? "tasks" : "appointments";
  const existing = async () => {
    const { data, error } = await scope.admin.from(table).select("id")
      .eq("id", a.id).eq("client_id", scope.clientId).eq(
        "created_by",
        scope.uid,
      ).maybeSingle();
    if (error) {
      throw new Error("Could not verify the save. Retry this same card.");
    }
    return data;
  };
  const result = {
    ok: true,
    message: `${
      a.type === "create_task" ? "Task" : "Appointment"
    } saved: ${a.title}. ${a.warning}`,
  };
  if (await existing()) return result;
  if (a.expires_at < Date.now()) {
    throw new Error("This proposal expired. Ask BayMo to prepare it again.");
  }
  const lead = a.lead_id ? await leadFor(scope, a.lead_id) : null;
  if (a.type === "create_appointment") {
    if (Date.parse(a.scheduled_at!) <= Date.now()) {
      throw new Error(
        "This appointment time has passed. Choose a future time.",
      );
    }
    await checkSchedule(scope, a.scheduled_at!);
  }
  const shared = {
    id: a.id,
    client_id: scope.clientId,
    created_by: scope.uid,
    lead_id: a.lead_id,
    title: a.title,
    notes: a.notes,
  };
  const { error } = a.type === "create_task"
    ? await scope.admin.from("tasks").insert({
      ...shared,
      status: "pending",
      source: "baymo",
      assigned_to: scope.uid,
      due_date: a.due_date,
      task_type: a.lead_id ? "Follow-up" : "Other",
    })
    : await scope.admin.from("appointments").insert({
      ...shared,
      status: "scheduled",
      scheduled_at: a.scheduled_at,
      appointment_type: a.appointment_type,
      location: a.location,
      contact_name: a.contact_name,
      contact_phone: lead?.phone ?? null,
    });
  if (error && !(await existing())) {
    throw new Error(
      "Save could not be confirmed. Retry this same card; do not create another.",
    );
  }
  return result;
}
