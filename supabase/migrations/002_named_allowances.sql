-- Migration: Named Allowances
-- Transforms single-per-user allowance into multi-allowance system with named allowances

-- 1. Create allowances (definitions) table
CREATE TABLE allowances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    monthly_limit DECIMAL(15, 2) NOT NULL DEFAULT 150,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_allowances_user_id ON allowances(user_id);

-- Enable RLS
ALTER TABLE allowances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own allowances"
    ON allowances FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own allowances"
    ON allowances FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own allowances"
    ON allowances FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own allowances"
    ON allowances FOR DELETE
    USING (auth.uid() = user_id);

-- 2. Add allowance_id to allowance_balances
ALTER TABLE allowance_balances ADD COLUMN allowance_id UUID REFERENCES allowances(id) ON DELETE CASCADE;

-- 3. Add allowance_id to transactions
ALTER TABLE transactions ADD COLUMN allowance_id UUID REFERENCES allowances(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_allowance_id ON transactions(allowance_id);

-- 4. Migrate existing data:
--    For each user that has existing allowance_balances, create a default "Personal Allowance" definition
--    Then link existing balances and transactions to it
DO $$
DECLARE
    r RECORD;
    new_allowance_id UUID;
BEGIN
    -- Get distinct users who have allowance_balances
    FOR r IN SELECT DISTINCT user_id FROM allowance_balances LOOP
        -- Create a default allowance definition
        INSERT INTO allowances (user_id, name, monthly_limit, is_active)
        SELECT r.user_id, 'Personal Allowance',
               COALESCE((SELECT monthly_limit FROM allowance_balances
                         WHERE user_id = r.user_id ORDER BY period DESC LIMIT 1), 150),
               TRUE
        RETURNING id INTO new_allowance_id;

        -- Link existing balances to the new allowance
        UPDATE allowance_balances
        SET allowance_id = new_allowance_id
        WHERE user_id = r.user_id;

        -- Link existing transactions with is_personal_allowance=TRUE to the new allowance
        UPDATE transactions
        SET allowance_id = new_allowance_id
        WHERE user_id = r.user_id AND is_personal_allowance = TRUE;
    END LOOP;
END $$;

-- 5. Now make allowance_id NOT NULL on allowance_balances (all rows should have been updated)
--    But first handle any rows that might not have been migrated
DELETE FROM allowance_balances WHERE allowance_id IS NULL;
ALTER TABLE allowance_balances ALTER COLUMN allowance_id SET NOT NULL;

-- 6. Drop old unique constraint and add new one
ALTER TABLE allowance_balances DROP CONSTRAINT IF EXISTS allowance_balances_user_id_period_key;
ALTER TABLE allowance_balances ADD CONSTRAINT allowance_balances_allowance_id_period_key UNIQUE(allowance_id, period);

CREATE INDEX idx_allowance_balances_allowance_id ON allowance_balances(allowance_id);

-- 7. Drop is_personal_allowance from transactions
ALTER TABLE transactions DROP COLUMN is_personal_allowance;

-- 8. Replace the update_allowance_spent trigger function
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
        -- Case 1: Allowance removed (was set, now NULL)
        IF OLD.allowance_id IS NOT NULL AND NEW.allowance_id IS NULL THEN
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur))
            WHERE allowance_id = OLD.allowance_id AND period = OLD.accounting_period;

        -- Case 2: Allowance added (was NULL, now set)
        ELSIF OLD.allowance_id IS NULL AND NEW.allowance_id IS NOT NULL THEN
            INSERT INTO allowance_balances (user_id, allowance_id, period, spent_amount, monthly_limit)
            SELECT NEW.user_id, NEW.allowance_id, NEW.accounting_period, ABS(NEW.amount_base_eur),
                   COALESCE(a.monthly_limit, 150)
            FROM allowances a WHERE a.id = NEW.allowance_id
            ON CONFLICT (allowance_id, period)
            DO UPDATE SET spent_amount = allowance_balances.spent_amount + ABS(NEW.amount_base_eur);

        -- Case 3: Allowance changed to a different one
        ELSIF OLD.allowance_id IS NOT NULL AND NEW.allowance_id IS NOT NULL AND OLD.allowance_id != NEW.allowance_id THEN
            -- Decrement old
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur))
            WHERE allowance_id = OLD.allowance_id AND period = OLD.accounting_period;
            -- Increment new
            INSERT INTO allowance_balances (user_id, allowance_id, period, spent_amount, monthly_limit)
            SELECT NEW.user_id, NEW.allowance_id, NEW.accounting_period, ABS(NEW.amount_base_eur),
                   COALESCE(a.monthly_limit, 150)
            FROM allowances a WHERE a.id = NEW.allowance_id
            ON CONFLICT (allowance_id, period)
            DO UPDATE SET spent_amount = allowance_balances.spent_amount + ABS(NEW.amount_base_eur);

        -- Case 4: Same allowance, amount changed
        ELSIF NEW.allowance_id IS NOT NULL AND OLD.allowance_id = NEW.allowance_id THEN
            UPDATE allowance_balances
            SET spent_amount = GREATEST(0, spent_amount - ABS(OLD.amount_base_eur) + ABS(NEW.amount_base_eur))
            WHERE allowance_id = NEW.allowance_id AND period = NEW.accounting_period;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- The trigger itself doesn't need to be recreated since we're replacing the function
