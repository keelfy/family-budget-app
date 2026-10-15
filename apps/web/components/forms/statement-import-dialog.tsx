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
import { useAllowances } from '@/hooks/use-allowances';
import { useCategories } from '@/hooks/use-categories';
import { useCreateTransaction, useStatementImportPreview } from '@/hooks/use-transactions';
import { readStatementPdf, type StatementRow } from '@/lib/bank-statement';
import { formatCurrency, formatDate } from '@/lib/utils';

const NO_ALLOWANCE = 'none';

interface ImportRow extends StatementRow {
  categoryId: string | null;
  allowanceId: string | null;
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
  const { data: allowances } = useAllowances();
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
  const activeAllowances = allowances?.filter((a) => a.is_active) ?? [];

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
          allowanceId: null,
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
          allowance_id: row.type === 'expense' ? row.allowanceId : null,
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import bank statement</DialogTitle>
          <DialogDescription>
            PDF of the Raiffeisen online-banking &quot;Transactions by file&quot; list. Debit rows are
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
          {rows.length > 0 && activeAllowances.length > 0 && (
            <Select
              value=""
              onValueChange={(id) =>
                setRows((current) =>
                  current.map((r) =>
                    r.type === 'expense' ? { ...r, allowanceId: id === NO_ALLOWANCE ? null : id } : r
                  )
                )
              }
            >
              <SelectTrigger className="w-60">
                <SelectValue placeholder="Allowance for all expenses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ALLOWANCE}>No allowance</SelectItem>
                {activeAllowances.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {rows.length > 0 && (
          <>
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-56">Category</TableHead>
                  {activeAllowances.length > 0 && (
                    <TableHead className="w-48">Allowance</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow
                    key={i}
                    className={
                      row.duplicate
                        ? 'bg-yellow-100/70 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30'
                        : !row.selected
                          ? 'opacity-60'
                          : !row.categoryId
                            ? 'bg-red-50 hover:bg-red-100/70 dark:bg-red-900/10 dark:hover:bg-red-900/20'
                            : ''
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
                        <SelectTrigger
                          className={
                            row.categoryId ? '' : 'border-red-500 ring-1 ring-red-500/40 text-red-600'
                          }
                        >
                          <SelectValue placeholder="Select category" />
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
                    {activeAllowances.length > 0 && (
                      <TableCell>
                        {row.type === 'expense' ? (
                          <Select
                            value={row.allowanceId ?? NO_ALLOWANCE}
                            onValueChange={(id) =>
                              update(i, { allowanceId: id === NO_ALLOWANCE ? null : id })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_ALLOWANCE}>None</SelectItem>
                              {activeAllowances.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {missingCategory > 0
                  ? `${missingCategory} selected without a category (red)`
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
