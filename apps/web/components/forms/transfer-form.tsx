'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { DatePicker } from '@/components/ui/date-picker';
import { useAccounts } from '@/hooks/use-accounts';
import { useTransfer } from '@/hooks/use-transactions';
import { useToast } from '@/components/ui/use-toast';
import { formatDateLocal } from '@/lib/utils';

const transferSchema = z.object({
  from_account_id: z.string().min(1, 'Source account is required'),
  to_account_id: z.string().min(1, 'Destination account is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  currency: z.string().min(3, 'Currency is required'),
  to_amount: z.coerce.number().min(0).optional(),
  transaction_date: z.date(),
  description: z.string().optional(),
}).refine((data) => data.from_account_id !== data.to_account_id, {
  message: 'Source and destination accounts must be different',
  path: ['to_account_id'],
});

type TransferFormValues = z.infer<typeof transferSchema>;

interface TransferFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const currencies = ['EUR', 'USD', 'GBP', 'RSD', 'CHF', 'JPY', 'AUD', 'CAD', 'RUB'];

export function TransferForm({ onSuccess, onCancel }: TransferFormProps) {
  const { toast } = useToast();
  const { data: accounts } = useAccounts();
  const transfer = useTransfer();

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_account_id: '',
      to_account_id: '',
      amount: 0,
      currency: 'EUR',
      to_amount: undefined,
      transaction_date: new Date(),
      description: '',
    },
  });

  const handleFromAccountChange = (accountId: string) => {
    form.setValue('from_account_id', accountId);
    const account = accounts?.find((a) => a.id === accountId);
    if (account) {
      form.setValue('currency', account.currency_code);
    }
  };

  const [toAccountId, currency, amount, toAmount] = form.watch([
    'to_account_id',
    'currency',
    'amount',
    'to_amount',
  ]);
  const toCurrency = accounts?.find((a) => a.id === toAccountId)?.currency_code;
  const isCrossCurrency = !!toCurrency && toCurrency !== currency;
  const ownRate = isCrossCurrency && amount > 0 && toAmount ? toAmount / amount : null;

  const onSubmit = async (data: TransferFormValues) => {
    try {
      await transfer.mutateAsync({
        from_account_id: data.from_account_id,
        to_account_id: data.to_account_id,
        amount: data.amount,
        currency: data.currency,
        to_amount: isCrossCurrency && data.to_amount ? data.to_amount : undefined,
        transaction_date: formatDateLocal(data.transaction_date),
        description: data.description,
      });
      toast({ title: 'Transfer created successfully' });
      onSuccess();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const activeAccounts = accounts?.filter((a) => a.is_active) || [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="from_account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>From Account</FormLabel>
              <Select onValueChange={handleFromAccountChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source account" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {activeAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.currency_code})
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
          name="to_account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>To Account</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination account" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {activeAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.currency_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
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
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
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

        {isCrossCurrency && (
          <FormField
            control={form.control}
            name="to_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount received ({toCurrency})</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Actual amount from the exchange office"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  {ownRate
                    ? `Your rate: 1 ${currency} = ${ownRate.toFixed(4)} ${toCurrency}. Applies to later ${currency}/${toCurrency} transactions.`
                    : 'Leave empty to use the market rate.'}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="transaction_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <DatePicker date={field.value} onSelect={(date) => date && form.setValue('transaction_date', date)} />
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
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g. ATM withdrawal, move to savings" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={transfer.isPending}>
            {transfer.isPending ? 'Creating...' : 'Create Transfer'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
