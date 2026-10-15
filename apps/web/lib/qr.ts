/**
 * Read a QR code from a photo. jsQR is loaded on demand: it is only needed once
 * the user actually picks an image.
 */
const MAX_SIDES = [1600, 1000, 2400];

export async function decodeQrFromImage(file: File): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
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
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) return code.data;
    }
    return null;
  } finally {
    bitmap.close();
  }
}
