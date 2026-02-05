'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { DatePicker } from '@/components/ui/date-picker';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { useAllowances } from '@/hooks/use-allowances';
import { useAnnualBudgets } from '@/hooks/use-annual-budgets';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/use-transactions';
import { useToast } from '@/components/ui/use-toast';
import { getPeriodFromDate, formatDateLocal, parseLocalDate } from '@/lib/utils';
import { Transaction } from '@/lib/api';

const transactionSchema = z.object({
  account_id: z.string().min(1, 'Account is required'),
  category_id: z.string().min(1, 'Category is required'),
  amount_original: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  currency_original: z.string().min(3, 'Currency is required'),
  transaction_date: z.date(),
  accounting_period: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  allowance_id: z.string().nullable().default(null),
  annual_budget_id: z.string().nullable().default(null),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface TransactionFormProps {
  transaction?: Transaction | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const currencies = ['EUR', 'USD', 'GBP', 'RSD', 'CHF', 'JPY', 'AUD', 'CAD', 'RUB'];

export function TransactionForm({ transaction, onSuccess, onCancel }: TransactionFormProps) {
  const { toast } = useToast();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: allowances } = useAllowances();
  const { data: annualBudgets } = useAnnualBudgets();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();

  const isEditing = !!transaction;

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      account_id: '',
      category_id: '',
      amount_original: 0,
      currency_original: 'EUR',
      transaction_date: new Date(),
      accounting_period: undefined,
      description: '',
      notes: '',
      allowance_id: null,
      annual_budget_id: null,
    },
  });

  // Populate form when editing (wait for accounts and categories to load)
  useEffect(() => {
    if (transaction && accounts && categories) {
      form.reset({
        account_id: transaction.account_id,
        category_id: transaction.category_id,
        amount_original: Math.abs(transaction.amount_original),
        currency_original: transaction.currency_original,
        transaction_date: parseLocalDate(transaction.transaction_date),
        accounting_period: transaction.accounting_period,
        description: transaction.description || '',
        notes: transaction.notes || '',
        allowance_id: transaction.allowance_id || null,
        annual_budget_id: transaction.annual_budget_id || null,
      });
    }
  }, [transaction, accounts, categories, form]);

  // Update currency when account changes (only for new transactions)
  const handleAccountChange = (accountId: string) => {
    form.setValue('account_id', accountId);
    if (!isEditing) {
      const account = accounts?.find((a) => a.id === accountId);
      if (account) {
        form.setValue('currency_original', account.currency_code);
      }
    }
  };

  // Update accounting period when date changes
  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      form.setValue('transaction_date', date);
      form.setValue('accounting_period', getPeriodFromDate(date));
    }
  };

  const incomeCategories = categories?.filter((c) => c.type === 'income') || [];
  const expenseCategories = categories?.filter((c) => c.type === 'expense') || [];
  const transferCategories = categories?.filter((c) => c.type === 'transfer') || [];

  const onSubmit = async (data: TransactionFormValues) => {
    try {
      // Derive accounting_period from transaction_date if not explicitly set
      const accountingPeriod = data.accounting_period || getPeriodFromDate(data.transaction_date);
      const transactionDate = formatDateLocal(data.transaction_date);

      if (isEditing && transaction) {
        await updateTransaction.mutateAsync({
          id: transaction.id,
          data: {
            category_id: data.category_id,
            amount_original: data.amount_original,
            transaction_date: transactionDate,
            accounting_period: accountingPeriod,
            description: data.description,
            notes: data.notes,
            allowance_id: data.allowance_id,
            annual_budget_id: data.annual_budget_id,
          },
        });
        toast({ title: 'Transaction updated successfully' });
      } else {
        await createTransaction.mutateAsync({
          ...data,
          transaction_date: transactionDate,
          accounting_period: accountingPeriod,
        });
        toast({ title: 'Transaction created successfully' });
      }
      onSuccess();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const isPending = createTransaction.isPending || updateTransaction.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account</FormLabel>
              <Select
                onValueChange={handleAccountChange}
                value={field.value}
                disabled={isEditing} // Can't change account when editing
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.currency_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEditing && (
                <FormDescription>Account cannot be changed when editing</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {expenseCategories.length > 0 && (
                    <>
                      <SelectItem value="_expense_header" disabled className="font-semibold">
                        Expenses
                      </SelectItem>
                      {expenseCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {incomeCategories.length > 0 && (
                    <>
                      <SelectItem value="_income_header" disabled className="font-semibold">
                        Income
                      </SelectItem>
                      {incomeCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {transferCategories.length > 0 && (
                    <>
                      <SelectItem value="_transfer_header" disabled className="font-semibold">
                        Transfers
                      </SelectItem>
                      {transferCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount_original"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" min="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency_original"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isEditing} // Can't change currency when editing
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {currencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
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
          name="transaction_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <DatePicker date={field.value} onSelect={handleDateChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="What was this for?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional notes..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="allowance_id"
          render={({ field }) => {
            const isChecked = field.value !== null;
            const activeAllowances = allowances?.filter((a) => a.is_active) || [];

            return (
              <FormItem className="rounded-md border p-4 space-y-3">
                <div className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          field.onChange(activeAllowances[0]?.id || null);
                        } else {
                          field.onChange(null);
                        }
                      }}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Personal Allowance</FormLabel>
                    <FormDescription>
                      Count this against a personal spending allowance
                    </FormDescription>
                  </div>
                </div>
                {isChecked && activeAllowances.length > 0 && (
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select allowance" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeAllowances.map((allowance) => (
                        <SelectItem key={allowance.id} value={allowance.id}>
                          {allowance.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {isChecked && activeAllowances.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No allowances created yet. Create one in the Allowances page.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="annual_budget_id"
          render={({ field }) => {
            const isChecked = field.value !== null;
            const activeAnnualBudgets = annualBudgets?.filter((b) => b.is_active) || [];

            return (
              <FormItem className="rounded-md border p-4 space-y-3">
                <div className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          field.onChange(activeAnnualBudgets[0]?.id || null);
                        } else {
                          field.onChange(null);
                        }
                      }}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Annual Budget</FormLabel>
                    <FormDescription>
                      Count this against a yearly budget
                    </FormDescription>
                  </div>
                </div>
                {isChecked && activeAnnualBudgets.length > 0 && (
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select annual budget" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeAnnualBudgets.map((budget) => (
                        <SelectItem key={budget.id} value={budget.id}>
                          {budget.name} ({budget.year})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {isChecked && activeAnnualBudgets.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No annual budgets created yet. Create one in the Annual Budgets page.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? (isEditing ? 'Updating...' : 'Creating...')
              : (isEditing ? 'Update Transaction' : 'Create Transaction')
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}
