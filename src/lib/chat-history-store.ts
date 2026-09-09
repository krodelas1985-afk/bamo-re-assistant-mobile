import type { ChatMessage, PendingAction } from './baymo-chat';

export type UiMessage = ChatMessage & {
  pending?: PendingAction;
  pendingState?: 'open' | 'working' | 'confirmed' | 'cancelled' | 'expired';
};
export type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages: UiMessage[];
  context?: LeadChatContext;
};
export type LeadChatContext = {
  leadId: string;
  leadName: string;
  listingId?: string;
  listingTitle?: string;
};
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
type Snapshot = {
  conversations: Conversation[];
  ready: boolean;
  busy: boolean;
  error: string | null;
};
export const HISTORY_LIMIT = 5;

/** One store per account. In-flight replies survive leaving the chat screen. */
export class ChatHistoryStore {
  private snapshot: Snapshot = {
    conversations: [],
    ready: false,
    busy: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  private loading: Promise<void> | null = null;
  private sequence = 0;
  readonly key: string;

  constructor(
    userId: string,
    private storage: Storage,
  ) {
    this.key = `bamo.chatHistory.v1.${userId}`;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  load = (): Promise<void> => {
    if (this.snapshot.ready) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = this.read().finally(() => {
      this.loading = null;
    });
    return this.loading;
  };
  private async read() {
    try {
      const raw = await this.storage.getItem(this.key);
      const rows: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) throw new Error('Invalid history');
      const conversations: Conversation[] = rows.map((row) => {
        if (
          !row ||
          typeof row.id !== 'string' ||
          typeof row.title !== 'string' ||
          typeof row.updatedAt !== 'string' ||
          (row.context != null &&
            (typeof row.context.leadId !== 'string' ||
              typeof row.context.leadName !== 'string' ||
              (row.context.listingId != null &&
                typeof row.context.listingId !== 'string') ||
              (row.context.listingTitle != null &&
                typeof row.context.listingTitle !== 'string'))) ||
          !Array.isArray(row.messages) ||
          !row.messages.every(
            (m: UiMessage) =>
              m &&
              ['user', 'assistant'].includes(m.role) &&
              typeof m.content === 'string',
          )
        ) {
          throw new Error('Invalid conversation');
        }
        return {
          ...row,
          messages: row.messages.map((m: UiMessage) => ({
            ...m,
            // Never replay an old or interrupted enrollment after restarting.
            ...(m.pending &&
            m.pendingState !== 'confirmed' &&
            m.pendingState !== 'cancelled'
              ? { pendingState: 'expired' as const }
              : {}),
          })),
        };
      });
      this.publish({
        conversations: conversations.slice(0, HISTORY_LIMIT),
        ready: true,
        error: null,
      });
    } catch {
      this.publish({
        error: 'Could not load saved chats. Retry to keep your history safe.',
      });
    }
  }
  private persist() {
    const value = JSON.stringify(this.snapshot.conversations);
    this.writes = this.writes.then(async () => {
      try {
        await this.storage.setItem(this.key, value);
        this.publish({ error: null });
      } catch {
        this.publish({
          error:
            'Changes could not be saved on this device. Please retry before closing the app.',
        });
      }
    });
    return this.writes;
  }
  retry = () => (this.snapshot.ready ? this.persist() : this.load());
  setBusy(busy: boolean) {
    this.publish({ busy });
  }
  create(firstMessage: string, context?: LeadChatContext): string {
    if (!this.snapshot.ready) throw new Error('History is still loading');
    const id = `${Date.now()}-${++this.sequence}-${Math.random().toString(36).slice(2, 10)}`;
    const title = firstMessage.trim().replace(/\s+/g, ' ').slice(0, 60);
    const conversation = {
      id,
      title,
      updatedAt: new Date().toISOString(),
      messages: [],
      ...(context ? { context } : {}),
    };
    this.publish({
      conversations: [conversation, ...this.snapshot.conversations].slice(
        0,
        HISTORY_LIMIT,
      ),
    });
    return id;
  }
  setContext(id: string, context: LeadChatContext) {
    this.publish({
      conversations: this.snapshot.conversations.map((c) =>
        c.id === id ? { ...c, context } : c,
      ),
    });
    void this.persist();
  }
  update(id: string, change: (messages: UiMessage[]) => UiMessage[]) {
    const current = this.snapshot.conversations.find((c) => c.id === id);
    if (!current) return; // A deleted chat must never be resurrected by a late reply.
    const updated = {
      ...current,
      messages: change(current.messages),
      updatedAt: new Date().toISOString(),
    };
    this.publish({
      conversations: [
        updated,
        ...this.snapshot.conversations.filter((c) => c.id !== id),
      ],
    });
    void this.persist();
  }
  remove(id: string) {
    this.publish({
      conversations: this.snapshot.conversations.filter((c) => c.id !== id),
    });
    void this.persist();
  }
}
