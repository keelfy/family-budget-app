-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts table
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'investment', 'credit', 'cash')),
    currency_code TEXT NOT NULL DEFAULT 'EUR',
    initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories table (hierarchical)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    icon TEXT,
    color TEXT,
    is_allowance BOOLEAN DEFAULT FALSE,
    is_system BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exchange rates table
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate DECIMAL(20, 10) NOT NULL,
    rate_date DATE NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_currency, to_currency, rate_date)
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    amount_original DECIMAL(15, 2) NOT NULL,
    currency_original TEXT NOT NULL DEFAULT 'EUR',
    amount_base_eur DECIMAL(15, 2) NOT NULL,
    exchange_rate DECIMAL(20, 10) NOT NULL DEFAULT 1,
    exchange_rate_source TEXT DEFAULT 'manual',
    transaction_date DATE NOT NULL,
    accounting_period TEXT NOT NULL, -- Format: YYYY-MM
    description TEXT,
    notes TEXT,
    is_personal_allowance BOOLEAN DEFAULT FALSE,
    transfer_to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    transfer_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budgets table
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    period TEXT NOT NULL, -- Format: YYYY-MM
    amount_planned DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, category_id, period)
);

-- Allowance balances table
CREATE TABLE allowance_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period TEXT NOT NULL, -- Format: YYYY-MM
    monthly_limit DECIMAL(15, 2) NOT NULL DEFAULT 150,
    carry_over_from_previous DECIMAL(15, 2) NOT NULL DEFAULT 0,
    spent_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period)
);

-- Investments table
CREATE TABLE investments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset_name TEXT NOT NULL,
    ticker TEXT,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('etf', 'stock', 'crypto', 'bond')),
    quantity DECIMAL(20, 8) NOT NULL DEFAULT 0,
    cost_basis DECIMAL(15, 2) NOT NULL DEFAULT 0,
    average_cost_per_unit DECIMAL(20, 8) NOT NULL DEFAULT 0,
    current_price DECIMAL(20, 8),
    current_price_currency TEXT DEFAULT 'EUR',
    price_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Investment transactions table (buy/sell/dividend history)
CREATE TABLE investment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
    quantity DECIMAL(20, 8),
    price_per_unit DECIMAL(20, 8) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    total_amount DECIMAL(15, 2) NOT NULL,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_accounting_period ON transactions(accounting_period);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_budgets_user_period ON budgets(user_id, period);
CREATE INDEX idx_allowance_balances_user_period ON allowance_balances(user_id, period);
CREATE INDEX idx_investments_user_id ON investments(user_id);
CREATE INDEX idx_exchange_rates_currencies_date ON exchange_rates(from_currency, to_currency, rate_date);

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowance_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- RLS Policies for accounts
CREATE POLICY "Users can view own accounts"
    ON accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own accounts"
    ON accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
    ON accounts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
    ON accounts FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for categories
CREATE POLICY "Users can view categories"
    ON categories FOR SELECT
    USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can create own categories"
    ON categories FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
    ON categories FOR UPDATE
    USING (auth.uid() = user_id AND is_system = FALSE);

CREATE POLICY "Users can delete own categories"
    ON categories FOR DELETE
    USING (auth.uid() = user_id AND is_system = FALSE);

-- RLS Policies for transactions
CREATE POLICY "Users can view own transactions"
    ON transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own transactions"
    ON transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
    ON transactions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
    ON transactions FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for budgets
CREATE POLICY "Users can view own budgets"
    ON budgets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own budgets"
    ON budgets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets"
    ON budgets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets"
    ON budgets FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for allowance_balances
CREATE POLICY "Users can view own allowances"
    ON allowance_balances FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own allowances"
    ON allowance_balances FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own allowances"
    ON allowance_balances FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for investments
CREATE POLICY "Users can view own investments"
    ON investments FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own investments"
    ON investments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own investments"
    ON investments FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own investments"
    ON investments FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for investment_transactions
CREATE POLICY "Users can view own investment transactions"
    ON investment_transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM investments i
            WHERE i.id = investment_transactions.investment_id
            AND i.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own investment transactions"
    ON investment_transactions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM investments i
            WHERE i.id = investment_transactions.investment_id
            AND i.user_id = auth.uid()
        )
    );

-- RLS Policies for exchange_rates (everyone can read, authenticated can insert)
CREATE POLICY "Anyone can view exchange rates"
    ON exchange_rates FOR SELECT
    USING (TRUE);

CREATE POLICY "Authenticated users can create exchange rates"
    ON exchange_rates FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update account balance after transaction
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_amount DECIMAL(15, 2);
    v_category_type TEXT;
BEGIN
    -- Get category type
    SELECT type INTO v_category_type FROM categories WHERE id = COALESCE(NEW.category_id, OLD.category_id);

    IF TG_OP = 'INSERT' THEN
        -- Determine amount based on category type
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
        -- Reverse the transaction
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
        -- Handle update (reverse old, apply new)
        IF OLD.account_id = NEW.account_id THEN
            -- Same account, just update the difference
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
            -- Different accounts, reverse from old and apply to new
            -- Reverse from old account
            IF v_category_type = 'income' THEN
                UPDATE accounts SET current_balance = current_balance - ABS(OLD.amount_original)
                WHERE id = OLD.account_id;
            ELSIF v_category_type = 'expense' THEN
                UPDATE accounts SET current_balance = current_balance + ABS(OLD.amount_original)
                WHERE id = OLD.account_id;
            END IF;

            -- Apply to new account
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

-- Trigger for account balance updates
CREATE TRIGGER trigger_update_account_balance
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- Function to update allowance spent amount
CREATE OR REPLACE FUNCTION update_allowance_spent()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_personal_allowance = TRUE THEN
        INSERT INTO allowance_balances (user_id, period, spent_amount)
        VALUES (NEW.user_id, NEW.accounting_period, ABS(NEW.amount_base_eur))
        ON CONFLICT (user_id, period)
        DO UPDATE SET spent_amount = allowance_balances.spent_amount + ABS(NEW.amount_base_eur);

    ELSIF TG_OP = 'DELETE' AND OLD.is_personal_allowance = TRUE THEN
        UPDATE allowance_balances
        SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur))
        WHERE user_id = OLD.user_id AND period = OLD.accounting_period;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle flag change or amount change
        IF OLD.is_personal_allowance = TRUE AND NEW.is_personal_allowance = FALSE THEN
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur))
            WHERE user_id = OLD.user_id AND period = OLD.accounting_period;

        ELSIF OLD.is_personal_allowance = FALSE AND NEW.is_personal_allowance = TRUE THEN
            INSERT INTO allowance_balances (user_id, period, spent_amount)
            VALUES (NEW.user_id, NEW.accounting_period, ABS(NEW.amount_base_eur))
            ON CONFLICT (user_id, period)
            DO UPDATE SET spent_amount = allowance_balances.spent_amount + ABS(NEW.amount_base_eur);

        ELSIF NEW.is_personal_allowance = TRUE THEN
            -- Update amount difference
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur) + ABS(NEW.amount_base_eur))
            WHERE user_id = NEW.user_id AND period = NEW.accounting_period;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for allowance spent updates
CREATE TRIGGER trigger_update_allowance_spent
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_allowance_spent();

-- Insert default system categories
INSERT INTO categories (id, name, type, is_system, icon, color) VALUES
    (uuid_generate_v4(), 'Salary', 'income', TRUE, 'banknote', '#22c55e'),
    (uuid_generate_v4(), 'Freelance', 'income', TRUE, 'briefcase', '#22c55e'),
    (uuid_generate_v4(), 'Investment Income', 'income', TRUE, 'trending-up', '#22c55e'),
    (uuid_generate_v4(), 'Other Income', 'income', TRUE, 'plus-circle', '#22c55e'),
    (uuid_generate_v4(), 'Housing', 'expense', TRUE, 'home', '#ef4444'),
    (uuid_generate_v4(), 'Utilities', 'expense', TRUE, 'zap', '#f97316'),
    (uuid_generate_v4(), 'Groceries', 'expense', TRUE, 'shopping-cart', '#f97316'),
    (uuid_generate_v4(), 'Transportation', 'expense', TRUE, 'car', '#f97316'),
    (uuid_generate_v4(), 'Healthcare', 'expense', TRUE, 'heart-pulse', '#ef4444'),
    (uuid_generate_v4(), 'Entertainment', 'expense', TRUE, 'film', '#8b5cf6'),
    (uuid_generate_v4(), 'Dining Out', 'expense', TRUE, 'utensils', '#f97316'),
    (uuid_generate_v4(), 'Shopping', 'expense', TRUE, 'shopping-bag', '#ec4899'),
    (uuid_generate_v4(), 'Personal', 'expense', TRUE, 'user', '#8b5cf6'),
    (uuid_generate_v4(), 'Education', 'expense', TRUE, 'graduation-cap', '#3b82f6'),
    (uuid_generate_v4(), 'Subscriptions', 'expense', TRUE, 'repeat', '#f97316'),
    (uuid_generate_v4(), 'Insurance', 'expense', TRUE, 'shield', '#ef4444'),
    (uuid_generate_v4(), 'Savings', 'expense', TRUE, 'piggy-bank', '#22c55e'),
    (uuid_generate_v4(), 'Other Expenses', 'expense', TRUE, 'more-horizontal', '#6b7280'),
    (uuid_generate_v4(), 'Transfer', 'transfer', TRUE, 'arrow-right-left', '#3b82f6'),
    (uuid_generate_v4(), 'Investment Purchase', 'transfer', TRUE, 'trending-up', '#3b82f6');
