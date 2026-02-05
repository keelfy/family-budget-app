# Nomad Ledger — Frontend

Next.js 14 frontend for Nomad Ledger. Built with TypeScript, Tailwind CSS, shadcn/ui, and TanStack Query.

## Running

```bash
# From repo root
npm run dev:web

# Or directly
cd apps/web
npm run dev
```

Available at `http://localhost:3000`.

Environment variables (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Architecture

### App Router Structure

The app uses Next.js 14 App Router with two route groups:

```
app/
├── layout.tsx              # Root layout (font, providers, toaster)
├── (auth)/                 # Public routes (no auth required)
│   ├── layout.tsx          # Centered card layout
│   ├── login/page.tsx      # Email + password login
│   └── register/page.tsx   # Registration form
│
└── (dashboard)/            # Protected routes (auth required)
    ├── layout.tsx          # Auth check → redirect to /login if unauthenticated
    └── dashboard/
        ├── page.tsx                # Dashboard home (summary cards, charts)
        ├── accounts/page.tsx       # Account management
        ├── transactions/
        │   ├── page.tsx            # Transaction list with filters
        │   └── new/page.tsx        # Create transaction / transfer (tabbed)
        ├── budgets/page.tsx        # Monthly budgets with comparison
        ├── annual-budgets/page.tsx # Annual budgets by year
        ├── allowances/page.tsx     # Personal allowances with period selector
        ├── investments/page.tsx    # Investment portfolio
        └── settings/page.tsx       # Profile, security, theme, preferences
```

### Authentication Flow

1. User logs in via `/login` using Supabase Auth (email + password)
2. Supabase returns a session with an access token (JWT)
3. The dashboard layout (`(dashboard)/layout.tsx`) checks for an active session via `supabase.auth.getUser()` on the server side
4. If no session, the user is redirected to `/login`
5. All API calls include the JWT as a Bearer token via the `getAuthHeaders()` helper in `lib/api.ts`

### Data Fetching

All data fetching uses **TanStack Query** (React Query v5):

- **Queries** (`useQuery`) — fetching and caching data from the API
- **Mutations** (`useMutation`) — create, update, delete operations
- **Automatic invalidation** — mutations invalidate related query keys so data stays fresh

Example pattern:
```typescript
// hooks/use-accounts.ts
export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: accountsApi.list,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAccountInput) => accountsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
```

### API Client

`lib/api.ts` contains the typed API client with:

- **`api<T>(endpoint, options)`** — base function that handles auth headers, JSON serialization, and error parsing
- **Domain-specific clients** — `accountsApi`, `transactionsApi`, `categoriesApi`, `budgetsApi`, `allowancesApi`, `annualBudgetsApi`, `investmentsApi`, `exchangeRatesApi`, `reportsApi`
- **TypeScript interfaces** — all request/response types are defined at the bottom of the file

### Theming

Dark mode is implemented with `next-themes`:

- Tailwind CSS configured with `darkMode: ['class']`
- CSS variables for light/dark defined in `globals.css` under `:root` and `.dark`
- `ThemeProvider` wraps the app in `components/providers.tsx`
- Theme toggle available in the sidebar and settings page
- Three options: Light, Dark, System

---

## Pages

### Dashboard (`/dashboard`)
Overview of financial status:
- Summary cards: total balance, monthly income, expenses, net savings
- Cash flow chart (income vs expenses by month)
- Budget status overview
- Recent transactions

### Accounts (`/dashboard/accounts`)
Manage financial accounts:
- Grid of account cards with name, type icon, balance, and currency
- Create new account dialog (name, type, currency, initial balance, icon, color)
- Edit and delete accounts
- Balance displayed in original currency and EUR equivalent

### Transactions (`/dashboard/transactions`)
Full transaction list with filtering:
- Filter by period (month), account, and category
- Table with date, description, category, account, amount
- Badges for allowance and annual budget assignments
- Click to edit any transaction

### New Transaction (`/dashboard/transactions/new`)
Tabbed form for creating transactions or transfers:

**Transaction tab:**
- Account, category, amount, currency, date
- Optional: description, notes, accounting period override
- Optional: assign to allowance (checkbox + dropdown)
- Optional: assign to annual budget (checkbox + dropdown)
- Auto-fetches exchange rate for non-EUR currencies

**Transfer tab:**
- Source account, destination account, amount, currency, date
- Optional: description
- Auto-sets currency from source account

### Monthly Budgets (`/dashboard/budgets`)
Per-category monthly budget tracking:
- Period selector (month dropdown)
- Budget vs actual comparison table
- Progress bars showing spent percentage
- Create budget dialog (category + planned amount)
- Copy budgets from one month to another

### Annual Budgets (`/dashboard/annual-budgets`)
Yearly named budget tracking:
- Year selector dropdown
- Summary cards: total budgeted, total spent, remaining
- Grid of budget cards with progress bars
- Create/edit dialog (name, year, planned amount)
- Edit/delete via dropdown menu

### Allowances (`/dashboard/allowances`)
Personal spending envelope tracking:
- Period selector (last 12 months, with "current" label)
- "How Allowances Work" info card
- Grid of allowance balance cards showing:
  - Spent vs total available (monthly limit + carry-over)
  - Progress bar (green → yellow → red)
  - Badge with remaining or overspent amount
  - Breakdown: monthly limit, carried over, total available, spent
- Dropdown menu per allowance: Re-calculate, Edit, Delete
- "Month Rollover" button creates/updates current period balances
- "Add Allowance" button opens create dialog

### Investments (`/dashboard/investments`)
Portfolio tracking:
- List of investment positions
- Per-position: name, ticker, quantity, cost basis, current value, unrealized P&L
- Buy, sell, and dividend operations
- Refresh market prices

### Settings (`/dashboard/settings`)
User preferences:
- Profile: display name (placeholder)
- Security: password reset via email, sign out
- Preferences: theme toggle (light/dark/system), base currency display, default allowance display
- Notifications: coming soon placeholder

---

## Components

### Layout Components

| Component | File | Description |
|-----------|------|-------------|
| `Shell` | `components/layout/shell.tsx` | Main app shell with sidebar + content area |
| `Sidebar` | `components/layout/sidebar.tsx` | Navigation sidebar with links, theme toggle |
| `PageHeader` | `components/layout/page-header.tsx` | Page title + description + action slot |

### Form Components

| Component | File | Description |
|-----------|------|-------------|
| `TransactionForm` | `components/forms/transaction-form.tsx` | Create/edit transaction with all fields |
| `TransferForm` | `components/forms/transfer-form.tsx` | Account-to-account transfer form |
| `AllowanceDialog` | `components/forms/allowance-dialog.tsx` | Create/edit allowance definition |
| `AnnualBudgetDialog` | `components/forms/annual-budget-dialog.tsx` | Create/edit annual budget |

### UI Components (shadcn/ui)

All UI primitives are in `components/ui/` and follow the [shadcn/ui](https://ui.shadcn.com/) pattern (Radix UI + Tailwind CSS):

`badge`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `progress`, `select`, `separator`, `skeleton`, `table`, `tabs`, `textarea`, `toast`, `toaster`, `use-toast`

---

## Hooks

All hooks are in the `hooks/` directory and follow a consistent pattern using TanStack Query.

| Hook File | Hooks Exported |
|-----------|---------------|
| `use-accounts.ts` | `useAccounts`, `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount`, `useAccountBalances` |
| `use-transactions.ts` | `useTransactions`, `useTransaction`, `useCreateTransaction`, `useUpdateTransaction`, `useDeleteTransaction`, `useTransfer` |
| `use-categories.ts` | `useCategories`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory` |
| `use-budgets.ts` | `useBudgets`, `useBudgetComparison`, `useCreateBudget`, `useUpdateBudget`, `useCopyBudgets` |
| `use-allowances.ts` | `useAllowances`, `useCreateAllowance`, `useUpdateAllowance`, `useDeleteAllowance`, `useAllowanceBalances`, `useRecalculateAllowanceBalance`, `useAllowanceRollover` |
| `use-annual-budgets.ts` | `useAnnualBudgets`, `useCreateAnnualBudget`, `useUpdateAnnualBudget`, `useDeleteAnnualBudget` |
| `use-investments.ts` | `useInvestments`, `useCreateInvestment`, `useBuyInvestment`, `useSellInvestment`, `useDividend`, `useRefreshPrices` |
| `use-reports.ts` | `useDashboardReport`, `useNetWorthReport`, `useCashFlowReport` |

### Query Key Convention

| Domain | Key Pattern |
|--------|------------|
| Accounts | `['accounts']` |
| Transactions | `['transactions', filters]` |
| Categories | `['categories']` |
| Budgets | `['budgets', params]`, `['budget-comparison', period]` |
| Allowances | `['allowances']`, `['allowance-balances', params]` |
| Annual Budgets | `['annual-budgets', params]` |
| Investments | `['investments']` |
| Reports | `['dashboard']`, `['net-worth']`, `['cash-flow', params]` |

---

## Utilities

### `lib/utils.ts`

| Function | Description |
|----------|-------------|
| `cn(...inputs)` | Tailwind class name merger (clsx + tailwind-merge) |
| `formatCurrency(amount, currency?)` | Format number as currency string (default EUR) |
| `formatDate(dateStr)` | Format date string as localized date |
| `parseLocalDate(dateStr)` | Parse YYYY-MM-DD as local date (avoids timezone shift) |
| `getCurrentPeriod()` | Get current YYYY-MM period string |
| `formatPeriod(period)` | Format YYYY-MM as "February 2026" |
| `getPercentage(value, total)` | Calculate percentage (0-100) |

### `lib/api.ts`

| Function | Description |
|----------|-------------|
| `getAuthHeaders()` | Get Authorization + Content-Type headers with current JWT |
| `api<T>(endpoint, options)` | Base fetch wrapper with auth, JSON, and error handling |

### `lib/supabase/client.ts`
Browser-side Supabase client using `@supabase/ssr`.

### `lib/supabase/server.ts`
Server-side Supabase client for use in Server Components and Route Handlers.

---

## Sidebar Navigation

| Label | Route | Icon |
|-------|-------|------|
| Dashboard | `/dashboard` | `LayoutDashboard` |
| Accounts | `/dashboard/accounts` | `Wallet` |
| Transactions | `/dashboard/transactions` | `ArrowLeftRight` |
| Budgets | `/dashboard/budgets` | `PieChart` |
| Annual Budgets | `/dashboard/annual-budgets` | `Calendar` |
| Allowances | `/dashboard/allowances` | `CreditCard` |
| Investments | `/dashboard/investments` | `TrendingUp` |
| Settings | `/dashboard/settings` | `Settings` |

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 14.1.0 | React framework with App Router |
| `react` | 18.x | UI library |
| `typescript` | 5.x | Type safety |
| `tailwindcss` | 3.x | Utility-first CSS |
| `@tanstack/react-query` | 5.x | Server state management |
| `react-hook-form` | 7.x | Form state management |
| `@hookform/resolvers` | 3.x | Zod resolver for react-hook-form |
| `zod` | 3.x | Schema validation |
| `@supabase/ssr` | latest | Supabase client for SSR |
| `@supabase/supabase-js` | 2.x | Supabase JavaScript client |
| `next-themes` | latest | Theme switching (light/dark/system) |
| `recharts` | 2.x | Charting library |
| `lucide-react` | latest | Icon library |
| `date-fns` | 3.x | Date utilities |
| `@radix-ui/*` | various | Accessible UI primitives (via shadcn/ui) |
