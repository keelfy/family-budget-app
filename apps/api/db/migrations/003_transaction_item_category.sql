-- Optional per-item category. NULL means "same as the transaction's category".
ALTER TABLE transaction_items
    ADD COLUMN category_id UUID NULL REFERENCES categories(id) ON DELETE RESTRICT;

CREATE INDEX idx_transaction_items_category_id ON transaction_items(category_id)
    WHERE category_id IS NOT NULL;

-- Spending/income split by effective category, in EUR. Transactions without items
-- contribute one row; with items, each item gets its share of amount_base_eur
-- (items always sum to amount_original, so the shares add up to the total).
CREATE VIEW transaction_category_amounts AS
SELECT t.id AS transaction_id,
       t.user_id,
       t.accounting_period,
       t.category_id,
       ABS(t.amount_base_eur) AS amount_eur
FROM transactions t
WHERE NOT EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id)
UNION ALL
SELECT t.id,
       t.user_id,
       t.accounting_period,
       COALESCE(ti.category_id, t.category_id),
       ABS(t.amount_base_eur) * ti.amount / ABS(t.amount_original)
FROM transactions t
JOIN transaction_items ti ON ti.transaction_id = t.id;
