-- Family accounts: data is shared by every member of a family. user_id stays on
-- each row as its author; family_id is what access checks use. An allowance
-- belongs to exactly one member (allowances.user_id).

CREATE TABLE families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing users each start as a family of one (the family reuses the user's id).
ALTER TABLE users ADD COLUMN family_id UUID;
INSERT INTO families (id) SELECT id FROM users;
UPDATE users SET family_id = id;
ALTER TABLE users
    ALTER COLUMN family_id SET NOT NULL,
    ADD CONSTRAINT users_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id);
CREATE INDEX idx_users_family_id ON users(family_id);

-- Single-use invite codes that let a new user register into an existing family.
CREATE TABLE family_invites (
    code TEXT PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- family_id on every shared table, backfilled from the author.
ALTER TABLE accounts ADD COLUMN family_id UUID REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE budgets ADD COLUMN family_id UUID REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE annual_budgets ADD COLUMN family_id UUID REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE investments ADD COLUMN family_id UUID REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN family_id UUID REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE allowances ADD COLUMN family_id UUID REFERENCES families(id) ON DELETE CASCADE;
-- NULL = system category.
ALTER TABLE categories ADD COLUMN family_id UUID REFERENCES families(id) ON DELETE CASCADE;

UPDATE accounts t SET family_id = u.family_id FROM users u WHERE u.id = t.user_id;
UPDATE budgets t SET family_id = u.family_id FROM users u WHERE u.id = t.user_id;
UPDATE annual_budgets t SET family_id = u.family_id FROM users u WHERE u.id = t.user_id;
UPDATE investments t SET family_id = u.family_id FROM users u WHERE u.id = t.user_id;
UPDATE transactions t SET family_id = u.family_id FROM users u WHERE u.id = t.user_id;
UPDATE allowances t SET family_id = u.family_id FROM users u WHERE u.id = t.user_id;
UPDATE categories t SET family_id = u.family_id FROM users u WHERE u.id = t.user_id;

ALTER TABLE accounts ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE budgets ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE annual_budgets ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE investments ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE allowances ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX idx_accounts_family_id ON accounts(family_id);
CREATE INDEX idx_budgets_family_period ON budgets(family_id, period);
CREATE INDEX idx_annual_budgets_family_year ON annual_budgets(family_id, year);
CREATE INDEX idx_investments_family_id ON investments(family_id);
CREATE INDEX idx_transactions_family_id ON transactions(family_id);
CREATE INDEX idx_allowances_family_id ON allowances(family_id);
CREATE INDEX idx_categories_family_id ON categories(family_id);

-- Uniqueness is per family now.
ALTER TABLE budgets DROP CONSTRAINT budgets_user_id_category_id_period_key;
ALTER TABLE budgets ADD CONSTRAINT budgets_family_id_category_id_period_key
    UNIQUE (family_id, category_id, period);
ALTER TABLE annual_budgets DROP CONSTRAINT annual_budgets_user_id_name_year_key;
ALTER TABLE annual_budgets ADD CONSTRAINT annual_budgets_family_id_name_year_key
    UNIQUE (family_id, name, year);

-- One allowance per member. Users who had several keep the oldest active one;
-- the rest are deactivated (their transactions and balances stay as history).
UPDATE allowances a
SET is_active = (ranked.rn = 1)
FROM (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY is_active DESC, created_at) AS rn
    FROM allowances
) ranked
WHERE ranked.id = a.id;

CREATE UNIQUE INDEX uniq_allowances_active_member ON allowances(user_id) WHERE is_active;

-- Users without an allowance get one, with a balance row for the current month.
WITH created AS (
    INSERT INTO allowances (user_id, family_id, name)
    SELECT u.id, u.family_id, COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1))
    FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM allowances a WHERE a.user_id = u.id)
    RETURNING id, user_id, monthly_limit
)
INSERT INTO allowance_balances (user_id, allowance_id, period, monthly_limit)
SELECT user_id, id, to_char(NOW(), 'YYYY-MM'), monthly_limit FROM created;

-- Per-category spend view: expose family_id (appended; existing columns unchanged).
CREATE OR REPLACE VIEW transaction_category_amounts AS
SELECT t.id AS transaction_id,
       t.user_id,
       t.accounting_period,
       t.category_id,
       ABS(t.amount_base_eur) AS amount_eur,
       t.family_id
FROM transactions t
WHERE NOT EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id)
UNION ALL
SELECT t.id,
       t.user_id,
       t.accounting_period,
       COALESCE(ti.category_id, t.category_id),
       ABS(t.amount_base_eur) * ti.amount / ABS(t.amount_original),
       t.family_id
FROM transactions t
JOIN transaction_items ti ON ti.transaction_id = t.id;

-- A balance row belongs to the allowance's member, not to whoever logged the
-- transaction (any family member may charge any allowance).
CREATE OR REPLACE FUNCTION update_allowance_spent()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.allowance_id IS NOT NULL THEN
            INSERT INTO allowance_balances (user_id, allowance_id, period, spent_amount, monthly_limit)
            SELECT a.user_id, NEW.allowance_id, NEW.accounting_period, ABS(NEW.amount_base_eur),
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
            SELECT a.user_id, NEW.allowance_id, NEW.accounting_period, ABS(NEW.amount_base_eur),
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
            SELECT a.user_id, NEW.allowance_id, NEW.accounting_period, ABS(NEW.amount_base_eur),
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
