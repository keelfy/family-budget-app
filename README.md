# Nomad Ledger

Personal finance web application with multi-currency support, monthly & annual budgeting, named personal allowances, and investment tracking.

## Features

- **Multi-Currency Support** — Track transactions in any currency with automatic EUR conversion using ECB rates (Frankfurter API)
- **Account Management** — Checking, savings, investment, credit, and cash accounts with real-time balance tracking
- **Transaction Tracking** — Record income, expenses, and account-to-account transfers with category classification
- **Monthly Budgets** — Set per-category monthly budgets and compare planned vs actual spending
- **Annual Budgets** — Create yearly budgets (e.g. "Trips", "Concerts") and assign individual transactions to them
- **Personal Allowances** — Named allowances with monthly limits and automatic carry-over of unspent amounts
- **Investment Portfolio** — Track stocks, ETFs, crypto, and bonds with buy/sell/dividend operations and P&L calculations
- **Dashboard & Reports** — Net worth, cash flow, and budget status at a glance
- **Dark Mode** — Light, dark, and system theme support

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form + Zod |
| Backend | FastAPI (Python 3.14+), Pydantic v2, uvicorn |
| Database | PostgreSQL 16 (psycopg 3) |
| Auth | HTTP Basic (email + password, bcrypt hashes in `users`) |
| Charts | Recharts |
| Icons | Lucide React |
| Monorepo | Turborepo |

## Project Structure

```
nomad-ledger/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/               # Login, Register pages
│   │   │   │   ├── login/
│   │   │   │   └── register/
│   │   │   └── (dashboard)/          # Protected routes
│   │   │       └── dashboard/
│   │   │           ├── page.tsx              # Dashboard home
│   │   │           ├── accounts/             # Account management
│   │   │           ├── transactions/         # Transaction list + new/edit
│   │   │           ├── budgets/              # Monthly budgets
│   │   │           ├── annual-budgets/       # Annual budgets
│   │   │           ├── allowances/           # Personal allowances
│   │   │           ├── investments/          # Investment portfolio
│   │   │           └── settings/             # User settings
│   │   ├── components/
│   │   │   ├── forms/                # Transaction, transfer, budget, allowance, annual budget dialogs
│   │   │   ├── layout/               # Shell, sidebar, page-header
│   │   │   └── ui/                   # shadcn/ui primitives
│   │   ├── hooks/                    # React Query hooks for each domain
│   │   └── lib/
│   │       ├── api.ts                # Typed API client + interfaces
│   │       ├── utils.ts              # Formatting helpers
│   │       └── auth.ts               # Basic-auth credential cookie helpers
│   │
│   └── api/                          # FastAPI backend
│       ├── app/
│       │   ├── main.py               # App entry, CORS, router registration
│       │   ├── dependencies.py       # Basic-auth user + DB dependencies
│       │   ├── security.py           # Password hashing
│       │   ├── db/                   # PostgreSQL pool + query helpers
│       │   ├── models/               # Pydantic schemas per domain
│       │   ├── routers/              # API route handlers
│       │   │   ├── auth.py
│       │   │   ├── accounts.py
│       │   │   ├── transactions.py
│       │   │   ├── categories.py
│       │   │   ├── budgets.py
│       │   │   ├── allowances.py
│       │   │   ├── annual_budgets.py
│       │   │   ├── investments.py
│       │   │   ├── exchange_rates.py
│       │   │   └── reports.py
│       │   └── services/
│       │       └── exchange_rate.py  # Frankfurter API + caching
│       └── db/
│           ├── migrate.py            # Migration runner (docker `migrate` service)
│           └── migrations/
│               └── 001_schema.sql    # Tables, triggers, system categories
│
└── packages/
    └── shared/                       # Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.14+ (with [uv](https://docs.astral.sh/uv/) recommended)
- PostgreSQL 13+ (or Docker — `docker-compose.yml` ships a `db` service)

### 1. Clone & Install

```bash
git clone <repository-url>
cd nomad-ledger
npm install
```

### 2. Set Up PostgreSQL

Using Docker:

```bash
npm run db:up        # start PostgreSQL
npm run db:migrate   # apply pending migrations (one-shot `migrate` service)
```

Migrations live in `apps/api/db/migrations/*.sql` and are applied in file-name order by
`apps/api/db/migrate.py`, which records them in the `schema_migrations` table. With your own
PostgreSQL run it directly: `cd apps/api && DATABASE_URL=... uv run python db/migrate.py`.
`docker compose up` runs the `migrate` service automatically before the API starts.
Add a schema change as a new file, e.g. `002_add_something.sql`.

### 3. Configure Environment

**Frontend** — `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Backend** — `apps/api/.env`:
```env
DATABASE_URL=postgresql://nomad:nomad@localhost:5432/nomad_ledger
CORS_ORIGINS=http://localhost:3000
```

### 4. Install Python Dependencies

```bash
cd apps/api
uv sync        # or: pip install -r requirements.txt
```

### 5. Run

```bash
# Both at once (Turborepo)
npm run dev

# Or separately:
npm run dev:web    # http://localhost:3000
npm run dev:api    # http://localhost:8000
```

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (auto-created on signup via trigger) |
| `accounts` | Financial accounts (checking, savings, credit, cash, investment) |
| `categories` | Transaction categories with parent/child hierarchy + system defaults |
| `transactions` | All financial transactions with multi-currency amounts |
| `budgets` | Monthly per-category budget targets |
| `allowances` | Named allowance definitions with monthly limits |
| `allowance_balances` | Per-period allowance tracking (limit + carry-over + spent) |
| `annual_budgets` | Yearly named budgets (e.g. "Trips 2026") |
| `investments` | Investment positions (stocks, ETFs, crypto, bonds) |
| `investment_transactions` | Buy/sell/dividend records for investments |
| `exchange_rates` | Cached currency exchange rates |

### Key Relationships

```
accounts ──< transactions >── categories
                │
                ├── allowances (via allowance_id)
                ├── annual_budgets (via annual_budget_id)
                └── accounts (transfer_to_account_id)

allowances ──< allowance_balances (per period)
accounts ──< investments ──< investment_transactions
categories ──< budgets (per period)
```

### Row Level Security

All tables enforce RLS so users can only access their own data. Policies follow the pattern:
- **SELECT**: `auth.uid() = user_id`
- **INSERT**: `auth.uid() = user_id`
- **UPDATE**: `auth.uid() = user_id`
- **DELETE**: `auth.uid() = user_id`

### Database Triggers

| Trigger | Purpose |
|---------|---------|
| `handle_new_user` | Auto-creates a profile row on user signup |
| `update_account_balance` | Recalculates account `current_balance` on transaction INSERT/UPDATE/DELETE |
| `update_allowance_spent` | Updates `allowance_balances.spent_amount` when transactions with `allowance_id` change |
| `update_updated_at_column` | Auto-updates `updated_at` timestamps |

## Multi-Currency Conversion

All monetary amounts are stored in their original currency and converted to EUR (base currency) for consistent reporting.

**Your own rate comes first.** A cross-currency transfer (e.g. RSD account → EUR account) accepts the amount actually received at the exchange office. That records your own rate for the pair; every later transaction, balance and report in that currency uses the latest own rate dated on or before the transaction date (source `personal`). Without one, the market rate below applies.

**Three-tier market rate resolution:**

1. **In-memory cache** — instant lookup for rates already fetched this session
2. **Database cache** — persistent `exchange_rates` table
3. **Frankfurter API** — free ECB rates at [frankfurter.app](https://www.frankfurter.app/) as fallback

When creating a transaction in a non-EUR currency, the API automatically fetches and applies the exchange rate for the transaction date. Users can also override the rate manually.

## Personal Allowances

Named personal spending envelopes (e.g. "Dad's Fun Money", "Mom's Fun Money"):

- Each allowance has a configurable monthly spending limit
- Assign transactions to an allowance to count against its limit
- Unspent amounts carry over to the next month automatically
- **Month Rollover** creates/recalculates current-period balance records with carry-over from the previous period
- **Re-calculate** option per allowance to re-sum spent amount from transactions
- View balance history for any past month via the period selector

## Annual Budgets

Yearly budgets for planned large expenses:

- Create named budgets (e.g. "Trips", "Concerts") with a planned amount per year
- Assign individual transactions to an annual budget
- Spent amount is calculated on-demand by summing linked transactions
- Progress tracking with visual progress bars

## API Documentation

Once the API is running, interactive Swagger docs are available at `http://localhost:8000/docs`.

See [apps/api/README.md](apps/api/README.md) for the complete API reference.

## Frontend Documentation

See [apps/web/README.md](apps/web/README.md) for frontend architecture, pages, and component documentation.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend (Turborepo) |
| `npm run dev:web` | Start frontend only (port 3000) |
| `npm run dev:api` | Start backend only (port 8000) |
| `npm run build` | Build all apps |
| `npm run lint` | Lint all apps |
| `npm run type-check` | TypeScript type checking |
| `npm run db:up` | Start the local PostgreSQL container |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:reset` | Drop the local database volume and recreate it |

## License

MIT
