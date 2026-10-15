'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownLeft, ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useTransactions } from '@/hooks/use-transactions';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function RecentTransactions() {
  const { data: transactions, isLoading } = useTransactions({ limit: 5 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!transactions?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground">No transactions yet</p>
        <Link href="/dashboard/transactions/new">
          <Button variant="link">Add your first transaction</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {transactions.map((transaction) => {
        const isIncome = transaction.category_type === 'income';
        const isTransfer = transaction.category_type === 'transfer';
        const Icon = isTransfer ? ArrowRight : isIncome ? ArrowDownLeft : ArrowUpRight;
        const color = isTransfer ? 'text-blue-500' : isIncome ? 'text-success' : 'text-destructive';

        return (
          <Link
            key={transaction.id}
            href={`/dashboard/transactions/${transaction.id}`}
            className="flex items-center gap-2 rounded-lg sm:gap-4 p-2 transition-colors hover:bg-muted"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{transaction.description || transaction.category_name}</p>
              <p className="break-words text-xs text-muted-foreground sm:text-sm">
                {transaction.account_name} - {formatDate(transaction.transaction_date)}
              </p>
            </div>
            <div className={`shrink-0 text-sm font-medium sm:text-base ${color}`}>
              {isIncome ? '+' : isTransfer ? '' : '-'}
              {formatCurrency(Math.abs(transaction.amount_base_eur))}
            </div>
          </Link>
        );
      })}
      <Link href="/dashboard/transactions">
        <Button variant="ghost" className="w-full">
          View all transactions
        </Button>
      </Link>
    </div>
  );
}
