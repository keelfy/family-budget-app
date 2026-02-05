from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import (
    accounts,
    transactions,
    categories,
    budgets,
    allowances,
    annual_budgets,
    investments,
    exchange_rates,
    reports,
)

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="Personal finance API with multi-currency support",
    version="0.1.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["Accounts"])
app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["Transactions"])
app.include_router(categories.router, prefix="/api/v1/categories", tags=["Categories"])
app.include_router(budgets.router, prefix="/api/v1/budgets", tags=["Budgets"])
app.include_router(allowances.router, prefix="/api/v1/allowances", tags=["Allowances"])
app.include_router(annual_budgets.router, prefix="/api/v1/annual-budgets", tags=["Annual Budgets"])
app.include_router(investments.router, prefix="/api/v1/investments", tags=["Investments"])
app.include_router(exchange_rates.router, prefix="/api/v1/exchange-rates", tags=["Exchange Rates"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])


@app.get("/")
async def root():
    return {"message": "Nomad Ledger API", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
