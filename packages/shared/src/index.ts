// Currency codes supported by the application
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'RSD', 'CHF', 'JPY', 'AUD', 'CAD'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

// Account types
export const ACCOUNT_TYPES = ['checking', 'savings', 'investment', 'credit', 'cash'] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

// Category types
export const CATEGORY_TYPES = ['income', 'expense', 'transfer'] as const;
export type CategoryType = typeof CATEGORY_TYPES[number];

// Investment asset types
export const ASSET_TYPES = ['etf', 'stock', 'crypto', 'bond'] as const;
export type AssetType = typeof ASSET_TYPES[number];

// Base currency for the app
export const BASE_CURRENCY: CurrencyCode = 'EUR';

// Default monthly allowance
export const DEFAULT_MONTHLY_ALLOWANCE = 150;

// Period format: YYYY-MM
export type Period = `${number}-${string}`;

export function formatPeriod(date: Date): Period {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` as Period;
}

export function parsePeriod(period: Period): { year: number; month: number } {
  const [year, month] = period.split('-').map(Number);
  return { year, month };
}

export function getCurrentPeriod(): Period {
  return formatPeriod(new Date());
}

export function getPreviousPeriod(period: Period): Period {
  const { year, month } = parsePeriod(period);
  const date = new Date(year, month - 2, 1);
  return formatPeriod(date);
}

export function getNextPeriod(period: Period): Period {
  const { year, month } = parsePeriod(period);
  const date = new Date(year, month, 1);
  return formatPeriod(date);
}
