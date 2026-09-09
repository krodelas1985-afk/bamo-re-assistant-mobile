import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatHistoryStore } from './chat-history-store';

const stores = new Map<string, ChatHistoryStore>();

/** Account-specific device storage; no database, migration, or cloud sync. */
export function getChatHistory(userId: string) {
  let store = stores.get(userId);
  if (!store) {
    store = new ChatHistoryStore(userId, AsyncStorage);
    stores.set(userId, store);
  }
  return store;
}
