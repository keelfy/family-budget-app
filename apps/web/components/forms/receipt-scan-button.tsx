'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useParseReceipt } from '@/hooks/use-receipts';
import { decodeQrFromFile, isPdf } from '@/lib/qr';
import type { ReceiptPreview } from '@/lib/api';

const SUF_URL = /^https:\/\/suf\.purs\.gov\.rs\/\S+$/;

/**
 * Read a Serbian fiscal receipt from a photo or PDF of its QR code, picked from disk
 * or pasted from the clipboard (an image, a PDF file, or the receipt link itself).
 */
export function ReceiptScanButton({ onParsed }: { onParsed: (receipt: ReceiptPreview) => void }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const parseReceipt = useParseReceipt();
  const busy = reading || parseReceipt.isPending;

  const fail = (description: string) =>
    toast({ variant: 'destructive', title: 'Could not read receipt', description });

  const handleSource = async (readUrl: () => Promise<string | null>) => {
    setReading(true);
    try {
      const url = await readUrl();
      if (!url) {
        fail('No QR code found. Make sure the whole code is visible and in focus.');
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

  const handleFile = (file: File) => handleSource(() => decodeQrFromFile(file));

  // The handler is re-bound every render so it always sees the current busy flag.
  const onPaste = (event: ClipboardEvent) => {
    if (busy || !event.clipboardData) return;
    const file = Array.from(event.clipboardData.files).find(
      (f) => f.type.startsWith('image/') || isPdf(f)
    );
    if (file) {
      event.preventDefault();
      void handleFile(file);
      return;
    }
    const text = event.clipboardData.getData('text/plain').trim();
    if (SUF_URL.test(text)) {
      event.preventDefault();
      void handleSource(async () => text);
    }
  };
  const pasteRef = useRef(onPaste);
  pasteRef.current = onPaste;

  useEffect(() => {
    const listener = (event: ClipboardEvent) => pasteRef.current(event);
    document.addEventListener('paste', listener);
    return () => document.removeEventListener('paste', listener);
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
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
      <p className="text-center text-xs text-muted-foreground">
        Photo or PDF — or paste it with Ctrl+V
      </p>
    </>
  );
}
