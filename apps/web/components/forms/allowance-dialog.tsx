'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useCreateAllowance, useUpdateAllowance } from '@/hooks/use-allowances';
import { useToast } from '@/components/ui/use-toast';
import { AllowanceDefinition } from '@/lib/api';

const allowanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  monthly_limit: z.coerce.number().min(0, 'Monthly limit must be 0 or greater'),
});

type AllowanceFormValues = z.infer<typeof allowanceSchema>;

interface AllowanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowance?: AllowanceDefinition | null;
}

export function AllowanceDialog({ open, onOpenChange, allowance }: AllowanceDialogProps) {
  const { toast } = useToast();
  const createAllowance = useCreateAllowance();
  const updateAllowance = useUpdateAllowance();

  const form = useForm<AllowanceFormValues>({
    resolver: zodResolver(allowanceSchema),
    defaultValues: {
      name: '',
      monthly_limit: 150,
    },
  });

  useEffect(() => {
    if (allowance) {
      form.reset({
        name: allowance.name,
        monthly_limit: allowance.monthly_limit,
      });
    } else {
      form.reset({
        name: '',
        monthly_limit: 150,
      });
    }
  }, [allowance, form]);

  const onSubmit = async (data: AllowanceFormValues) => {
    try {
      if (allowance) {
        await updateAllowance.mutateAsync({
          id: allowance.id,
          data: {
            name: data.name,
            monthly_limit: data.monthly_limit,
          },
        });
        toast({ title: 'Allowance updated successfully' });
      } else {
        await createAllowance.mutateAsync(data);
        toast({ title: 'Allowance created successfully' });
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{allowance ? 'Edit Allowance' : 'Add Allowance'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Dad's Fun Money" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="monthly_limit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly Limit (EUR)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createAllowance.isPending || updateAllowance.isPending}>
                {allowance ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
