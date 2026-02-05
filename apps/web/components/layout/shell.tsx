import { Sidebar } from './sidebar';
import { Header } from './header';

interface ShellProps {
  children: React.ReactNode;
  user?: {
    email?: string;
    displayName?: string;
  };
}

export function Shell({ children, user }: ShellProps) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
