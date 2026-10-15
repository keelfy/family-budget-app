import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { familyApi } from '@/lib/api';

export function useFamilyMembers() {
  return useQuery({
    queryKey: ['family-members'],
    queryFn: familyApi.members,
  });
}

export function useCreateFamilyInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: familyApi.createInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
    },
  });
}
