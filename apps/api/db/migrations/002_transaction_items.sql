-- Receipt lines inside one transaction. transactions.amount_original stays the
-- source of truth (balance/allowance triggers are unchanged); the API keeps
-- SUM(items.amount) equal to it. Amounts are in the transaction's currency.
CREATE TABLE transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    position INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transaction_items_transaction_id ON transaction_items(transaction_id);
