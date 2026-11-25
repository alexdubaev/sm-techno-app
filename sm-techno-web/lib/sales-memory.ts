import { getApiCacheGeneration, subscribeApiCacheInvalidation } from './api';

const MAX_SNAPSHOT_AGE_MS = 5 * 60_000;
const SNAPSHOT_FRESH_MS = 30_000;
const MAX_SNAPSHOT_COUNT = 80;

type Snapshot<T> = { data: T; savedAt: number; generation: number };
const snapshots = new Map<string, Snapshot<unknown>>();
const dashboardSelections = new Map<string, { period: string; date: string }>();
const managerSelections = new Map<string, { month: string; managerId?: number }>();
let lastPresentedChart = '';

subscribeApiCacheInvalidation((reason) => {
  snapshots.clear();
  if (reason === 'session') { dashboardSelections.clear(); managerSelections.clear(); }
  lastPresentedChart = '';
});

export function isSalesSnapshotUsable(savedAt: number, now = Date.now()) {
  const age = now - savedAt;
  return age >= 0 && age <= MAX_SNAPSHOT_AGE_MS;
}

export function readSalesSnapshot<T>(key: string, now = Date.now()): { data: T; fresh: boolean; savedAt: number } | null {
  const snapshot = snapshots.get(key) as Snapshot<T> | undefined;
  if (!snapshot || snapshot.generation !== getApiCacheGeneration()) return null;
  const age = now - snapshot.savedAt;
  if (age < 0 || age > MAX_SNAPSHOT_AGE_MS) {
    snapshots.delete(key);
    return null;
  }
  return { data: snapshot.data, fresh: age <= SNAPSHOT_FRESH_MS, savedAt: snapshot.savedAt };
}

export function writeSalesSnapshot<T>(key: string, data: T, generation = getApiCacheGeneration(), now = Date.now()) {
  if (generation !== getApiCacheGeneration()) return false;
  for (const [cachedKey, snapshot] of snapshots) {
    if (now - snapshot.savedAt > MAX_SNAPSHOT_AGE_MS) snapshots.delete(cachedKey);
  }
  while (snapshots.size >= MAX_SNAPSHOT_COUNT && !snapshots.has(key)) {
    const oldest = snapshots.keys().next().value;
    if (oldest === undefined) break;
    snapshots.delete(oldest);
  }
  snapshots.set(key, { data, savedAt: now, generation });
  return true;
}

export function clearSalesSnapshot(key: string) {
  snapshots.delete(key);
}

export function readDashboardSelection(key: string) {
  return dashboardSelections.get(key) ?? null;
}

export function writeDashboardSelection(key: string, selection: { period: string; date: string }) {
  dashboardSelections.set(key, selection);
}

export function claimSalesChartAnimation(key: string) {
  if (lastPresentedChart === key) return false;
  lastPresentedChart = key;
  return true;
}

export function readManagerSelection(key: string) {
  return managerSelections.get(key) ?? null;
}

export function writeManagerSelection(key: string, selection: { month: string; managerId?: number }) {
  managerSelections.set(key, selection);
}
