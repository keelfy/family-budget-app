import { useMutation } from '@tanstack/react-query';
import { receiptsApi } from '@/lib/api';

export function useParseReceipt() {
  return useMutation({ mutationFn: (url: string) => receiptsApi.parse(url) });
}
