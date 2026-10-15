from typing import Any, AsyncIterator, Mapping

import psycopg
from psycopg import AsyncConnection, sql
from psycopg.adapt import Loader
from psycopg.rows import dict_row
from psycopg.types.string import TextLoader
from psycopg_pool import AsyncConnectionPool

from app.config import get_settings

Row = dict[str, Any]


class _FloatLoader(Loader):
    """Load NUMERIC as float (API models and rate maths use float)."""

    def load(self, data):
        return float(bytes(data))


# UUID -> str and NUMERIC -> float keep API models and JSON output unchanged.
psycopg.adapters.register_loader("uuid", TextLoader)
psycopg.adapters.register_loader("numeric", _FloatLoader)

# Autocommit: every statement is atomic (triggers included). Multi-statement
# operations opt into a transaction with `async with db.transaction():`.
pool = AsyncConnectionPool(
    get_settings().database_url,
    kwargs={"autocommit": True, "row_factory": dict_row},
    open=False,
)


async def get_db() -> AsyncIterator[AsyncConnection]:
    """FastAPI dependency: connection borrowed from the pool."""
    async with pool.connection() as conn:
        yield conn


async def fetch_all(conn: AsyncConnection, query: Any, params: Any = None) -> list[Row]:
    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def fetch_one(conn: AsyncConnection, query: Any, params: Any = None) -> Row | None:
    cur = await conn.execute(query, params)
    return await cur.fetchone()


async def execute(conn: AsyncConnection, query: Any, params: Any = None) -> None:
    await conn.execute(query, params)


async def insert(conn: AsyncConnection, table: str, data: Mapping[str, Any]) -> Row:
    """INSERT one row and return it. Column names come from trusted code, not input."""
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
        sql.Identifier(table),
        sql.SQL(", ").join(map(sql.Identifier, data)),
        sql.SQL(", ").join([sql.Placeholder()] * len(data)),
    )
    row = await fetch_one(conn, query, list(data.values()))
    assert row is not None
    return row


async def update(
    conn: AsyncConnection,
    table: str,
    data: Mapping[str, Any],
    where: Mapping[str, Any],
) -> Row | None:
    """UPDATE rows matching all `where` equalities; return the first updated row."""
    query = sql.SQL("UPDATE {} SET {} WHERE {} RETURNING *").format(
        sql.Identifier(table),
        sql.SQL(", ").join(
            sql.SQL("{} = {}").format(sql.Identifier(k), sql.Placeholder()) for k in data
        ),
        sql.SQL(" AND ").join(
            sql.SQL("{} = {}").format(sql.Identifier(k), sql.Placeholder()) for k in where
        ),
    )
    return await fetch_one(conn, query, [*data.values(), *where.values()])
