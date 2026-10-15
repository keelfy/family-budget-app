'use client';

import { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useToast } from '@/components/ui/use-toast';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { useCreateTransaction, useStatementImportPreview } from '@/hooks/use-transactions';
import { readStatementPdf, type StatementRow } from '@/lib/bank-statement';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ImportRow extends StatementRow {
  categoryId: string | null;
  duplicate: boolean;
  selected: boolean;
}

/**
 * Import card transactions from a Raiffeisen Serbia online-banking PDF: pick the
 * account, review the suggested categories, import what is ticked.
 */
export function StatementImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const preview = useStatementImportPreview();
  const createTransaction = useCreateTransaction();

  const [accountId, setAccountId] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  const account = accounts?.find((a) => a.id === accountId);
  const chosen = rows.filter((r) => r.selected);
  const missingCategory = chosen.filter((r) => !r.categoryId).length;
  const duplicates = rows.filter((r) => r.duplicate).length;

  const close = () => {
    setRows([]);
    onOpenChange(false);
  };

  const update = (index: number, patch: Partial<ImportRow>) =>
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      const parsed = await readStatementPdf(file);
      if (parsed.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No transactions found',
          description: 'Use the PDF printed from the transactions list in online banking.',
        });
        return;
      }
      const foreign = parsed.find((r) => r.currency && r.currency !== account?.currency_code);
      if (foreign) {
        toast({
          variant: 'destructive',
          title: 'Currency mismatch',
          description: `The statement is in ${foreign.currency}, the account is in ${account?.currency_code}.`,
        });
        return;
      }
      const suggestions = await preview.mutateAsync({
        account_id: accountId,
        rows: parsed.map((r) => ({
          transaction_date: r.date,
          amount: r.amount,
          type: r.type,
          description: r.description,
        })),
      });
      setRows(
        parsed.map((row, i) => ({
          ...row,
          categoryId: suggestions[i].category_id,
          duplicate: suggestions[i].duplicate,
          selected: !suggestions[i].duplicate,
        }))
      );
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not read statement',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setReading(false);
    }
  };

  const handleImport = async () => {
    if (!account) return;
    setImporting(true);
    const failed: ImportRow[] = [];
    let created = 0;
    for (const row of rows) {
      if (!row.selected) {
        failed.push(row);
        continue;
      }
      try {
        await createTransaction.mutateAsync({
          account_id: account.id,
          category_id: row.categoryId as string,
          amount_original: row.amount,
          currency_original: account.currency_code,
          transaction_date: row.date,
          merchant: row.description.slice(0, 200),
        });
        created += 1;
      } catch {
        failed.push(row);
      }
    }
    setImporting(false);
    const errors = failed.filter((r) => r.selected).length;
    toast({
      variant: errors ? 'destructive' : undefined,
      title: `Imported ${created} transaction${created === 1 ? '' : 's'}`,
      description: errors ? `${errors} could not be saved and are still listed.` : undefined,
    });
    if (errors === 0) {
      close();
    } else {
      setRows(failed);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import bank statement</DialogTitle>
          <DialogDescription>
            PDF of the Raiffeisen online-banking "Transactions by file" list. Debit rows are
            imported as expenses, credit rows as income; the statement currency must match the
            account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={accountId}
            onValueChange={(id) => {
              setAccountId(id);
              setRows([]);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              {accounts?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.currency_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleFile(file);
            }}
          />
          <Button
            variant="outline"
            disabled={!accountId || reading || importing}
            onClick={() => inputRef.current?.click()}
          >
            {reading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            {reading ? 'Reading...' : 'Choose PDF'}
          </Button>
        </div>

        {rows.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-56">Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow
                    key={i}
                    className={
                      row.duplicate
                        ? 'bg-yellow-100/70 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30'
                        : row.selected
                          ? ''
                          : 'opacity-60'
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={row.selected}
                        onCheckedChange={(v) => update(i, { selected: v === true })}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                    <TableCell>
                      {row.description}
                      {row.duplicate && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-yellow-500 text-xs text-yellow-700 dark:text-yellow-400"
                        >
                          duplicate
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right ${row.type === 'income' ? 'text-green-600' : ''}`}
                    >
                      {row.type === 'income' ? '+' : ''}
                      {formatCurrency(row.amount, account?.currency_code)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.categoryId ?? ''}
                        onValueChange={(id) => update(i, { categoryId: id })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {(categories ?? [])
                            .filter((c) => c.type === row.type)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {missingCategory > 0
                  ? `${missingCategory} selected without a category`
                  : `${chosen.length} of ${rows.length} selected` +
                    (duplicates > 0 ? `, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} (yellow)` : '')}
              </span>
              <Button
                disabled={chosen.length === 0 || missingCategory > 0 || importing}
                onClick={() => void handleImport()}
              >
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {chosen.length}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
