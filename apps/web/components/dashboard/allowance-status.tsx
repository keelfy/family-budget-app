'use client';

import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, getPercentage } from '@/lib/utils';
import { useAllowanceBalances } from '@/hooks/use-allowances';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function AllowanceStatus() {
  const { data: balances, isLoading } = useAllowanceBalances();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-2 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!balances?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground">No allowances set up yet</p>
        <Link href="/dashboard/allowances">
          <Button variant="link">Set up allowances</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {balances.map((balance) => {
        const totalAvailable = balance.monthly_limit + balance.carry_over_from_previous;
        const remaining = totalAvailable - balance.spent_amount;
        const percentage = getPercentage(balance.spent_amount, totalAvailable);

        return (
          <div key={balance.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{balance.allowance_name}</span>
              <Badge variant={remaining > 0 ? 'secondary' : 'destructive'}>
                {remaining > 0 ? formatCurrency(remaining) + ' left' : 'Over limit'}
              </Badge>
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(balance.spent_amount)}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}/ {formatCurrency(totalAvailable)}
              </span>
            </div>
            <Progress
              value={Math.min(percentage, 100)}
              className="h-2"
              indicatorClassName={
                percentage > 100
                  ? 'bg-destructive'
                  : percentage > 80
                  ? 'bg-warning'
                  : 'bg-primary'
              }
            />
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>Monthly: {formatCurrency(balance.monthly_limit)}</span>
              {balance.carry_over_from_previous > 0 && (
                <span>+ Carried: {formatCurrency(balance.carry_over_from_previous)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
