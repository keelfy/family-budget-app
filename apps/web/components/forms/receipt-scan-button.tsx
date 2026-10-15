'use client';

import { useRef, useState } from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useParseReceipt } from '@/hooks/use-receipts';
import { decodeQrFromImage } from '@/lib/qr';
import type { ReceiptPreview } from '@/lib/api';

/** Pick a photo of a Serbian fiscal receipt's QR code and read the receipt from it. */
export function ReceiptScanButton({ onParsed }: { onParsed: (receipt: ReceiptPreview) => void }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const parseReceipt = useParseReceipt();
  const busy = reading || parseReceipt.isPending;

  const fail = (description: string) =>
    toast({ variant: 'destructive', title: 'Could not read receipt', description });

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      const url = await decodeQrFromImage(file);
      if (!url) {
        fail('No QR code found in the photo. Make sure the whole code is in focus.');
        return;
      }
      onParsed(await parseReceipt.mutateAsync(url));
      toast({ title: 'Receipt loaded', description: 'Check the items and categories below.' });
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setReading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ScanLine className="mr-2 h-4 w-4" />
        )}
        {busy ? 'Reading receipt...' : 'Scan fiscal receipt QR'}
      </Button>
    </>
  );
}
