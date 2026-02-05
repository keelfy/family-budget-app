'use client';

import { useState } from 'react';
import { CreditCard, Plus, RefreshCw, Pencil, Trash2, MoreHorizontal, Calculator } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAllowances,
  useAllowanceBalances,
  useAllowanceRollover,
  useRecalculateAllowanceBalance,
  useDeleteAllowance,
} from '@/hooks/use-allowances';
import { AllowanceDialog } from '@/components/forms/allowance-dialog';
import { formatCurrency, getPercentage, getCurrentPeriod, formatPeriod } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { AllowanceDefinition } from '@/lib/api';

export default function AllowancesPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const { data: allowances } = useAllowances();
  const { data: balances, isLoading } = useAllowanceBalances({ period });
  const rollover = useAllowanceRollover();
  const deleteAllowance = useDeleteAllowance();
  const recalculate = useRecalculateAllowanceBalance();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAllowance, setEditingAllowance] = useState<AllowanceDefinition | null>(null);

  const currentPeriod = getCurrentPeriod();
  const isCurrentPeriod = period === currentPeriod;

  // Generate period options (last 12 months)
  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return date.toISOString().slice(0, 7);
  });

  const handleRollover = async () => {
    try {
      await rollover.mutateAsync();
      toast({ title: 'Month rollover completed' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Rollover failed',
        description: error.message,
      });
    }
  };

  const handleRecalculate = async (balanceId: string) => {
    try {
      await recalculate.mutateAsync(balanceId);
      toast({ title: 'Spent amount recalculated' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Recalculation failed',
        description: error.message,
      });
    }
  };

  const handleEdit = (allowanceId: string) => {
    const def = allowances?.find((a) => a.id === allowanceId);
    if (def) {
      setEditingAllowance(def);
      setDialogOpen(true);
    }
  };

  const handleDelete = async (allowanceId: string) => {
    try {
      await deleteAllowance.mutateAsync(allowanceId);
      toast({ title: 'Allowance deleted' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.message,
      });
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingAllowance(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Personal Allowances"
        description={`Allowance tracking for ${formatPeriod(period)}`}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRollover} disabled={rollover.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${rollover.isPending ? 'animate-spin' : ''}`} />
            Month Rollover
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Allowance
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
                {formatPeriod(p)}{p === currentPeriod ? ' (current)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            How Allowances Work
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>Create named allowances (e.g. "Dad's Fun Money", "Vacation Fund")</li>
            <li>Each allowance has a monthly spending limit</li>
            <li>Unspent amounts carry over to the next month</li>
            <li>Assign transactions to an allowance to track against its limit</li>
            <li>Run "Month Rollover" to create or re-calculate carry-overs for the current month</li>
          </ul>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-10 w-40 mb-4" />
                <Skeleton className="h-2 w-full mb-4" />
                <Skeleton className="h-4 w-48" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : balances?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              No allowance balances for {formatPeriod(period)}
            </p>
            {isCurrentPeriod ? (
              <p className="text-sm text-muted-foreground">
                Create an allowance and run a rollover, or assign a transaction to an allowance
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No balances were recorded for this period
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {balances?.map((balance) => {
            const totalAvailable = balance.monthly_limit + balance.carry_over_from_previous;
            const remaining = totalAvailable - balance.spent_amount;
            const percentage = getPercentage(balance.spent_amount, totalAvailable);
            const isOverLimit = remaining < 0;

            return (
              <Card key={balance.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">{balance.allowance_name || 'Allowance'}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant={isOverLimit ? 'destructive' : remaining < 30 ? 'warning' : 'secondary'}>
                        {isOverLimit
                          ? `${formatCurrency(Math.abs(remaining))} over`
                          : `${formatCurrency(remaining)} left`}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRecalculate(balance.id)}>
                            <Calculator className="mr-2 h-4 w-4" />
                            Re-calculate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(balance.allowance_id)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(balance.allowance_id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-3xl font-bold">
                      {formatCurrency(balance.spent_amount)}
                      <span className="text-lg font-normal text-muted-foreground">
                        {' '}/ {formatCurrency(totalAvailable)}
                      </span>
                    </p>
                  </div>

                  <Progress
                    value={Math.min(percentage, 100)}
                    className="h-3 mb-4"
                    indicatorClassName={
                      isOverLimit
                        ? 'bg-destructive'
                        : percentage > 80
                        ? 'bg-warning'
                        : 'bg-primary'
                    }
                  />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Monthly Limit</p>
                      <p className="font-medium">{formatCurrency(balance.monthly_limit)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Carried Over</p>
                      <p className="font-medium text-success">
                        +{formatCurrency(balance.carry_over_from_previous)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Available</p>
                      <p className="font-medium">{formatCurrency(totalAvailable)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Spent</p>
                      <p className="font-medium">{formatCurrency(balance.spent_amount)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AllowanceDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        allowance={editingAllowance}
      />
    </div>
  );
}
