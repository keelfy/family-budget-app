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
import { useCreateAnnualBudget, useUpdateAnnualBudget } from '@/hooks/use-annual-budgets';
import { useToast } from '@/components/ui/use-toast';
import { AnnualBudget } from '@/lib/api';

const currentYear = new Date().getFullYear();
const yearOptions = [
  String(currentYear - 1),
  String(currentYear),
  String(currentYear + 1),
];

const annualBudgetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  year: z.string().min(4, 'Year is required'),
  amount_planned: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
});

type AnnualBudgetFormValues = z.infer<typeof annualBudgetSchema>;

interface AnnualBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  annualBudget?: AnnualBudget | null;
}

export function AnnualBudgetDialog({ open, onOpenChange, annualBudget }: AnnualBudgetDialogProps) {
  const { toast } = useToast();
  const createBudget = useCreateAnnualBudget();
  const updateBudget = useUpdateAnnualBudget();

  const form = useForm<AnnualBudgetFormValues>({
    resolver: zodResolver(annualBudgetSchema),
    defaultValues: {
      name: '',
      year: String(currentYear),
      amount_planned: 0,
    },
  });

  useEffect(() => {
    if (annualBudget) {
      form.reset({
        name: annualBudget.name,
        year: annualBudget.year,
        amount_planned: annualBudget.amount_planned,
      });
    } else {
      form.reset({
        name: '',
        year: String(currentYear),
        amount_planned: 0,
      });
    }
  }, [annualBudget, form]);

  const onSubmit = async (data: AnnualBudgetFormValues) => {
    try {
      if (annualBudget) {
        await updateBudget.mutateAsync({
          id: annualBudget.id,
          data: {
            name: data.name,
            amount_planned: data.amount_planned,
          },
        });
        toast({ title: 'Annual budget updated successfully' });
      } else {
        await createBudget.mutateAsync(data);
        toast({ title: 'Annual budget created successfully' });
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
          <DialogTitle>{annualBudget ? 'Edit Annual Budget' : 'Add Annual Budget'}</DialogTitle>
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
                    <Input placeholder="e.g. Trips, Concerts" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!!annualBudget}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount_planned"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Planned Amount (EUR)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createBudget.isPending || updateBudget.isPending}>
                {annualBudget ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
