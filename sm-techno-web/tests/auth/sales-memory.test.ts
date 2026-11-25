import { afterEach, expect, it } from 'vitest';
import { getApiCacheGeneration, invalidateApiCache } from '@/lib/api';
import { claimSalesChartAnimation, readDashboardSelection, readSalesSnapshot, writeDashboardSelection, writeSalesSnapshot } from '@/lib/sales-memory';

afterEach(() => invalidateApiCache('session'));

it('returns a warm scoped snapshot and expires it after the allowed maximum age', () => {
  const generation = getApiCacheGeneration();
  expect(writeSalesSnapshot('7:admin:sales:month:2026-11-25', { total: 12 }, generation, 1000)).toBe(true);
  expect(readSalesSnapshot<{total:number}>('7:admin:sales:month:2026-11-25', 20_000)).toEqual({data:{total:12},fresh:true,savedAt:1000});
  expect(readSalesSnapshot('8:admin:sales:month:2026-11-25', 20_000)).toBeNull();
  expect(readSalesSnapshot('7:admin:sales:month:2026-11-25', 302_000)).toBeNull();
});

it('rejects a response from before API invalidation and clears snapshots on mutation', () => {
  const generation = getApiCacheGeneration();
  invalidateApiCache('data');
  expect(writeSalesSnapshot('sales', { total: 99 }, generation, 1000)).toBe(false);
  expect(readSalesSnapshot('sales', 1001)).toBeNull();
});

it('keeps period selection after data writes but clears it when the session changes', () => {
  writeDashboardSelection('7:admin', {period:'quarter',date:'2026-09-09'});
  invalidateApiCache('data');
  expect(readDashboardSelection('7:admin')).toEqual({period:'quarter',date:'2026-09-09'});
  invalidateApiCache('session');
  expect(readDashboardSelection('7:admin')).toBeNull();
});

it('bounds retained query snapshots during long sessions', () => {
  const generation = getApiCacheGeneration();
  for (let index = 0; index < 81; index += 1) {
    writeSalesSnapshot(`query:${index}`, index, generation, 1000 + index);
  }
  expect(readSalesSnapshot('query:0', 1100)).toBeNull();
  expect(readSalesSnapshot<number>('query:80', 1100)?.data).toBe(80);
});

it('tracks trend and manager breakdown chart presentation independently by period', () => {
  expect(claimSalesChartAnimation('trend', 'admin:month:2026-11-01')).toBe(true);
  expect(claimSalesChartAnimation('breakdown', 'admin:month:2026-11-01')).toBe(true);
  expect(claimSalesChartAnimation('trend', 'admin:month:2026-11-01')).toBe(false);
  expect(claimSalesChartAnimation('breakdown', 'admin:month:2026-11-01')).toBe(false);

  expect(claimSalesChartAnimation('trend', 'admin:month:2026-12-01')).toBe(true);
  expect(claimSalesChartAnimation('breakdown', 'admin:month:2026-12-01')).toBe(true);
  expect(claimSalesChartAnimation('trend', 'admin:month:2026-12-01')).toBe(false);
  expect(claimSalesChartAnimation('breakdown', 'admin:month:2026-12-01')).toBe(false);
});

it('allows chart animation again after API data invalidation', () => {
  expect(claimSalesChartAnimation('trend', 'admin:month:2026-11-01')).toBe(true);
  expect(claimSalesChartAnimation('breakdown', 'admin:month:2026-11-01')).toBe(true);
  invalidateApiCache('data');
  expect(claimSalesChartAnimation('trend', 'admin:month:2026-11-01')).toBe(true);
  expect(claimSalesChartAnimation('breakdown', 'admin:month:2026-11-01')).toBe(true);
});
