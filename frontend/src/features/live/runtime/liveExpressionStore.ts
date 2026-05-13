import { useSyncExternalStore } from "react";
import type { LiveExpressionSnapshot } from "../types";

const EMPTY_SNAPSHOT: LiveExpressionSnapshot | null = null;
const snapshots = new Map<string, LiveExpressionSnapshot>();
const listeners = new Set<() => void>();

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

export const publishLiveExpressionSnapshot = (
  snapshot: LiveExpressionSnapshot,
) => {
  snapshots.set(snapshot.blockId, snapshot);
  emitChange();
};

export const clearLiveExpressionSnapshot = (blockId: string) => {
  if (snapshots.delete(blockId)) {
    emitChange();
  }
};

export const getLiveExpressionSnapshot = (blockId?: string) =>
  (blockId ? snapshots.get(blockId) : undefined) ?? EMPTY_SNAPSHOT;

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const useLiveExpressionSnapshot = (blockId?: string) =>
  useSyncExternalStore(
    subscribe,
    () => getLiveExpressionSnapshot(blockId),
    () => EMPTY_SNAPSHOT,
  );
