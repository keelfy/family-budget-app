'use client';

import { useState } from 'react';
import { Plus, Copy, Target } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBudgets, useCopyBudgets } from '@/hooks/use-budgets';
import { formatCurrency, getPercentage, getCurrentPeriod, formatPeriod } from '@/lib/utils';
import { BudgetDialog } from '@/components/forms/budget-dialog';
import { useToast } from '@/components/ui/use-toast';

export default function BudgetsPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: budgets, isLoading } = useBudgets({ period });
  const copyBudgets = useCopyBudgets();

  // Generate period options
  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i + 1);
    return date.toISOString().slice(0, 7);
  });

  const handleCopyFromPrevious = async () => {
    const [year, month] = period.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevPeriod = prevDate.toISOString().slice(0, 7);

    try {
      await copyBudgets.mutateAsync({ fromPeriod: prevPeriod, toPeriod: period });
      toast({ title: 'Budgets copied successfully' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to copy budgets',
        description: error.message,
      });
    }
  };

  const totalBudgeted = budgets?.reduce((sum, b) => sum + b.amount_planned, 0) || 0;
  const totalSpent = budgets?.reduce((sum, b) => sum + b.spent_amount, 0) || 0;

  return (
    <div>
      <PageHeader title="Budgets" description="Track your spending against budgets">
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopyFromPrevious} disabled={copyBudgets.isPending}>
            <Copy className="mr-2 h-4 w-4" />
            Copy from Previous
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Budget
          </Button>
        </div>
      </PageHeader>

      <div className="mb-6 flex items-center gap-4">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((p) => (
              <SelectItem key={p} value={p}>
                {formatPeriod(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Budgeted</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBudgeted)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSpent)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalBudgeted - totalSpent >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(totalBudgeted - totalSpent)}
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-2 w-full mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : budgets?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No budgets set for this period</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first budget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {budgets?.map((budget) => {
            const percentage = getPercentage(budget.spent_amount, budget.amount_planned);
            const isOverBudget = percentage > 100;
            const remaining = budget.amount_planned - budget.spent_amount;

            return (
              <Card key={budget.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">{budget.category_name}</h3>
                    <span className={`text-sm font-medium ${isOverBudget ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {percentage}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(percentage, 100)}
                    className="h-2 mb-3"
                    indicatorClassName={
                      isOverBudget
                        ? 'bg-destructive'
                        : percentage > 80
                        ? 'bg-warning'
                        : 'bg-success'
                    }
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatCurrency(budget.spent_amount)} spent
                    </span>
                    <span className={isOverBudget ? 'text-destructive' : ''}>
                      {isOverBudget ? `${formatCurrency(Math.abs(remaining))} over` : `${formatCurrency(remaining)} left`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    of {formatCurrency(budget.amount_planned)} budgeted
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BudgetDialog open={dialogOpen} onOpenChange={setDialogOpen} period={period} />
    </div>
  );
}
