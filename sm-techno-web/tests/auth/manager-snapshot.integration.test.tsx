import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManagerWorkspace } from '@/components/manager/manager-workspace';
import { invalidateApiCache } from '@/lib/api';

const api = vi.hoisted(() => ({fetch:vi.fn(),managers:vi.fn(),listeners:new Set<(reason:'data'|'session')=>void>()}));
vi.mock('@/components/auth-provider', () => ({useAuth:()=>({isAdmin:false,user:{id:7,role:'user'}})}));
vi.mock('@/lib/api', () => ({fetchManagerDashboard:api.fetch,fetchCachedManagerDashboard:api.fetch,fetchManagers:api.managers,fetchCachedManagers:api.managers,invalidateApiCache:(reason:'data'|'session'='session')=>api.listeners.forEach(listener=>listener(reason)),getApiCacheGeneration:()=>0,subscribeApiCacheInvalidation:(listener:(reason:'data'|'session')=>void)=>{api.listeners.add(listener);return ()=>{api.listeners.delete(listener);};}}));
vi.mock('next/dynamic', () => ({default:()=>()=>null}));
vi.mock('@/components/manager/manager-avatar', () => ({ManagerAvatar:()=>null}));
vi.mock('@/components/manager/manager-editor', () => ({ManagerEditor:()=>null}));
vi.mock('@/components/manager/manager-history', () => ({ManagerHistory:()=>null}));
vi.mock('@/components/manager/manager-sales', () => ({ManagerSales:()=>null}));

beforeEach(() => {
  api.managers.mockResolvedValue([]);
  api.fetch.mockResolvedValue({account:{id:3,userId:7,name:'Менеджер тест',archived:false,avatarVersion:0,hasAvatar:false},month:'2026-11',version:1,closed:false,terms:null,summary:{salesTotal:123400,fixed:null,commission:null,income:null,above:null,remaining:null,count:2},daily:[],sales:[],total:2,page:1,pages:1});
});
afterEach(() => { invalidateApiCache('session'); vi.useRealTimers(); });

it('keeps the manager month and restores the warm dashboard snapshot on return', async () => {
  const first = render(<ManagerWorkspace initialMonth="2026-11" />);
  expect(await screen.findByRole('heading',{name:'Менеджер тест'})).toBeVisible();
  first.unmount();

  render(<ManagerWorkspace initialMonth="2026-11" />);
  expect(screen.getByRole('heading',{name:'Менеджер тест'})).toBeVisible();
  expect(screen.queryByText('Загрузка кабинета…')).not.toBeInTheDocument();
});

it('keeps an active manager cabinet visible after cache TTL on an unrelated rerender', async () => {
  vi.useFakeTimers({toFake:['Date']});
  const view = render(<ManagerWorkspace initialMonth="2026-11" />);
  expect(await screen.findByRole('heading',{name:'Менеджер тест'})).toBeVisible();
  vi.setSystemTime(Date.now() + 6 * 60_000);

  view.rerender(<ManagerWorkspace initialMonth="2026-11" />);

  expect(screen.getByRole('heading',{name:'Менеджер тест'})).toBeVisible();
});
