-- Nomad Ledger schema (plain PostgreSQL 13+).
-- Applied by apps/api/db/migrate.py. Authorization is enforced by the API.

-- Users (HTTP Basic auth: email + bcrypt password hash)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accounts
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'investment', 'credit', 'cash')),
    currency_code TEXT NOT NULL DEFAULT 'EUR',
    initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    icon TEXT,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories (hierarchical; user_id NULL = system category)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    icon TEXT,
    color TEXT,
    is_allowance BOOLEAN NOT NULL DEFAULT FALSE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exchange rates
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate DECIMAL(20, 10) NOT NULL,
    rate_date DATE NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (from_currency, to_currency, rate_date)
);

-- Named monthly allowances
CREATE TABLE allowances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    monthly_limit DECIMAL(15, 2) NOT NULL DEFAULT 150,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Named yearly budgets (spent amount is computed from linked transactions)
CREATE TABLE annual_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    year TEXT NOT NULL, -- Format: YYYY
    amount_planned DECIMAL(15, 2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name, year)
);

-- Transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    allowance_id UUID REFERENCES allowances(id) ON DELETE SET NULL,
    annual_budget_id UUID REFERENCES annual_budgets(id) ON DELETE SET NULL,
    amount_original DECIMAL(15, 2) NOT NULL,
    currency_original TEXT NOT NULL DEFAULT 'EUR',
    amount_base_eur DECIMAL(15, 2) NOT NULL,
    exchange_rate DECIMAL(20, 10) NOT NULL DEFAULT 1,
    exchange_rate_source TEXT NOT NULL DEFAULT 'manual',
    transaction_date DATE NOT NULL,
    accounting_period TEXT NOT NULL, -- Format: YYYY-MM
    description TEXT,
    notes TEXT,
    transfer_to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    transfer_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monthly category budgets
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    period TEXT NOT NULL, -- Format: YYYY-MM
    amount_planned DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, category_id, period)
);

-- Monthly allowance balances
CREATE TABLE allowance_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allowance_id UUID NOT NULL REFERENCES allowances(id) ON DELETE CASCADE,
    period TEXT NOT NULL, -- Format: YYYY-MM
    monthly_limit DECIMAL(15, 2) NOT NULL DEFAULT 150,
    carry_over_from_previous DECIMAL(15, 2) NOT NULL DEFAULT 0,
    spent_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (allowance_id, period)
);

-- Investments
CREATE TABLE investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset_name TEXT NOT NULL,
    ticker TEXT,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('etf', 'stock', 'crypto', 'bond')),
    quantity DECIMAL(20, 8) NOT NULL DEFAULT 0,
    cost_basis DECIMAL(15, 2) NOT NULL DEFAULT 0,
    average_cost_per_unit DECIMAL(20, 8) NOT NULL DEFAULT 0,
    current_price DECIMAL(20, 8),
    current_price_currency TEXT NOT NULL DEFAULT 'EUR',
    price_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Investment transactions (buy/sell/dividend history)
CREATE TABLE investment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
    quantity DECIMAL(20, 8),
    price_per_unit DECIMAL(20, 8) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    total_amount DECIMAL(15, 2) NOT NULL,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_allowance_id ON transactions(allowance_id);
CREATE INDEX idx_transactions_annual_budget_id ON transactions(annual_budget_id);
CREATE INDEX idx_transactions_accounting_period ON transactions(accounting_period);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_budgets_user_period ON budgets(user_id, period);
CREATE INDEX idx_allowances_user_id ON allowances(user_id);
CREATE INDEX idx_allowance_balances_user_period ON allowance_balances(user_id, period);
CREATE INDEX idx_allowance_balances_allowance_id ON allowance_balances(allowance_id);
CREATE INDEX idx_annual_budgets_user_id ON annual_budgets(user_id);
CREATE INDEX idx_annual_budgets_user_year ON annual_budgets(user_id, year);
CREATE INDEX idx_investments_user_id ON investments(user_id);

-- Keep updated_at fresh on annual budgets
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_annual_budgets_updated_at
    BEFORE UPDATE ON annual_budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update account balance after transaction changes
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_amount DECIMAL(15, 2);
    v_category_type TEXT;
BEGIN
    SELECT type INTO v_category_type FROM categories WHERE id = COALESCE(NEW.category_id, OLD.category_id);

    IF TG_OP = 'INSERT' THEN
        IF v_category_type = 'income' THEN
            v_amount := ABS(NEW.amount_original);
        ELSIF v_category_type = 'expense' THEN
            v_amount := -ABS(NEW.amount_original);
        ELSE
            v_amount := NEW.amount_original;
        END IF;

        UPDATE accounts SET current_balance = current_balance + v_amount
        WHERE id = NEW.account_id;

    ELSIF TG_OP = 'DELETE' THEN
        IF v_category_type = 'income' THEN
            v_amount := -ABS(OLD.amount_original);
        ELSIF v_category_type = 'expense' THEN
            v_amount := ABS(OLD.amount_original);
        ELSE
            v_amount := -OLD.amount_original;
        END IF;

        UPDATE accounts SET current_balance = current_balance + v_amount
        WHERE id = OLD.account_id;

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.account_id = NEW.account_id THEN
            IF v_category_type = 'income' THEN
                v_amount := ABS(NEW.amount_original) - ABS(OLD.amount_original);
            ELSIF v_category_type = 'expense' THEN
                v_amount := ABS(OLD.amount_original) - ABS(NEW.amount_original);
            ELSE
                v_amount := NEW.amount_original - OLD.amount_original;
            END IF;

            UPDATE accounts SET current_balance = current_balance + v_amount
            WHERE id = NEW.account_id;
        ELSE
            IF v_category_type = 'income' THEN
                UPDATE accounts SET current_balance = current_balance - ABS(OLD.amount_original)
                WHERE id = OLD.account_id;
            ELSIF v_category_type = 'expense' THEN
                UPDATE accounts SET current_balance = current_balance + ABS(OLD.amount_original)
                WHERE id = OLD.account_id;
            END IF;

            IF v_category_type = 'income' THEN
                UPDATE accounts SET current_balance = current_balance + ABS(NEW.amount_original)
                WHERE id = NEW.account_id;
            ELSIF v_category_type = 'expense' THEN
                UPDATE accounts SET current_balance = current_balance - ABS(NEW.amount_original)
                WHERE id = NEW.account_id;
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_account_balance
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- Update allowance spent amount after transaction changes
CREATE OR REPLACE FUNCTION update_allowance_spent()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.allowance_id IS NOT NULL THEN
            INSERT INTO allowance_balances (user_id, allowance_id, period, spent_amount, monthly_limit)
            SELECT NEW.user_id, NEW.allowance_id, NEW.accounting_period, ABS(NEW.amount_base_eur),
                   COALESCE(a.monthly_limit, 150)
            FROM allowances a WHERE a.id = NEW.allowance_id
            ON CONFLICT (allowance_id, period)
            DO UPDATE SET spent_amount = allowance_balances.spent_amount + ABS(NEW.amount_base_eur);
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.allowance_id IS NOT NULL THEN
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur))
            WHERE allowance_id = OLD.allowance_id AND period = OLD.accounting_period;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Allowance removed
        IF OLD.allowance_id IS NOT NULL AND NEW.allowance_id IS NULL THEN
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur))
            WHERE allowance_id = OLD.allowance_id AND period = OLD.accounting_period;

        -- Allowance added
        ELSIF OLD.allowance_id IS NULL AND NEW.allowance_id IS NOT NULL THEN
            INSERT INTO allowance_balances (user_id, allowance_id, period, spent_amount, monthly_limit)
            SELECT NEW.user_id, NEW.allowance_id, NEW.accounting_period, ABS(NEW.amount_base_eur),
                   COALESCE(a.monthly_limit, 150)
            FROM allowances a WHERE a.id = NEW.allowance_id
            ON CONFLICT (allowance_id, period)
            DO UPDATE SET spent_amount = allowance_balances.spent_amount + ABS(NEW.amount_base_eur);

        -- Allowance changed to a different one
        ELSIF OLD.allowance_id IS NOT NULL AND NEW.allowance_id IS NOT NULL AND OLD.allowance_id != NEW.allowance_id THEN
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur))
            WHERE allowance_id = OLD.allowance_id AND period = OLD.accounting_period;

            INSERT INTO allowance_balances (user_id, allowance_id, period, spent_amount, monthly_limit)
            SELECT NEW.user_id, NEW.allowance_id, NEW.accounting_period, ABS(NEW.amount_base_eur),
                   COALESCE(a.monthly_limit, 150)
            FROM allowances a WHERE a.id = NEW.allowance_id
            ON CONFLICT (allowance_id, period)
            DO UPDATE SET spent_amount = allowance_balances.spent_amount + ABS(NEW.amount_base_eur);

        -- Same allowance, amount changed
        ELSIF NEW.allowance_id IS NOT NULL AND OLD.allowance_id = NEW.allowance_id THEN
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur) + ABS(NEW.amount_base_eur))
            WHERE allowance_id = NEW.allowance_id AND period = NEW.accounting_period;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_allowance_spent
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_allowance_spent();

-- Default system categories
INSERT INTO categories (name, type, is_system, icon, color) VALUES
    ('Salary', 'income', TRUE, 'banknote', '#22c55e'),
    ('Freelance', 'income', TRUE, 'briefcase', '#22c55e'),
    ('Investment Income', 'income', TRUE, 'trending-up', '#22c55e'),
    ('Other Income', 'income', TRUE, 'plus-circle', '#22c55e'),
    ('Housing', 'expense', TRUE, 'home', '#ef4444'),
    ('Utilities', 'expense', TRUE, 'zap', '#f97316'),
    ('Groceries', 'expense', TRUE, 'shopping-cart', '#f97316'),
    ('Transportation', 'expense', TRUE, 'car', '#f97316'),
    ('Healthcare', 'expense', TRUE, 'heart-pulse', '#ef4444'),
    ('Entertainment', 'expense', TRUE, 'film', '#8b5cf6'),
    ('Dining Out', 'expense', TRUE, 'utensils', '#f97316'),
    ('Shopping', 'expense', TRUE, 'shopping-bag', '#ec4899'),
    ('Personal', 'expense', TRUE, 'user', '#8b5cf6'),
    ('Education', 'expense', TRUE, 'graduation-cap', '#3b82f6'),
    ('Subscriptions', 'expense', TRUE, 'repeat', '#f97316'),
    ('Insurance', 'expense', TRUE, 'shield', '#ef4444'),
    ('Savings', 'expense', TRUE, 'piggy-bank', '#22c55e'),
    ('Other Expenses', 'expense', TRUE, 'more-horizontal', '#6b7280'),
    ('Transfer', 'transfer', TRUE, 'arrow-right-left', '#3b82f6'),
    ('Investment Purchase', 'transfer', TRUE, 'trending-up', '#3b82f6');
