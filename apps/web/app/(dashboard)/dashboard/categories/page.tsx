'use client';

import { useState } from 'react';
import { Plus, Tags, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCategories, useDeleteCategory } from '@/hooks/use-categories';
import { CategoryDialog } from '@/components/forms/category-dialog';
import { useToast } from '@/components/ui/use-toast';

const typeColors: Record<string, string> = {
  income: 'bg-success text-success-foreground',
  expense: 'bg-destructive text-destructive-foreground',
  transfer: 'bg-blue-500 text-white',
};

export default function CategoriesPage() {
  const { toast } = useToast();
  const { data: categories, isLoading } = useCategories();
  const deleteCategory = useDeleteCategory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('expense');

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory.mutateAsync(id);
      toast({ title: 'Category deleted successfully' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete category',
        description: error.message,
      });
    }
  };

  const filteredCategories = categories?.filter((c) => c.type === activeTab) || [];
  const systemCategories = filteredCategories.filter((c) => c.is_system);
  const customCategories = filteredCategories.filter((c) => !c.is_system);

  return (
    <div>
      <PageHeader title="Categories" description="Manage transaction categories">
        <Button onClick={() => { setEditingCategory(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="expense">Expenses</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="transfer">Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <>
              {customCategories.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-4">Custom Categories</h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {customCategories.map((category) => (
                      <Card key={category.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className="h-8 w-8 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: category.color || '#6b7280' }}
                              >
                                <Tags className="h-4 w-4 text-white" />
                              </div>
                              <div>
                                <p className="font-medium">{category.name}</p>
                                {category.is_allowance && (
                                  <Badge variant="outline" className="text-xs">Allowance</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setEditingCategory(category); setDialogOpen(true); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(category.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold mb-4">System Categories</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {systemCategories.map((category) => (
                    <Card key={category.id} className="opacity-75">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: category.color || '#6b7280' }}
                          >
                            <Tags className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="font-medium">{category.name}</p>
                            <p className="text-xs text-muted-foreground">System</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
        defaultType={activeTab as 'income' | 'expense' | 'transfer'}
      />
    </div>
  );
}
