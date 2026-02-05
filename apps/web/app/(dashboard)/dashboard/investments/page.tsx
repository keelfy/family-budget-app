'use client';

import { useState } from 'react';
import { Plus, TrendingUp, TrendingDown, RefreshCw, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInvestments, useRefreshPrices } from '@/hooks/use-investments';
import { formatCurrency } from '@/lib/utils';
import { InvestmentDialog } from '@/components/forms/investment-dialog';
import { useToast } from '@/components/ui/use-toast';

const assetTypeLabels: Record<string, string> = {
  etf: 'ETF',
  stock: 'Stock',
  crypto: 'Crypto',
  bond: 'Bond',
};

export default function InvestmentsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: investments, isLoading } = useInvestments();
  const refreshPrices = useRefreshPrices();

  const handleRefreshPrices = async () => {
    try {
      await refreshPrices.mutateAsync();
      toast({ title: 'Prices refreshed' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to refresh prices',
        description: error.message,
      });
    }
  };

  const totalValue = investments?.reduce((sum, inv) => sum + (inv.current_value_eur || 0), 0) || 0;
  const totalCostBasis = investments?.reduce((sum, inv) => sum + inv.cost_basis, 0) || 0;
  const totalGainLoss = totalValue - totalCostBasis;
  const gainLossPercentage = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  return (
    <div>
      <PageHeader title="Investments" description="Track your investment portfolio">
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefreshPrices} disabled={refreshPrices.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshPrices.isPending ? 'animate-spin' : ''}`} />
            Refresh Prices
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Investment
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Basis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCostBasis)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unrealized P&L</CardTitle>
            {totalGainLoss >= 0 ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Return</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${gainLossPercentage >= 0 ? 'text-success' : 'text-destructive'}`}>
              {gainLossPercentage >= 0 ? '+' : ''}{gainLossPercentage.toFixed(2)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(8)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : investments?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No investments yet. Add your first investment to start tracking.
                </TableCell>
              </TableRow>
            ) : (
              investments?.map((investment) => {
                const gainLoss = investment.unrealized_gain_loss || 0;
                const gainLossPct = investment.cost_basis > 0
                  ? (gainLoss / investment.cost_basis) * 100
                  : 0;

                return (
                  <TableRow key={investment.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{investment.asset_name}</p>
                        {investment.ticker && (
                          <p className="text-xs text-muted-foreground">{investment.ticker}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{assetTypeLabels[investment.asset_type]}</Badge>
                    </TableCell>
                    <TableCell>{investment.account_name}</TableCell>
                    <TableCell className="text-right">{investment.quantity.toFixed(4)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(investment.average_cost_per_unit)}
                    </TableCell>
                    <TableCell className="text-right">
                      {investment.current_price
                        ? formatCurrency(investment.current_price, investment.current_price_currency)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {investment.current_value_eur
                        ? formatCurrency(investment.current_value_eur)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {investment.unrealized_gain_loss !== null ? (
                        <div className={gainLoss >= 0 ? 'text-success' : 'text-destructive'}>
                          <p>{gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)}</p>
                          <p className="text-xs">
                            ({gainLossPct >= 0 ? '+' : ''}{gainLossPct.toFixed(2)}%)
                          </p>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <InvestmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
