'use client';

import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, getPercentage, getCurrentPeriod } from '@/lib/utils';
import { useBudgets } from '@/hooks/use-budgets';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function BudgetOverview() {
  const { data: budgets, isLoading } = useBudgets({
    period: getCurrentPeriod(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!budgets?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground">No budgets set up yet</p>
        <Link href="/dashboard/budgets">
          <Button variant="link">Set up your first budget</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {budgets.slice(0, 5).map((budget) => {
        const percentage = getPercentage(budget.spent_amount, budget.amount_planned);
        const isOverBudget = percentage > 100;

        return (
          <div key={budget.id} className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{budget.category_name}</span>
              <span className={isOverBudget ? 'text-destructive' : 'text-muted-foreground'}>
                {formatCurrency(budget.spent_amount)} / {formatCurrency(budget.amount_planned)}
              </span>
            </div>
            <Progress
              value={Math.min(percentage, 100)}
              className="h-2"
              indicatorClassName={
                isOverBudget
                  ? 'bg-destructive'
                  : percentage > 80
                  ? 'bg-warning'
                  : 'bg-success'
              }
            />
          </div>
        );
      })}
      <Link href="/dashboard/budgets">
        <Button variant="ghost" className="w-full">
          View all budgets
        </Button>
      </Link>
    </div>
  );
}
