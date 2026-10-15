'use client';

import { PageHeader } from '@/components/layout/page-header';
import { useCurrentUser } from '@/hooks/use-auth';

export function WelcomeHeader() {
  const { data: user } = useCurrentUser();

  return (
    <PageHeader
      title="Dashboard"
      description={`Welcome back${user?.display_name ? `, ${user.display_name}` : ''}!`}
    />
  );
}
