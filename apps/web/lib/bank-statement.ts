import { loadPdfjs } from './qr';

/**
 * Read the "Transactions by file" PDF of Raiffeisen Serbia online banking
 * (Value date | Processing date | Debit | Credit | [Balance] | Description).
 * Amounts are unsigned and right-aligned in their column, so the column an
 * amount sits in decides expense vs income. A merchant text can wrap onto the
 * lines above and below its row.
 */
export interface StatementRow {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  /** Debit column -> expense, credit column -> income. */
  type: 'expense' | 'income';
  /** Currency printed in the file (per row or in the header); null if absent. */
  currency: string | null;
  description: string;
}

export interface Cell {
  x: number;
  right: number;
  text: string;
}

export interface Line {
  y: number;
  cells: Cell[];
}

const DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const AMOUNT = /^\d{1,3}(,\d{3})*\.\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
// Text inside the description column may start slightly left of its header.
const COLUMN_SLACK = 5;
// Description fragments belong to the data row within this vertical distance.
const WRAP_DISTANCE = 12;

/** Pages of positioned lines (top to bottom) -> statement rows; other lines are skipped. */
export function parseStatement(pages: Line[][]): StatementRow[] {
  const rows: StatementRow[] = [];
  let creditX: number | null = null;
  let descX: number | null = null;
  let headerCurrency: string | null = null;

  for (const lines of pages) {
    const pageRows: { y: number; row: StatementRow; pieces: { y: number; text: string }[] }[] = [];
    const fragments: { y: number; text: string }[] = [];

    for (const { y, cells } of lines) {
      const credit = cells.find((c) => c.text === 'Credit');
      const desc = cells.find((c) => c.text === 'Description');
      if (credit && desc) {
        creditX = credit.x;
        descX = desc.x;
        continue;
      }
      const currencyAt = cells.findIndex((c) => c.text === 'CURRENCY:');
      if (currencyAt >= 0) {
        headerCurrency = cells[currencyAt + 1]?.text ?? null;
        continue;
      }
      if (creditX === null || descX === null) continue;
      const descStart = descX - COLUMN_SLACK;
      const text = cells
        .filter((c) => c.x >= descStart)
        .map((c) => c.text)
        .join(' ');

      const date = cells[0]?.text.match(DATE);
      if (!date) {
        if (text && cells.every((c) => c.x >= descStart)) fragments.push({ y, text });
        continue;
      }

      // Debit amounts end before the Credit header, credit amounts before the
      // balance column halfway to the description column.
      const balanceStart = (creditX + descX) / 2;
      const amounts = cells.filter((c) => c.x < descStart && AMOUNT.test(c.text));
      const debit = amounts.find((c) => c.right < creditX!);
      const credited = amounts.find((c) => c.right >= creditX! && c.right < balanceStart);
      const amount = debit ?? credited;
      if (!amount) continue;
      const currency = cells.slice(1).find((c) => c.x < descStart && CURRENCY.test(c.text));

      pageRows.push({
        y,
        pieces: text ? [{ y, text }] : [],
        row: {
          date: `${date[3]}-${date[2]}-${date[1]}`,
          amount: Number(amount.text.replace(/,/g, '')),
          type: debit ? 'expense' : 'income',
          currency: currency?.text ?? headerCurrency,
          description: '',
        },
      });
    }

    for (const fragment of fragments) {
      const nearest = pageRows.reduce<(typeof pageRows)[number] | null>(
        (best, r) =>
          Math.abs(r.y - fragment.y) < Math.abs((best?.y ?? Infinity) - fragment.y) ? r : best,
        null
      );
      if (nearest && Math.abs(nearest.y - fragment.y) <= WRAP_DISTANCE) nearest.pieces.push(fragment);
    }

    for (const { row, pieces } of pageRows) {
      row.description =
        pieces
          .sort((a, b) => b.y - a.y)
          .map((p) => p.text)
          .join(' ')
          // Card authorisation number, e.g. "( 461608 )".
          .replace(/\(\s*\d+\s*\)/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200) || 'Bank transaction';
      rows.push(row);
    }
  }
  return rows;
}

export async function readStatementPdf(file: File): Promise<StatementRow[]> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const pages: Line[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      // Items of one table row share a baseline; group by it, then read left to right.
      const byBaseline = new Map<number, Cell[]>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const cells = byBaseline.get(y) ?? [];
        cells.push({
          x: item.transform[4],
          right: item.transform[4] + item.width,
          text: item.str.trim(),
        });
        byBaseline.set(y, cells);
      }
      pages.push(
        [...byBaseline.entries()]
          .sort(([a], [b]) => b - a)
          .map(([y, cells]) => ({ y, cells: cells.sort((a, b) => a.x - b.x) }))
      );
    }
    return parseStatement(pages);
  } finally {
    await pdf.destroy();
  }
}
