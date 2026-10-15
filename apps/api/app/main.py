from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import pool
from app.routers import (
    auth,
    accounts,
    transactions,
    categories,
    budgets,
    allowances,
    annual_budgets,
    investments,
    exchange_rates,
    reports,
    receipts,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await pool.open()
    try:
        yield
    finally:
        await pool.close()


app = FastAPI(
    title=settings.app_name,
    description="Personal finance API with multi-currency support",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(psycopg.errors.DataError)
async def data_error_handler(_: Request, __: psycopg.errors.DataError):
    # e.g. malformed UUID in a path or query parameter
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "Invalid input"}
    )


@app.exception_handler(psycopg.errors.IntegrityError)
async def integrity_error_handler(_: Request, __: psycopg.errors.IntegrityError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Request violates a data constraint"},
    )


# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["Accounts"])
app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["Transactions"])
app.include_router(categories.router, prefix="/api/v1/categories", tags=["Categories"])
app.include_router(budgets.router, prefix="/api/v1/budgets", tags=["Budgets"])
app.include_router(allowances.router, prefix="/api/v1/allowances", tags=["Allowances"])
app.include_router(annual_budgets.router, prefix="/api/v1/annual-budgets", tags=["Annual Budgets"])
app.include_router(investments.router, prefix="/api/v1/investments", tags=["Investments"])
app.include_router(exchange_rates.router, prefix="/api/v1/exchange-rates", tags=["Exchange Rates"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(receipts.router, prefix="/api/v1/receipts", tags=["Receipts"])


@app.get("/")
async def root():
    return {"message": "Nomad Ledger API", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
