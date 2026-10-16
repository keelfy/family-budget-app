'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateTrackedItem, useUpdateTrackedItem } from '@/hooks/use-tracked-items';
import { useToast } from '@/components/ui/use-toast';
import { BillingCycle, TrackedItem, TrackedKind } from '@/lib/api';
import { CYCLE_LABELS, TRACKED_KINDS } from '@/lib/tracking';

const cycles = Object.keys(CYCLE_LABELS) as BillingCycle[];

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const trackedItemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  cycle: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  start_date: z.string().min(1, 'Charge date is required'),
});

type TrackedItemFormValues = z.infer<typeof trackedItemSchema>;

interface TrackedItemDialogProps {
  kind: TrackedKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: TrackedItem | null;
}

export function TrackedItemDialog({ kind, open, onOpenChange, item }: TrackedItemDialogProps) {
  const { noun, namePlaceholder } = TRACKED_KINDS[kind];
  const { toast } = useToast();
  const createItem = useCreateTrackedItem();
  const updateItem = useUpdateTrackedItem();

  const form = useForm<TrackedItemFormValues>({
    resolver: zodResolver(trackedItemSchema),
    defaultValues: { name: '', amount: 0, cycle: 'monthly', start_date: today() },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      item
        ? { name: item.name, amount: item.amount, cycle: item.cycle, start_date: item.start_date }
        : { name: '', amount: 0, cycle: 'monthly', start_date: today() }
    );
  }, [open, item, form]);

  const onSubmit = async (data: TrackedItemFormValues) => {
    try {
      if (item) {
        await updateItem.mutateAsync({ id: item.id, data });
        toast({ title: `${capitalize(noun)} updated successfully` });
      } else {
        await createItem.mutateAsync({ kind, ...data });
        toast({ title: `${capitalize(noun)} added successfully` });
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder={namePlaceholder} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price per charge (EUR)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cycle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billed</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {cycles.map((cycle) => (
                          <SelectItem key={cycle} value={cycle}>
                            {CYCLE_LABELS[cycle]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Charge date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>
                    Any date it was or will be charged. Later charges follow the billing cycle.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createItem.isPending || updateItem.isPending}>
                {item ? 'Save changes' : `Add ${noun}`}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
