'use client';

import { Wallet, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getCurrentPeriod } from '@/lib/utils';
import { useAccounts } from '@/hooks/use-accounts';
import { useTransactions } from '@/hooks/use-transactions';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardStats() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: transactions, isLoading: transactionsLoading } = useTransactions({
    period: getCurrentPeriod(),
  });

  const totalBalance = accounts?.reduce(
    (sum, account) => sum + (account.current_balance_eur || 0),
    0
  ) || 0;

  const monthlyIncome = transactions?.reduce(
    (sum, t) => (t.category_type === 'income' ? sum + t.amount_base_eur : sum),
    0
  ) || 0;

  const monthlyExpenses = transactions?.reduce(
    (sum, t) => (t.category_type === 'expense' ? sum + Math.abs(t.amount_base_eur) : sum),
    0
  ) || 0;

  const savings = monthlyIncome - monthlyExpenses;

  const isLoading = accountsLoading || transactionsLoading;

  const stats = [
    {
      title: 'Total Balance',
      value: totalBalance,
      icon: Wallet,
      description: 'Across all accounts',
    },
    {
      title: 'Monthly Income',
      value: monthlyIncome,
      icon: TrendingUp,
      description: 'This month',
      positive: true,
    },
    {
      title: 'Monthly Expenses',
      value: monthlyExpenses,
      icon: TrendingDown,
      description: 'This month',
      positive: false,
    },
    {
      title: 'Net Savings',
      value: savings,
      icon: PiggyBank,
      description: 'This month',
      positive: savings >= 0,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div
                  className={`text-2xl font-bold ${
                    stat.positive !== undefined
                      ? stat.positive
                        ? 'text-success'
                        : 'text-destructive'
                      : ''
                  }`}
                >
                  {formatCurrency(stat.value)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
