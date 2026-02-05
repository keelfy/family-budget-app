'use client';

import { useState } from 'react';
import { Plus, MoreVertical, Wallet, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccounts, useDeleteAccount } from '@/hooks/use-accounts';
import { formatCurrency } from '@/lib/utils';
import { AccountDialog } from '@/components/forms/account-dialog';
import { useToast } from '@/components/ui/use-toast';

const accountTypeColors: Record<string, string> = {
  checking: 'bg-blue-500',
  savings: 'bg-green-500',
  investment: 'bg-purple-500',
  credit: 'bg-red-500',
  cash: 'bg-yellow-500',
};

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts();
  const deleteAccount = useDeleteAccount();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);

  const handleDelete = async (id: string) => {
    try {
      await deleteAccount.mutateAsync(id);
      toast({ title: 'Account deleted successfully' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete account',
        description: error.message,
      });
    }
  };

  const totalBalance = accounts?.reduce(
    (sum, acc) => sum + (acc.current_balance_eur || 0),
    0
  ) || 0;

  return (
    <div>
      <PageHeader title="Accounts" description="Manage your financial accounts">
        <Button onClick={() => { setEditingAccount(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <p className="text-sm text-muted-foreground">Total Balance</p>
            <p className="text-3xl font-bold">{formatCurrency(totalBalance)}</p>
          </div>
          <Wallet className="h-12 w-12 text-muted-foreground" />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts?.map((account) => (
            <Card key={account.id} className={!account.is_active ? 'opacity-50' : ''}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full ${accountTypeColors[account.type]} flex items-center justify-center`}
                    >
                      <Wallet className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{account.name}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {account.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {account.currency_code}
                        </span>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingAccount(account); setDialogOpen(true); }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(account.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold">
                    {formatCurrency(account.current_balance, account.currency_code)}
                  </p>
                  {account.currency_code !== 'EUR' && account.current_balance_eur && (
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(account.current_balance_eur)} EUR
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editingAccount}
      />
    </div>
  );
}
