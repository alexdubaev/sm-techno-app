import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Dashboard } from '@/components/admin-dashboard/dashboard';

const api = vi.hoisted(() => ({sales: vi.fn(), usage: vi.fn(), balance: vi.fn(), admin: true}));
vi.mock('@/components/auth-provider', () => ({useAuth: () => ({isAdmin:api.admin,user:{id:1}})}));
vi.mock('@/lib/api', () => ({fetchAdminSales:api.sales,fetchAdminUsage:api.usage,fetchAdminBalance:api.balance,invalidateApiCache:vi.fn()}));
vi.mock('recharts', () => ({Bar:()=>null,BarChart:()=>null,CartesianGrid:()=>null,ResponsiveContainer:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null}));

beforeEach(() => {
  api.admin = true;
  api.sales.mockImplementation(async (kind:string, date:string) => ({period:{kind,anchorDate:date,start:date,end:date},totals:{salesTotal:0,count:0},series:[],managers:[],monthlyPlans:{month:date.slice(0,7),managers:[]},sources:{manualCount:0,onecCount:0,odataConnected:false}}));
  api.usage.mockRejectedValue(new Error('offline'));
  api.balance.mockResolvedValue({status:'available',checkedAt:'2026-11-01T00:00:00Z',isAvailable:true,balances:[{currency:'USD',totalBalance:'0',grantedBalance:'0',toppedUpBalance:'0'}]});
});
it('keeps sales and zero balance visible when usage fails and switches period', async () => {
  render(<Dashboard />);
  expect(await screen.findByText(/За этот период продаж нет/)).toBeInTheDocument();
  expect(await screen.findByText('0 USD')).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить');
  await userEvent.click(screen.getByRole('button',{name:'Год'}));
  await waitFor(() => expect(api.sales).toHaveBeenLastCalledWith('year', expect.any(String)));
});
it('does not load admin data for an ordinary user', () => {
  api.admin = false;
  render(<Dashboard />);
  expect(screen.getByText('Нет доступа')).toBeInTheDocument();
  expect(api.sales).not.toHaveBeenCalled();
  expect(api.usage).not.toHaveBeenCalled();
  expect(api.balance).not.toHaveBeenCalled();
});
