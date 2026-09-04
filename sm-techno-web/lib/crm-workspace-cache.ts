import type { CrmTab, CrmWorkspaceClient } from "@/lib/types";

type CrmWorkspaceTab = "primary" | number;

export type CrmWorkspaceCacheEntry = {
  tabs: CrmTab[];
  clients: CrmWorkspaceClient[];
  primaryOrderVersion: number | null;
};

const workspaceCache = new Map<string, CrmWorkspaceCacheEntry>();

function cacheKey(ownerId: number, tab: CrmWorkspaceTab) {
  return `${ownerId}:${tab}`;
}

export function readCrmWorkspaceCache(ownerId: number, tab: CrmWorkspaceTab): CrmWorkspaceCacheEntry | null {
  return workspaceCache.get(cacheKey(ownerId, tab)) ?? null;
}

export function saveCrmWorkspaceCache(ownerId: number, tab: CrmWorkspaceTab, entry: CrmWorkspaceCacheEntry) {
  workspaceCache.set(cacheKey(ownerId, tab), entry);
}

export function updateCrmWorkspaceCache(ownerId: number, tab: CrmWorkspaceTab, update: (entry: CrmWorkspaceCacheEntry) => CrmWorkspaceCacheEntry) {
  const current = readCrmWorkspaceCache(ownerId, tab);
  if (current) saveCrmWorkspaceCache(ownerId, tab, update(current));
}
