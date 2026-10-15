import { Shell } from '@/components/layout/shell';

// Route protection happens in middleware.ts; the API rejects invalid credentials.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Shell>{children}</Shell>;
}
