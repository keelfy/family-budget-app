import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  trackedItemsApi,
  CreateTrackedItemInput,
  UpdateTrackedItemInput,
  TrackedKind,
} from '@/lib/api';

export function useTrackedItems(params?: { kind?: TrackedKind; period?: string }) {
  return useQuery({
    queryKey: ['tracked-items', params],
    queryFn: () => trackedItemsApi.list(params),
  });
}

export function useCreateTrackedItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTrackedItemInput) => trackedItemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracked-items'] });
    },
  });
}

export function useUpdateTrackedItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTrackedItemInput }) =>
      trackedItemsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracked-items'] });
    },
  });
}

export function useDeleteTrackedItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trackedItemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracked-items'] });
    },
  });
}
