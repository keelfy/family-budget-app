-- Where the purchase was made (e.g. shop name from a fiscal receipt).
ALTER TABLE transactions ADD COLUMN merchant TEXT NULL;
