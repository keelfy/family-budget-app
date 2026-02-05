import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { allowancesApi, CreateAllowanceInput, UpdateAllowanceInput } from '@/lib/api';

export function useAllowances() {
  return useQuery({
    queryKey: ['allowances'],
    queryFn: allowancesApi.list,
  });
}

export function useCreateAllowance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAllowanceInput) => allowancesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowances'] });
      queryClient.invalidateQueries({ queryKey: ['allowance-balances'] });
    },
  });
}

export function useUpdateAllowance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAllowanceInput }) =>
      allowancesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowances'] });
      queryClient.invalidateQueries({ queryKey: ['allowance-balances'] });
    },
  });
}

export function useDeleteAllowance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => allowancesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowances'] });
      queryClient.invalidateQueries({ queryKey: ['allowance-balances'] });
    },
  });
}

export function useAllowanceBalances(params?: { period?: string }) {
  return useQuery({
    queryKey: ['allowance-balances', params],
    queryFn: () => allowancesApi.balances(params),
  });
}

export function useRecalculateAllowanceBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (balanceId: string) => allowancesApi.recalculate(balanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowance-balances'] });
    },
  });
}

export function useAllowanceRollover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => allowancesApi.rollover(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowances'] });
      queryClient.invalidateQueries({ queryKey: ['allowance-balances'] });
    },
  });
}
