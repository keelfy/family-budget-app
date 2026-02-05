import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetsApi, CreateBudgetInput, UpdateBudgetInput } from '@/lib/api';

export function useBudgets(params?: { period?: string }) {
  return useQuery({
    queryKey: ['budgets', params],
    queryFn: () => budgetsApi.list(params),
  });
}

export function useBudgetComparison(period: string) {
  return useQuery({
    queryKey: ['budgets', 'comparison', period],
    queryFn: () => budgetsApi.comparison(period),
    enabled: !!period,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBudgetInput) => budgetsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBudgetInput }) =>
      budgetsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useCopyBudgets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fromPeriod, toPeriod }: { fromPeriod: string; toPeriod: string }) =>
      budgetsApi.copy(fromPeriod, toPeriod),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}
