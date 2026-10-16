-- Tracked items: recurring line items that roll up into one budget per kind.
-- "subscription" is the first kind; a new kind (e.g. "health") needs no schema
-- change, only an entry in app/models/tracked_item.py (TRACKED_KINDS).
-- Amounts are EUR per billing cycle. Spend is computed from linked transactions.

CREATE TABLE tracked_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE, -- first charge; later charges follow the cycle
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (family_id, kind, name)
);

CREATE INDEX idx_tracked_items_family_kind ON tracked_items(family_id, kind);

CREATE TRIGGER update_tracked_items_updated_at
    BEFORE UPDATE ON tracked_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE transactions ADD COLUMN tracked_item_id UUID REFERENCES tracked_items(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_tracked_item_id ON transactions(tracked_item_id);
