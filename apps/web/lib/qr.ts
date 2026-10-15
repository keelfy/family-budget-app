/**
 * Read a QR code from a photo or a PDF. jsQR and pdf.js are loaded on demand:
 * they are only needed once the user actually provides a file.
 */
const MAX_SIDES = [1600, 1000, 2400];
const PDF_MAX_PAGES = 5;
const PDF_TARGET_SIDE = 2000;

type JsQR = (typeof import('jsqr'))['default'];

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export async function decodeQrFromFile(file: File): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  return isPdf(file) ? decodeQrFromPdf(file, jsQR) : decodeQrFromImage(file, jsQR);
}

function scan(jsQR: JsQR, ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height);
  return jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

async function decodeQrFromImage(file: File, jsQR: JsQR): Promise<string | null> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    // Phone photos are large and the code is small: a few scales find it reliably.
    for (const maxSide of MAX_SIDES) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const found = scan(jsQR, ctx, canvas.width, canvas.height);
      if (found) return found;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** pdf.js with its worker configured; loaded on demand like jsQR. */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url
  ).toString();
  return pdfjs;
}

async function decodeQrFromPdf(file: File, jsQR: JsQR): Promise<string | null> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    const pages = Math.min(pdf.numPages, PDF_MAX_PAGES);
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: PDF_TARGET_SIDE / Math.max(base.width, base.height),
      });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      // Transparent areas would read as black; the code needs a white background.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const found = scan(jsQR, ctx, canvas.width, canvas.height);
      if (found) return found;
    }
    return null;
  } finally {
    await pdf.destroy();
  }
}
