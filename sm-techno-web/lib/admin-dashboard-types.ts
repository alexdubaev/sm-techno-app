export type PeriodKind = 'week' | 'month' | 'quarter' | 'year';
export type Period = {kind: PeriodKind; start: string; end: string; anchorDate: string};
export type SalesOverview = {
  period: Period; totals: {salesTotal: number; count: number};
  series: {date: string; amount: number; count: number}[];
  managers: {id: number; userId: number | null; name: string; active: boolean; archived: boolean; salesTotal: number; count: number}[];
  monthlyPlans: {month: string; managers: {id: number; name: string; plan: number | null; salesTotal: number; progress: number | null; status: 'unset' | 'no_plan' | 'planned'}[]};
  sources: {manualCount: number; onecCount: number; odataConnected: boolean};
};
export type UsageOverview = {period: Period; trackingStartedAt: string | null; recordingDegraded: boolean;
  totals: {requests: number; failedRequests: number; promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; unknownUsageRequests: number};
  series: {date: string; requests: number; totalTokens: number | null; unknownUsageRequests: number}[]};
export type Balance = {status: 'available' | 'unconfigured' | 'unavailable'; checkedAt: string; isAvailable: boolean | null; balances: {currency: string; totalBalance: string; grantedBalance: string; toppedUpBalance: string}[]};
