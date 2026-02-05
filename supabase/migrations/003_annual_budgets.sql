-- Annual Budgets: named yearly budgets (e.g., "Trips", "Concerts")
-- Spent amount is calculated on-demand from linked transactions (no trigger needed)

-- Create annual_budgets table
CREATE TABLE annual_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    year TEXT NOT NULL,  -- format: "2026"
    amount_planned DECIMAL(15,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name, year)
);

-- Indexes
CREATE INDEX idx_annual_budgets_user_id ON annual_budgets(user_id);
CREATE INDEX idx_annual_budgets_user_year ON annual_budgets(user_id, year);

-- RLS
ALTER TABLE annual_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own annual budgets"
    ON annual_budgets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own annual budgets"
    ON annual_budgets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own annual budgets"
    ON annual_budgets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own annual budgets"
    ON annual_budgets FOR DELETE
    USING (auth.uid() = user_id);

-- Helper function for auto-updating updated_at (create if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Updated_at trigger
CREATE TRIGGER update_annual_budgets_updated_at
    BEFORE UPDATE ON annual_budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add annual_budget_id to transactions
ALTER TABLE transactions
    ADD COLUMN annual_budget_id UUID REFERENCES annual_budgets(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_annual_budget_id ON transactions(annual_budget_id);
