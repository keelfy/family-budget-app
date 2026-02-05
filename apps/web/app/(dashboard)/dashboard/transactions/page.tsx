'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowUpRight, ArrowDownLeft, ArrowRight, Filter } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTransactions } from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { formatCurrency, formatDate, getCurrentPeriod } from '@/lib/utils';

export default function TransactionsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [accountFilter, setAccountFilter] = useState<string>('all');

  const { data: transactions, isLoading } = useTransactions({
    period,
    account_id: accountFilter !== 'all' ? accountFilter : undefined,
  });
  const { data: accounts } = useAccounts();

  // Generate period options (last 12 months)
  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return date.toISOString().slice(0, 7);
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'income': return ArrowDownLeft;
      case 'expense': return ArrowUpRight;
      default: return ArrowRight;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'income': return 'text-success';
      case 'expense': return 'text-destructive';
      default: return 'text-blue-500';
    }
  };

  return (
    <div>
      <PageHeader title="Transactions" description="View and manage your transactions">
        <Button onClick={() => router.push('/dashboard/transactions/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Transaction
        </Button>
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="flex flex-wrap gap-4 p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {new Date(p + '-01').toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts?.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : transactions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No transactions found for this period
                </TableCell>
              </TableRow>
            ) : (
              transactions?.map((transaction) => {
                const Icon = getIcon(transaction.category_type || 'expense');
                const color = getColor(transaction.category_type || 'expense');

                return (
                  <TableRow
                    key={transaction.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/dashboard/transactions/${transaction.id}`)}
                  >
                    <TableCell>{formatDate(transaction.transaction_date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <span>{transaction.description || transaction.category_name}</span>
                        {transaction.allowance_name && (
                          <Badge variant="outline" className="text-xs">{transaction.allowance_name}</Badge>
                        )}
                        {transaction.annual_budget_name && (
                          <Badge variant="secondary" className="text-xs">{transaction.annual_budget_name}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{transaction.category_name}</TableCell>
                    <TableCell>{transaction.account_name}</TableCell>
                    <TableCell className={`text-right font-medium ${color}`}>
                      {transaction.category_type === 'income' ? '+' : transaction.category_type === 'transfer' ? '' : '-'}
                      {formatCurrency(Math.abs(transaction.amount_base_eur))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
