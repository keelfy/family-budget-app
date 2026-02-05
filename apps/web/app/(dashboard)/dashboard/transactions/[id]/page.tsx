'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { TransactionForm } from '@/components/forms/transaction-form';
import { useTransaction, useDeleteTransaction } from '@/hooks/use-transactions';
import { useToast } from '@/components/ui/use-toast';

export default function TransactionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const id = params.id as string;

  const { data: transaction, isLoading, error } = useTransaction(id);
  const deleteTransaction = useDeleteTransaction();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteTransaction.mutateAsync(id);
      toast({ title: 'Transaction deleted successfully' });
      router.push('/dashboard/transactions');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Edit Transaction" description="Loading..." />
        <Card className="max-w-2xl">
          <CardContent className="p-6 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div>
        <PageHeader title="Transaction Not Found" description="The requested transaction could not be found" />
        <Card className="max-w-2xl">
          <CardContent className="p-6">
            <p className="text-muted-foreground mb-4">
              This transaction may have been deleted or you may not have permission to view it.
            </p>
            <Button onClick={() => router.push('/dashboard/transactions')}>
              Back to Transactions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Edit Transaction" description="Update transaction details">
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this transaction? This action cannot be undone
                and will affect your account balance and budget calculations.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteTransaction.isPending ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageHeader>

      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <TransactionForm
            transaction={transaction}
            onSuccess={() => router.push('/dashboard/transactions')}
            onCancel={() => router.back()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
