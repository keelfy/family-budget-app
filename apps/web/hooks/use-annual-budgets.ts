import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { annualBudgetsApi, CreateAnnualBudgetInput, UpdateAnnualBudgetInput } from '@/lib/api';

export function useAnnualBudgets(params?: { year?: string }) {
  return useQuery({
    queryKey: ['annual-budgets', params],
    queryFn: () => annualBudgetsApi.list(params),
  });
}

export function useCreateAnnualBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAnnualBudgetInput) => annualBudgetsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annual-budgets'] });
    },
  });
}

export function useUpdateAnnualBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAnnualBudgetInput }) =>
      annualBudgetsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annual-budgets'] });
    },
  });
}

export function useDeleteAnnualBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => annualBudgetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annual-budgets'] });
    },
  });
}
