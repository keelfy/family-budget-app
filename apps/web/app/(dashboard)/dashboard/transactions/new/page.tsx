'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TransactionForm } from '@/components/forms/transaction-form';
import { TransferForm } from '@/components/forms/transfer-form';

export default function NewTransactionPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader title="Add Transaction" description="Record a new transaction or transfer" />

      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <Tabs defaultValue="transaction">
            <TabsList className="mb-4">
              <TabsTrigger value="transaction">Transaction</TabsTrigger>
              <TabsTrigger value="transfer">Transfer</TabsTrigger>
            </TabsList>
            <TabsContent value="transaction">
              <TransactionForm
                onSuccess={() => router.push('/dashboard/transactions')}
                onCancel={() => router.back()}
              />
            </TabsContent>
            <TabsContent value="transfer">
              <TransferForm
                onSuccess={() => router.push('/dashboard/transactions')}
                onCancel={() => router.back()}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
