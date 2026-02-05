'use client';

import { useState } from 'react';
import { Plus, Calendar, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAnnualBudgets, useDeleteAnnualBudget } from '@/hooks/use-annual-budgets';
import { formatCurrency, getPercentage } from '@/lib/utils';
import { AnnualBudgetDialog } from '@/components/forms/annual-budget-dialog';
import { useToast } from '@/components/ui/use-toast';
import { AnnualBudget } from '@/lib/api';

const currentYear = new Date().getFullYear();
const yearOptions = [
  String(currentYear - 1),
  String(currentYear),
  String(currentYear + 1),
];

export default function AnnualBudgetsPage() {
  const { toast } = useToast();
  const [year, setYear] = useState(String(currentYear));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<AnnualBudget | null>(null);

  const { data: budgets, isLoading } = useAnnualBudgets({ year });
  const deleteBudget = useDeleteAnnualBudget();

  const handleEdit = (budget: AnnualBudget) => {
    setEditingBudget(budget);
    setDialogOpen(true);
  };

  const handleDelete = async (budget: AnnualBudget) => {
    try {
      await deleteBudget.mutateAsync(budget.id);
      toast({ title: 'Annual budget deleted successfully' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingBudget(null);
  };

  const totalBudgeted = budgets?.reduce((sum, b) => sum + b.amount_planned, 0) || 0;
  const totalSpent = budgets?.reduce((sum, b) => sum + b.spent_amount, 0) || 0;

  return (
    <div>
      <PageHeader title="Annual Budgets" description="Track yearly spending budgets">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Budget
        </Button>
      </PageHeader>

      <div className="mb-6 flex items-center gap-4">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Budgeted</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
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
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No annual budgets set for {year}</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first annual budget
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
                    <h3 className="font-semibold">{budget.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isOverBudget ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {percentage}%
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(budget)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(budget)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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

      <AnnualBudgetDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        annualBudget={editingBudget}
      />
    </div>
  );
}
