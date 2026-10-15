import { loadPdfjs } from './qr';

/**
 * Read the card transactions list of a Raiffeisen Serbia online-banking export.
 * The export is the web page printed to PDF: one row per operation with a value
 * date, a single unsigned amount and the merchant text. Direction and currency
 * are not in the file, so they are left to the caller (export debit and credit
 * separately).
 */
export interface StatementRow {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  description: string;
}

const DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const AMOUNT = /^\d{1,3}(,\d{3})*\.\d{2}$/;

/** Rows of text items (left to right) -> statement rows; other lines are skipped. */
export function parseStatementLines(lines: string[][]): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const [dateText, amountText, ...rest] of lines) {
    const date = dateText?.match(DATE);
    if (!date || !AMOUNT.test(amountText ?? '') || rest.length === 0) continue;
    rows.push({
      date: `${date[3]}-${date[2]}-${date[1]}`,
      amount: Number(amountText.replace(/,/g, '')),
      description: rest.join(' ').replace(/\s+/g, ' ').trim(),
    });
  }
  return rows;
}

export async function readStatementPdf(file: File): Promise<StatementRow[]> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const lines: string[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      // Items of one table row share a baseline; group by it, then read left to right.
      const byBaseline = new Map<number, { x: number; text: string }[]>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const line = byBaseline.get(y) ?? [];
        line.push({ x: item.transform[4], text: item.str.trim() });
        byBaseline.set(y, line);
      }
      [...byBaseline.entries()]
        .sort(([a], [b]) => b - a)
        .forEach(([, line]) => lines.push(line.sort((a, b) => a.x - b.x).map((i) => i.text)));
    }
    return parseStatementLines(lines);
  } finally {
    await pdf.destroy();
  }
}
