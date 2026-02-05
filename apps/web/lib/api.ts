import { createClient } from '@/lib/supabase/client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  return {
    'Content-Type': 'application/json',
  };
}

export async function api<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body } = options;
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
    throw new Error(error.detail || 'An error occurred');
  }

  return response.json();
}

// Account API
export const accountsApi = {
  list: () => api<Account[]>('/api/v1/accounts'),
  get: (id: string) => api<Account>(`/api/v1/accounts/${id}`),
  create: (data: CreateAccountInput) => api<Account>('/api/v1/accounts', { method: 'POST', body: data }),
  update: (id: string, data: UpdateAccountInput) => api<Account>(`/api/v1/accounts/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => api<void>(`/api/v1/accounts/${id}`, { method: 'DELETE' }),
  balances: () => api<AccountBalance[]>('/api/v1/accounts/balances'),
};

// Transaction API
export const transactionsApi = {
  list: (params?: TransactionFilters) => {
    const searchParams = new URLSearchParams();
    if (params?.period) searchParams.set('period', params.period);
    if (params?.account_id) searchParams.set('account_id', params.account_id);
    if (params?.category_id) searchParams.set('category_id', params.category_id);
    if (params?.allowance_id) searchParams.set('allowance_id', params.allowance_id);
    if (params?.annual_budget_id) searchParams.set('annual_budget_id', params.annual_budget_id);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    const query = searchParams.toString();
    return api<Transaction[]>(`/api/v1/transactions${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api<Transaction>(`/api/v1/transactions/${id}`),
  create: (data: CreateTransactionInput) => api<Transaction>('/api/v1/transactions', { method: 'POST', body: data }),
  update: (id: string, data: UpdateTransactionInput) => api<Transaction>(`/api/v1/transactions/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => api<void>(`/api/v1/transactions/${id}`, { method: 'DELETE' }),
  transfer: (data: TransferInput) => api<Transaction>('/api/v1/transactions/transfer', { method: 'POST', body: data }),
};

// Category API
export const categoriesApi = {
  list: () => api<Category[]>('/api/v1/categories'),
  get: (id: string) => api<Category>(`/api/v1/categories/${id}`),
  create: (data: CreateCategoryInput) => api<Category>('/api/v1/categories', { method: 'POST', body: data }),
  update: (id: string, data: UpdateCategoryInput) => api<Category>(`/api/v1/categories/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => api<void>(`/api/v1/categories/${id}`, { method: 'DELETE' }),
};

// Budget API
export const budgetsApi = {
  list: (params?: { period?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.period) searchParams.set('period', params.period);
    const query = searchParams.toString();
    return api<Budget[]>(`/api/v1/budgets${query ? `?${query}` : ''}`);
  },
  comparison: (period: string) => api<BudgetComparison[]>(`/api/v1/budgets/comparison?period=${period}`),
  create: (data: CreateBudgetInput) => api<Budget>('/api/v1/budgets', { method: 'POST', body: data }),
  update: (id: string, data: UpdateBudgetInput) => api<Budget>(`/api/v1/budgets/${id}`, { method: 'PATCH', body: data }),
  copy: (fromPeriod: string, toPeriod: string) =>
    api<Budget[]>('/api/v1/budgets/copy', { method: 'POST', body: { from_period: fromPeriod, to_period: toPeriod } }),
};

// Allowance API
export const allowancesApi = {
  list: () => api<AllowanceDefinition[]>('/api/v1/allowances'),
  get: (id: string) => api<AllowanceDefinition>(`/api/v1/allowances/${id}`),
  create: (data: CreateAllowanceInput) => api<AllowanceDefinition>('/api/v1/allowances', { method: 'POST', body: data }),
  update: (id: string, data: UpdateAllowanceInput) => api<AllowanceDefinition>(`/api/v1/allowances/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => api<void>(`/api/v1/allowances/${id}`, { method: 'DELETE' }),
  balances: (params?: { period?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.period) searchParams.set('period', params.period);
    const query = searchParams.toString();
    return api<AllowanceBalance[]>(`/api/v1/allowances/balances${query ? `?${query}` : ''}`);
  },
  recalculate: (balanceId: string) => api<AllowanceBalance>(`/api/v1/allowances/balances/${balanceId}/recalculate`, { method: 'POST' }),
  rollover: () => api<void>('/api/v1/allowances/rollover', { method: 'POST' }),
};

// Annual Budget API
export const annualBudgetsApi = {
  list: (params?: { year?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.year) searchParams.set('year', params.year);
    const query = searchParams.toString();
    return api<AnnualBudget[]>(`/api/v1/annual-budgets${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api<AnnualBudget>(`/api/v1/annual-budgets/${id}`),
  create: (data: CreateAnnualBudgetInput) => api<AnnualBudget>('/api/v1/annual-budgets', { method: 'POST', body: data }),
  update: (id: string, data: UpdateAnnualBudgetInput) => api<AnnualBudget>(`/api/v1/annual-budgets/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => api<void>(`/api/v1/annual-budgets/${id}`, { method: 'DELETE' }),
};

// Investment API
export const investmentsApi = {
  list: () => api<Investment[]>('/api/v1/investments'),
  get: (id: string) => api<Investment>(`/api/v1/investments/${id}`),
  create: (data: CreateInvestmentInput) => api<Investment>('/api/v1/investments', { method: 'POST', body: data }),
  buy: (id: string, data: InvestmentTransaction) => api<Investment>(`/api/v1/investments/${id}/buy`, { method: 'POST', body: data }),
  sell: (id: string, data: InvestmentTransaction) => api<Investment>(`/api/v1/investments/${id}/sell`, { method: 'POST', body: data }),
  dividend: (id: string, data: DividendInput) => api<void>(`/api/v1/investments/${id}/dividend`, { method: 'POST', body: data }),
  refreshPrices: () => api<void>('/api/v1/investments/refresh-prices', { method: 'POST' }),
};

// Exchange Rate API
export const exchangeRatesApi = {
  get: (from: string, to: string, date?: string) => {
    const params = new URLSearchParams({ from, to });
    if (date) params.set('date', date);
    return api<ExchangeRate>(`/api/v1/exchange-rates?${params}`);
  },
  create: (data: CreateExchangeRateInput) => api<ExchangeRate>('/api/v1/exchange-rates', { method: 'POST', body: data }),
};

// Reports API
export const reportsApi = {
  dashboard: () => api<DashboardReport>('/api/v1/reports/dashboard'),
  netWorth: () => api<NetWorthReport>('/api/v1/reports/net-worth'),
  cashFlow: (params?: { period?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.period) searchParams.set('period', params.period);
    const query = searchParams.toString();
    return api<CashFlowReport>(`/api/v1/reports/cash-flow${query ? `?${query}` : ''}`);
  },
};

// Types
export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'investment' | 'credit' | 'cash';
  currency_code: string;
  initial_balance: number;
  current_balance: number;
  current_balance_eur: number;
  is_active: boolean;
  icon?: string;
  color?: string;
  sort_order: number;
}

export interface AccountBalance extends Account {
  pending_transactions: number;
}

export interface CreateAccountInput {
  name: string;
  type: Account['type'];
  currency_code: string;
  initial_balance: number;
  icon?: string;
  color?: string;
}

export interface UpdateAccountInput {
  name?: string;
  type?: Account['type'];
  currency_code?: string;
  is_active?: boolean;
  icon?: string;
  color?: string;
  sort_order?: number;
}

export interface Transaction {
  id: string;
  account_id: string;
  account_name: string;
  category_id: string;
  category_name: string;
  category_type: 'income' | 'expense' | 'transfer';
  user_id: string;
  amount_original: number;
  currency_original: string;
  amount_base_eur: number;
  exchange_rate: number;
  exchange_rate_source: string;
  transaction_date: string;
  accounting_period: string;
  description?: string;
  notes?: string;
  allowance_id: string | null;
  allowance_name?: string;
  annual_budget_id: string | null;
  annual_budget_name?: string;
  transfer_to_account_id?: string;
}

export interface TransactionFilters {
  period?: string;
  account_id?: string;
  category_id?: string;
  allowance_id?: string;
  annual_budget_id?: string;
  limit?: number;
}

export interface CreateTransactionInput {
  account_id: string;
  category_id: string;
  amount_original: number;
  currency_original: string;
  transaction_date: string;
  accounting_period?: string;
  description?: string;
  notes?: string;
  allowance_id?: string | null;
  annual_budget_id?: string | null;
  exchange_rate?: number;
}

export interface UpdateTransactionInput {
  category_id?: string;
  amount_original?: number;
  transaction_date?: string;
  accounting_period?: string;
  description?: string;
  notes?: string;
  allowance_id?: string | null;
  annual_budget_id?: string | null;
  exchange_rate?: number;
}

export interface TransferInput {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  currency: string;
  transaction_date: string;
  description?: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  parent_id?: string;
  icon?: string;
  color?: string;
  is_allowance: boolean;
  is_system: boolean;
  children?: Category[];
}

export interface CreateCategoryInput {
  name: string;
  type: Category['type'];
  parent_id?: string;
  icon?: string;
  color?: string;
  is_allowance?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  parent_id?: string;
  icon?: string;
  color?: string;
  is_allowance?: boolean;
}

export interface Budget {
  id: string;
  category_id: string;
  category_name: string;
  period: string;
  amount_planned: number;
  spent_amount: number;
}

export interface BudgetComparison extends Budget {
  remaining: number;
  percentage: number;
}

export interface CreateBudgetInput {
  category_id: string;
  period: string;
  amount_planned: number;
}

export interface UpdateBudgetInput {
  amount_planned: number;
}

export interface AllowanceDefinition {
  id: string;
  user_id: string;
  name: string;
  monthly_limit: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAllowanceInput {
  name: string;
  monthly_limit?: number;
}

export interface UpdateAllowanceInput {
  name?: string;
  monthly_limit?: number;
  is_active?: boolean;
}

export interface AllowanceBalance {
  id: string;
  user_id: string;
  allowance_id: string;
  allowance_name?: string;
  period: string;
  monthly_limit: number;
  carry_over_from_previous: number;
  spent_amount: number;
  created_at: string;
  updated_at: string;
}

export interface AnnualBudget {
  id: string;
  user_id: string;
  name: string;
  year: string;
  amount_planned: number;
  spent_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnualBudgetInput {
  name: string;
  year: string;
  amount_planned: number;
}

export interface UpdateAnnualBudgetInput {
  name?: string;
  amount_planned?: number;
  is_active?: boolean;
}

export interface Investment {
  id: string;
  account_id: string;
  account_name: string;
  asset_name: string;
  ticker?: string;
  asset_type: 'etf' | 'stock' | 'crypto' | 'bond';
  quantity: number;
  cost_basis: number;
  average_cost_per_unit: number;
  current_price?: number;
  current_price_currency: string;
  current_value_eur?: number;
  unrealized_gain_loss?: number;
  price_updated_at?: string;
}

export interface CreateInvestmentInput {
  account_id: string;
  asset_name: string;
  ticker?: string;
  asset_type: Investment['asset_type'];
}

export interface InvestmentTransaction {
  quantity: number;
  price_per_unit: number;
  currency: string;
  transaction_date: string;
}

export interface DividendInput {
  amount: number;
  currency: string;
  transaction_date: string;
}

export interface ExchangeRate {
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
  source: string;
}

export interface CreateExchangeRateInput {
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
}

export interface DashboardReport {
  total_balance_eur: number;
  monthly_income: number;
  monthly_expenses: number;
  net_savings: number;
}

export interface NetWorthReport {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  accounts: AccountBalance[];
  investments_value: number;
}

export interface CashFlowReport {
  period: string;
  income: number;
  expenses: number;
  net: number;
  by_category: {
    category_id: string;
    category_name: string;
    type: string;
    amount: number;
  }[];
}
