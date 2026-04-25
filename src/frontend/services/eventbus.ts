export type EventType =
  | 'CHAT_SEND'
  | 'CHAT_STREAM_START'
  | 'CHAT_STREAM_CHUNK'
  | 'CHAT_STREAM_END'
  | 'CHAT_ERROR'
  | 'SETTINGS_UPDATE'
  | 'TOGGLE_SIDEBAR'
  | 'CLEAR_CHAT'
  | 'CONFIG_LOADED';

export type Listener = (...args: unknown[]) => void;

class EventBus {
  private listeners: Map<EventType, Listener[]> = new Map();

  on(event: EventType, listener: Listener): () => void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);

    return () => {
      this.off(event, listener);
    };
  }

  off(event: EventType, listener: Listener): void {
    const existing = this.listeners.get(event);
    if (!existing) return;
    const idx = existing.indexOf(listener);
    if (idx !== -1) {
      existing.splice(idx, 1);
    }
  }

  emit(event: EventType, ...args: unknown[]): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.forEach((fn) => {
      try {
        fn(...args);
      } catch (err) {
        console.error(`EventBus error on "${event}":`, err);
      }
    });
  }

  once(event: EventType, listener: Listener): () => void {
    const wrapper = (...args: unknown[]) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  clear(event?: EventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = new EventBus();
