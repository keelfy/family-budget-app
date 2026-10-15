"""Apply pending SQL migrations from db/migrations (lexical order) to DATABASE_URL.

Applied file names are recorded in schema_migrations; each file runs in its own
transaction. An advisory lock serializes concurrent runners.
"""
import os
import sys
from pathlib import Path

import psycopg

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
LOCK_ID = 727274


def main() -> int:
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", [LOCK_ID])
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
        )
        applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}

        pending = [f for f in sorted(MIGRATIONS_DIR.glob("*.sql")) if f.name not in applied]
        for path in pending:
            print(f"applying {path.name}", flush=True)
            with conn.transaction():
                conn.execute(path.read_text())
                conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", [path.name])

        print(f"done: {len(pending)} applied, {len(applied)} already up to date", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
