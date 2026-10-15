'use client';

import { memo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn, formatCurrency } from '@/lib/utils';

export interface ItemFormValue {
  name: string;
  amount: number | string;
  /** '' = same category as the transaction. */
  category_id?: string;
}

export interface ItemCategoryOption {
  id: string;
  name: string;
}

export function sumItems(items: ItemFormValue[] | undefined): number {
  const cents = (items ?? []).reduce(
    (acc, item) => acc + Math.round((Number(item.amount) || 0) * 100),
    0
  );
  return cents / 100;
}

/** Amount input that follows the item sum while the transaction has items. */
export function ItemsAwareAmountInput({
  value,
  onChange,
  onBlur,
  name,
}: {
  value: number | string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  name: string;
}) {
  const { control } = useFormContext();
  const items = useWatch({ control, name: 'items' }) as ItemFormValue[] | undefined;
  const hasItems = !!items?.length;

  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      name={name}
      onBlur={onBlur}
      onChange={onChange}
      value={hasItems ? sumItems(items).toFixed(2) : value}
      readOnly={hasItems}
      aria-describedby={hasItems ? 'items-total-hint' : undefined}
    />
  );
}

const ItemRow = memo(function ItemRow({
  index,
  isLast,
  categories,
  onRemove,
  onAdd,
}: {
  index: number;
  isLast: boolean;
  categories: ItemCategoryOption[];
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  const { register, control } = useFormContext();
  const categoryId = useWatch({ control, name: `items.${index}.category_id` }) as
    | string
    | undefined;
  const known = !!categoryId && categories.some((c) => c.id === categoryId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="min-w-0 flex-1 basis-40"
        placeholder="Item"
        aria-label={`Item ${index + 1} name`}
        {...register(`items.${index}.name`)}
      />
      <Input
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        placeholder="0.00"
        aria-label={`Item ${index + 1} amount`}
        className="w-28 shrink-0 text-right tabular-nums"
        {...register(`items.${index}.amount`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isLast) {
            e.preventDefault();
            onAdd();
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={`Remove item ${index + 1}`}
        onClick={() => onRemove(index)}
      >
        <X className="h-4 w-4" />
      </Button>
      <select
        aria-label={`Item ${index + 1} category`}
        className={cn(
          'h-8 w-full rounded-md border border-input bg-background px-2 text-xs',
          known ? 'text-foreground' : 'text-muted-foreground'
        )}
        {...register(`items.${index}.category_id`)}
        value={known ? categoryId : ''}
      >
        <option value="">Same category as the transaction</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
});

/** Receipt lines for one transaction. The transaction amount is their sum. */
export function TransactionItemsEditor({
  currency,
  categories,
}: {
  currency: string;
  /** Categories an item may use: same type as the transaction's category. */
  categories: ItemCategoryOption[];
}) {
  const {
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext();
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' }) as ItemFormValue[] | undefined;
  const enabled = fields.length > 0;
  const rowErrors = (errors.items ?? []) as unknown as Array<
    { name?: { message?: string }; amount?: { message?: string } } | undefined
  >;
  const firstError = Array.isArray(rowErrors)
    ? rowErrors.map((row) => row?.name?.message ?? row?.amount?.message).find(Boolean)
    : undefined;

  const addItem = () => append({ name: '', amount: '', category_id: '' });

  const toggle = (checked: boolean) => {
    if (checked) {
      // Seed the first line with the amount typed so far.
      const current = Number(getValues('amount_original')) || 0;
      append({ name: '', amount: current > 0 ? current : '', category_id: '' });
    } else {
      // Keep the total as a plain amount once the lines are gone.
      setValue('amount_original', sumItems(getValues('items')) || getValues('amount_original'));
      replace([]);
    }
  };

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex flex-row items-start space-x-3 space-y-0">
        <Checkbox id="split-items" checked={enabled} onCheckedChange={(c) => toggle(c === true)} />
        <div className="space-y-1 leading-none">
          <Label htmlFor="split-items">Split into items</Label>
          <p className="text-sm text-muted-foreground">
            List what was on the receipt. The amount becomes the sum of the items.
          </p>
        </div>
      </div>

      {enabled && (
        <>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <ItemRow
                key={field.id}
                index={index}
                isLast={index === fields.length - 1}
                categories={categories}
                onRemove={remove}
                onAdd={addItem}
              />
            ))}
          </div>
          {firstError && <p className="text-sm font-medium text-destructive">{firstError}</p>}
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="mr-2 h-4 w-4" />
              Add item
            </Button>
            <p id="items-total-hint" className="text-sm font-medium tabular-nums">
              Total {formatCurrency(sumItems(items), currency)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
