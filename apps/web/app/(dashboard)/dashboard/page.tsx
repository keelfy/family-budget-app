import { WelcomeHeader } from '@/components/dashboard/welcome-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardStats } from '@/components/dashboard/dashboard-stats';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { BudgetOverview } from '@/components/dashboard/budget-overview';
import { AllowanceStatus } from '@/components/dashboard/allowance-status';

export default function DashboardPage() {
  return (
    <div>
      <WelcomeHeader />

      <DashboardStats />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentTransactions />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetOverview />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Family Allowances</CardTitle>
          </CardHeader>
          <CardContent>
            <AllowanceStatus />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
