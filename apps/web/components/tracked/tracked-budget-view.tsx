'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, Power } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { TrackedItemDialog } from '@/components/forms/tracked-item-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  useTrackedItems,
  useUpdateTrackedItem,
  useDeleteTrackedItem,
} from '@/hooks/use-tracked-items';
import { TrackedItem, TrackedKind } from '@/lib/api';
import { CYCLE_LABELS, CYCLE_UNITS, TRACKED_KINDS } from '@/lib/tracking';
import { cn, formatCurrency, formatDate, formatPeriod, getCurrentPeriod } from '@/lib/utils';

function recentPeriods(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

// Golden-angle hue steps keep neighbouring items distinct however many there are.
function itemColor(index: number): string {
  return `hsl(${Math.round((221 + index * 137.5) % 360)} 62% 52%)`;
}

/**
 * One budget made of individually tracked items. The bar is the budget: each
 * segment is one item, sized by its monthly cost and solid once it has been
 * charged in the selected month.
 */
export function TrackedBudgetView({ kind }: { kind: TrackedKind }) {
  const { label, noun, description, icon: Icon } = TRACKED_KINDS[kind];
  const { toast } = useToast();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TrackedItem | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const { data: items, isLoading } = useTrackedItems({ kind, period });
  const updateItem = useUpdateTrackedItem();
  const deleteItem = useDeleteTrackedItem();

  const colors = new Map(items?.map((item, index) => [item.id, itemColor(index)]));
  const activeItems = items?.filter((item) => item.is_active) ?? [];
  const monthlyTotal = activeItems.reduce((sum, item) => sum + item.monthly_cost, 0);
  const chargedTotal = items?.reduce((sum, item) => sum + item.spent_amount, 0) ?? 0;

  const handleEdit = (item: TrackedItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingItem(null);
  };

  const handleToggleActive = async (item: TrackedItem) => {
    try {
      await updateItem.mutateAsync({ id: item.id, data: { is_active: !item.is_active } });
      toast({ title: item.is_active ? `${item.name} deactivated` : `${item.name} activated` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleDelete = async (item: TrackedItem) => {
    try {
      await deleteItem.mutateAsync(item.id);
      toast({ title: `${item.name} deleted` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  return (
    <div>
      <PageHeader title={label} description={description}>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add {noun}
        </Button>
      </PageHeader>

      <div className="mb-6 flex items-center gap-4">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {recentPeriods(12).map((p) => (
              <SelectItem key={p} value={p}>
                {formatPeriod(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-64" />
          </CardContent>
        </Card>
      ) : items?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-center text-muted-foreground">
              No {label.toLowerCase()} yet. Add each one to see what they cost together.
            </p>
            <Button className="h-auto min-h-11 max-w-full whitespace-normal" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add your first {noun}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="mb-5 flex flex-wrap items-end gap-x-10 gap-y-3">
                <div>
                  <div className="text-3xl font-bold tabular-nums">
                    {formatCurrency(monthlyTotal)}
                    <span className="ml-1 text-base font-normal text-muted-foreground">/ month</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(monthlyTotal * 12)} a year across {activeItems.length}{' '}
                    {activeItems.length === 1 ? noun : label.toLowerCase()}
                  </p>
                </div>
                <div>
                  <div className="text-xl font-semibold tabular-nums">{formatCurrency(chargedTotal)}</div>
                  <p className="text-sm text-muted-foreground">charged in {formatPeriod(period)}</p>
                </div>
              </div>

              <div
                aria-hidden
                className="flex h-8 w-full gap-0.5 overflow-hidden rounded-md bg-secondary"
              >
                {activeItems.map((item) => (
                  <div
                    key={item.id}
                    style={{ flexGrow: item.monthly_cost, backgroundColor: colors.get(item.id) }}
                    className={cn(
                      'min-w-1 basis-0 transition-opacity motion-reduce:transition-none',
                      highlightedId
                        ? highlightedId === item.id
                          ? 'opacity-100'
                          : 'opacity-20'
                        : item.spent_amount > 0
                        ? 'opacity-100'
                        : 'opacity-40'
                    )}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Each segment is one {noun}, sized by its monthly cost. Solid segments were charged in{' '}
                {formatPeriod(period)}.
              </p>
            </CardContent>
          </Card>

          <ul className="divide-y rounded-lg border bg-card">
            {items?.map((item) => {
              const share = monthlyTotal > 0 ? (item.monthly_cost / monthlyTotal) * 100 : 0;
              return (
                <li
                  key={item.id}
                  onMouseEnter={() => item.is_active && setHighlightedId(item.id)}
                  onMouseLeave={() => setHighlightedId(null)}
                  onFocus={() => item.is_active && setHighlightedId(item.id)}
                  onBlur={() => setHighlightedId(null)}
                  className={cn(
                    'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3',
                    !item.is_active && 'text-muted-foreground'
                  )}
                >
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-sm bg-muted-foreground/40"
                    style={item.is_active ? { backgroundColor: colors.get(item.id) } : undefined}
                  />
                  <div className="min-w-0 flex-1 basis-40">
                    <div className="truncate font-medium">
                      {item.name}
                      {!item.is_active && <span className="ml-2 text-xs font-normal">Inactive</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {CYCLE_LABELS[item.cycle]}
                      {item.is_active && <> · next charge {formatDate(item.next_charge_date)}</>}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-medium">
                      {formatCurrency(item.amount)}
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / {CYCLE_UNITS[item.cycle]}
                      </span>
                    </div>
                    {item.is_active && (
                      <p className="text-sm text-muted-foreground">
                        {item.cycle !== 'monthly' && <>{formatCurrency(item.monthly_cost)} / month · </>}
                        {Math.round(share)}% of budget
                      </p>
                    )}
                  </div>
                  <div className="w-28 text-right text-sm tabular-nums">
                    {item.spent_amount > 0 ? (
                      <span className="font-medium text-foreground">{formatCurrency(item.spent_amount)}</span>
                    ) : (
                      <span className="text-muted-foreground">Not charged</span>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${item.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(item)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(item)}>
                        <Power className="mr-2 h-4 w-4" />
                        {item.is_active ? 'Deactivate' : 'Activate'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(item)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <TrackedItemDialog
        kind={kind}
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        item={editingItem}
      />
    </div>
  );
}
