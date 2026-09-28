import { useSyncExternalStore } from "react";
import type { SplitDTO } from "@avaxland/protocol";

type Listener = () => void;

function createStore<T>(init: T) {
  let state = init;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(update: (s: T) => T) {
      state = update(state);
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export interface Toast {
  id: number;
  title: string;
  sub?: string;
  kind: "badge" | "info" | "error";
}

export const flowsStore = createStore<SplitDTO[]>([]);
export const toastStore = createStore<Toast[]>([]);
export const wsStore = createStore<{ connected: boolean }>({ connected: false });

let toastSeq = 1;
export function pushToast(t: Omit<Toast, "id">, ttl = 4500) {
  const id = toastSeq++;
  toastStore.set((s) => [...s, { ...t, id }]);
  setTimeout(() => toastStore.set((s) => s.filter((x) => x.id !== id)), ttl);
}

export function pushFlow(split: SplitDTO) {
  flowsStore.set((s) => {
    if (s.some((x) => x.txHash === split.txHash && x.logIndex === split.logIndex)) return s;
    return [split, ...s].slice(0, 30);
  });
}

export function useStore<T>(store: { get: () => T; subscribe: (l: Listener) => () => void }): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** 左侧「发帖」按钮按一次加一，时间线上的发帖框看到变化就把光标放进去 */
export const composeStore = createStore(0);
