# Nomad Ledger — API Reference

FastAPI backend for Nomad Ledger. All endpoints require JWT authentication via Supabase Auth.

**Base URL:** `http://localhost:8000`
**Interactive docs:** `http://localhost:8000/docs`

## Authentication

All endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <supabase-access-token>
```

The token is a Supabase JWT obtained after user login. The API verifies it using Supabase JWKS with the ES256 algorithm. The authenticated user's `id`, `email`, and `role` are extracted and injected via the `get_current_user` dependency.

All database queries are scoped to the authenticated user via `user_id` filtering and Supabase RLS policies.

---

## Accounts

Prefix: `/api/v1/accounts`

### `GET /`
List all accounts for the current user, ordered by `sort_order`.

**Response:** `Account[]`

### `GET /balances`
List all accounts with current balances (alias for list, includes `pending_transactions` count).

**Response:** `AccountBalance[]`

### `GET /{account_id}`
Get a single account by ID.

**Response:** `Account`

### `POST /`
Create a new account.

**Request body:**
```json
{
  "name": "Checking Account",
  "type": "checking",
  "currency_code": "EUR",
  "initial_balance": 1000.00,
  "icon": "building-2",
  "color": "#3b82f6"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Account name |
| `type` | enum | Yes | `checking`, `savings`, `investment`, `credit`, `cash` |
| `currency_code` | string | Yes | 3-letter currency code |
| `initial_balance` | number | Yes | Starting balance |
| `icon` | string | No | Lucide icon name |
| `color` | string | No | Hex color |

**Response:** `Account` (201 Created)

### `PATCH /{account_id}`
Update an account.

**Request body (all fields optional):**
```json
{
  "name": "Updated Name",
  "type": "savings",
  "currency_code": "USD",
  "is_active": false,
  "icon": "piggy-bank",
  "color": "#10b981",
  "sort_order": 2
}
```

**Response:** `Account`

### `DELETE /{account_id}`
Delete an account. Fails if transactions are linked.

**Response:** 204 No Content

---

## Transactions

Prefix: `/api/v1/transactions`

### `GET /`
List transactions with optional filters.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `period` | string | Filter by accounting period (YYYY-MM) |
| `account_id` | UUID | Filter by account |
| `category_id` | UUID | Filter by category |
| `allowance_id` | UUID | Filter by allowance |
| `annual_budget_id` | UUID | Filter by annual budget |
| `limit` | int | Max number of results |

**Response:** `Transaction[]` — ordered by `transaction_date DESC`, includes joined `account_name`, `category_name`, `category_type`, `allowance_name`, and `annual_budget_name`.

### `GET /{transaction_id}`
Get a single transaction with all joined names.

**Response:** `Transaction`

### `POST /`
Create a new transaction. Automatically fetches the exchange rate for non-EUR currencies.

**Request body:**
```json
{
  "account_id": "uuid",
  "category_id": "uuid",
  "amount_original": -45.50,
  "currency_original": "EUR",
  "transaction_date": "2026-02-05",
  "accounting_period": "2026-02",
  "description": "Grocery shopping",
  "notes": "Weekly groceries",
  "allowance_id": "uuid",
  "annual_budget_id": "uuid",
  "exchange_rate": 1.0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `account_id` | UUID | Yes | Target account |
| `category_id` | UUID | Yes | Transaction category |
| `amount_original` | number | Yes | Negative = expense, positive = income |
| `currency_original` | string | Yes | 3-letter currency code |
| `transaction_date` | string | Yes | YYYY-MM-DD |
| `accounting_period` | string | No | YYYY-MM, defaults to transaction month |
| `description` | string | No | Short description |
| `notes` | string | No | Additional notes |
| `allowance_id` | UUID | No | Assign to an allowance |
| `annual_budget_id` | UUID | No | Assign to an annual budget |
| `exchange_rate` | number | No | Auto-fetched if omitted for non-EUR |

**Response:** `Transaction` (201 Created)

**Side effects:**
- Account balance is recalculated via database trigger
- If `allowance_id` is set, allowance spent amount is updated via trigger

### `PATCH /{transaction_id}`
Update a transaction. Only provided fields are changed.

**Response:** `Transaction`

### `DELETE /{transaction_id}`
Delete a transaction.

**Response:** 204 No Content

### `POST /transfer`
Create a transfer between two accounts. Internally creates two linked transactions (expense from source, income to destination) using the system "Transfer" category.

**Request body:**
```json
{
  "from_account_id": "uuid",
  "to_account_id": "uuid",
  "amount": 500.00,
  "currency": "EUR",
  "transaction_date": "2026-02-05",
  "description": "ATM withdrawal"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from_account_id` | UUID | Yes | Source account |
| `to_account_id` | UUID | Yes | Destination account |
| `amount` | number | Yes | Transfer amount (positive) |
| `currency` | string | Yes | Currency code |
| `transaction_date` | string | Yes | YYYY-MM-DD |
| `description` | string | No | Description |

**Response:** `Transaction` (the outgoing transaction, 201 Created)

---

## Categories

Prefix: `/api/v1/categories`

Categories support a parent/child hierarchy. System categories (seeded by migration) cannot be deleted.

### `GET /`
List all categories for the current user, ordered by type then name. Includes system categories.

**Response:** `Category[]`

### `GET /{category_id}`
Get a single category.

**Response:** `Category`

### `POST /`
Create a custom category.

**Request body:**
```json
{
  "name": "Dining Out",
  "type": "expense",
  "parent_id": "uuid",
  "icon": "utensils",
  "color": "#ef4444",
  "is_allowance": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Category name |
| `type` | enum | Yes | `income`, `expense`, `transfer` |
| `parent_id` | UUID | No | Parent category for hierarchy |
| `icon` | string | No | Lucide icon name |
| `color` | string | No | Hex color |
| `is_allowance` | boolean | No | Marks as allowance-eligible |

**Response:** `Category` (201 Created)

### `PATCH /{category_id}`
Update a category. Cannot modify system categories.

**Response:** `Category`

### `DELETE /{category_id}`
Delete a category. Fails if it's a system category or has linked transactions.

**Response:** 204 No Content

---

## Monthly Budgets

Prefix: `/api/v1/budgets`

### `GET /`
List budgets with optional period filter.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `period` | string | Filter by period (YYYY-MM) |

**Response:** `Budget[]`

### `GET /comparison`
Budget vs actual comparison. Returns budgets with actual spent amounts calculated from transactions.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `period` | string | **Required.** Period (YYYY-MM) |

**Response:** `BudgetComparison[]` — each entry includes `amount_planned`, `spent_amount`, `remaining`, and `percentage`.

### `POST /`
Create a budget for a category and period.

**Request body:**
```json
{
  "category_id": "uuid",
  "period": "2026-02",
  "amount_planned": 500.00
}
```

**Response:** `Budget` (201 Created)

### `PATCH /{budget_id}`
Update a budget's planned amount.

**Request body:**
```json
{
  "amount_planned": 600.00
}
```

**Response:** `Budget`

### `POST /copy`
Copy all budgets from one period to another.

**Request body:**
```json
{
  "from_period": "2026-01",
  "to_period": "2026-02"
}
```

**Response:** `Budget[]` (the newly created budgets)

---

## Allowances

Prefix: `/api/v1/allowances`

### Definitions (CRUD)

### `GET /`
List all allowance definitions for the current user.

**Response:** `AllowanceDefinition[]`

### `GET /{allowance_id}`
Get a single allowance definition.

**Response:** `AllowanceDefinition`

### `POST /`
Create a new named allowance. Also creates an initial balance row for the current period with `spent_amount = 0`.

**Request body:**
```json
{
  "name": "Dad's Fun Money",
  "monthly_limit": 150.00
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Allowance name |
| `monthly_limit` | number | No | Monthly limit (defaults to 0) |

**Response:** `AllowanceDefinition` (201 Created)

### `PATCH /{allowance_id}`
Update an allowance definition.

**Request body (all fields optional):**
```json
{
  "name": "Updated Name",
  "monthly_limit": 200.00,
  "is_active": false
}
```

**Response:** `AllowanceDefinition`

### `DELETE /{allowance_id}`
Delete an allowance. Fails if transactions are linked — unassign them first.

**Response:** 204 No Content

### Balances & Operations

### `GET /balances`
List all allowance balances for a period, with allowance names joined.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `period` | string | Period in YYYY-MM (defaults to current month) |

**Response:** `AllowanceBalance[]` — each includes `monthly_limit`, `carry_over_from_previous`, `spent_amount`, and `allowance_name`.

### `POST /balances/{balance_id}/recalculate`
Recalculate the `spent_amount` for a single allowance balance by re-summing all transactions linked to that allowance in that period.

**Response:** `AllowanceBalance` (updated)

### `POST /rollover`
Trigger month rollover for all active allowances. For each:
- Calculates carry-over from previous period: `max(0, monthly_limit + carry_over - spent)`
- If current-period balance exists: updates `monthly_limit` and `carry_over_from_previous`
- If not: creates a new balance row with `spent_amount = 0`

**Response:**
```json
{
  "message": "Rollover complete. Created 2, updated 1 allowance balance records."
}
```

---

## Annual Budgets

Prefix: `/api/v1/annual-budgets`

### `GET /`
List annual budgets with optional year filter. Spent amount is calculated on-demand from linked transactions.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `year` | string | Filter by year (YYYY) |

**Response:** `AnnualBudget[]` — each includes computed `spent_amount`.

### `GET /{annual_budget_id}`
Get a single annual budget with computed spent amount.

**Response:** `AnnualBudget`

### `POST /`
Create a new annual budget. Name+year must be unique per user.

**Request body:**
```json
{
  "name": "Trips",
  "year": "2026",
  "amount_planned": 5000.00
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Budget name |
| `year` | string | Yes | Year (YYYY) |
| `amount_planned` | number | Yes | Planned amount |

**Response:** `AnnualBudget` (201 Created)

### `PATCH /{annual_budget_id}`
Update an annual budget.

**Request body (all fields optional):**
```json
{
  "name": "Vacations",
  "amount_planned": 6000.00,
  "is_active": false
}
```

**Response:** `AnnualBudget`

### `DELETE /{annual_budget_id}`
Delete an annual budget. Fails if transactions are linked.

**Response:** 204 No Content

---

## Investments

Prefix: `/api/v1/investments`

### `GET /`
List all investment positions with current valuations.

**Response:** `Investment[]` — each includes `quantity`, `cost_basis`, `current_price`, `current_value_eur`, `unrealized_gain_loss`.

### `GET /{investment_id}`
Get a single investment position.

**Response:** `Investment`

### `POST /`
Create a new investment position (empty, no shares yet).

**Request body:**
```json
{
  "account_id": "uuid",
  "asset_name": "Vanguard S&P 500",
  "ticker": "VOO",
  "asset_type": "etf"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `account_id` | UUID | Yes | Must be an investment-type account |
| `asset_name` | string | Yes | Display name |
| `ticker` | string | No | Market ticker for price refresh |
| `asset_type` | enum | Yes | `etf`, `stock`, `crypto`, `bond` |

**Response:** `Investment` (201 Created)

### `POST /{investment_id}/buy`
Record a buy transaction. Increases quantity, updates cost basis and average cost.

**Request body:**
```json
{
  "quantity": 10,
  "price_per_unit": 450.00,
  "currency": "USD",
  "transaction_date": "2026-02-05"
}
```

**Response:** `Investment` (updated position)

### `POST /{investment_id}/sell`
Record a sell. Decreases quantity, adjusts cost basis proportionally.

**Request body:** Same as buy.

**Response:** `Investment` (updated position)

### `POST /{investment_id}/dividend`
Record a dividend payment.

**Request body:**
```json
{
  "amount": 25.00,
  "currency": "USD",
  "transaction_date": "2026-02-05"
}
```

**Response:** 200 OK

### `POST /refresh-prices`
Refresh current market prices for all investments with a ticker symbol.

**Response:** 200 OK

---

## Exchange Rates

Prefix: `/api/v1/exchange-rates`

### `GET /`
Get an exchange rate. Uses three-tier caching: in-memory, database, Frankfurter API.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `from` | string | **Required.** Source currency code |
| `to` | string | **Required.** Target currency code |
| `date` | string | Rate date (YYYY-MM-DD), defaults to today |

**Response:** `ExchangeRate`

### `POST /`
Manually create or override an exchange rate.

**Request body:**
```json
{
  "from_currency": "USD",
  "to_currency": "EUR",
  "rate": 0.92,
  "rate_date": "2026-02-05"
}
```

**Response:** `ExchangeRate`

---

## Reports

Prefix: `/api/v1/reports`

### `GET /dashboard`
Dashboard summary for the current month.

**Response:**
```json
{
  "total_balance_eur": 15000.00,
  "monthly_income": 4500.00,
  "monthly_expenses": 3200.00,
  "net_savings": 1300.00
}
```

### `GET /net-worth`
Net worth breakdown.

**Response:**
```json
{
  "total_assets": 25000.00,
  "total_liabilities": 2000.00,
  "net_worth": 23000.00,
  "investments_value": 10000.00,
  "accounts": [...]
}
```

### `GET /cash-flow`
Income vs expense breakdown by category.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `period` | string | YYYY-MM (defaults to current) |

**Response:**
```json
{
  "period": "2026-02",
  "income": 4500.00,
  "expenses": 3200.00,
  "net": 1300.00,
  "by_category": [
    {
      "category_id": "uuid",
      "category_name": "Salary",
      "type": "income",
      "amount": 4500.00
    }
  ]
}
```

---

## Data Models

### Account
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Account name |
| `type` | enum | checking, savings, investment, credit, cash |
| `currency_code` | string | 3-letter currency code |
| `initial_balance` | decimal | Starting balance |
| `current_balance` | decimal | Auto-calculated from transactions |
| `current_balance_eur` | decimal | Balance converted to EUR |
| `is_active` | boolean | Active flag |
| `icon` | string? | Lucide icon name |
| `color` | string? | Hex color |
| `sort_order` | int | Display order |

### Transaction
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `account_id` | UUID | Owning account |
| `category_id` | UUID | Transaction category |
| `amount_original` | decimal | Amount in original currency |
| `currency_original` | string | Original currency code |
| `amount_base_eur` | decimal | Amount converted to EUR |
| `exchange_rate` | decimal | Applied exchange rate |
| `transaction_date` | date | When it occurred |
| `accounting_period` | string | YYYY-MM for budgeting |
| `description` | string? | Short description |
| `notes` | string? | Additional notes |
| `allowance_id` | UUID? | Linked allowance |
| `annual_budget_id` | UUID? | Linked annual budget |
| `transfer_to_account_id` | UUID? | Destination (transfers only) |

### AllowanceDefinition
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Allowance name |
| `monthly_limit` | decimal | Monthly spending limit |
| `is_active` | boolean | Active flag |

### AllowanceBalance
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `allowance_id` | UUID | Linked allowance definition |
| `allowance_name` | string? | Joined name |
| `period` | string | YYYY-MM |
| `monthly_limit` | decimal | Limit for this period |
| `carry_over_from_previous` | decimal | Unspent from prior period |
| `spent_amount` | decimal | Amount spent this period |

### AnnualBudget
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Budget name |
| `year` | string | YYYY |
| `amount_planned` | decimal | Planned amount |
| `spent_amount` | decimal | Computed from transactions |
| `is_active` | boolean | Active flag |

### Investment
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `account_id` | UUID | Investment account |
| `asset_name` | string | Asset name |
| `ticker` | string? | Market ticker |
| `asset_type` | enum | etf, stock, crypto, bond |
| `quantity` | decimal | Units held |
| `cost_basis` | decimal | Total acquisition cost |
| `average_cost_per_unit` | decimal | Average price paid |
| `current_price` | decimal? | Latest market price |
| `current_value_eur` | decimal? | Value in EUR |
| `unrealized_gain_loss` | decimal? | Profit/loss if sold now |

---

## Error Handling

All errors return JSON:

```json
{
  "detail": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request — validation error or business rule violation |
| `401` | Unauthorized — missing or invalid JWT |
| `404` | Not found — resource doesn't exist or isn't owned by user |
| `500` | Internal server error |

---

## Running

```bash
# From repo root
npm run dev:api

# Or directly
cd apps/api
uvicorn app.main:app --reload --port 8000
```

Environment variables (`.env`):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret
```
