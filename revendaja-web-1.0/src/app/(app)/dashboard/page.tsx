import { StorefrontCard } from '@/components/dashboard/overview/StorefrontCard';
import { BalanceCard } from '@/components/dashboard/overview/BalanceCard';
import { PlanLimitCard } from '@/components/dashboard/overview/PlanLimitCard';
import { TopBrandsCard } from '@/components/dashboard/overview/TopBrandsCard';
import { GoalCard } from '@/components/dashboard/overview/GoalCard';
import { OverLimitBanner } from '@/components/billing/OverLimitBanner';

// Todos os cartões usam dados reais da API. Os cartões antigos (RevenueCard, GoalCard, AlertsList)
// continuam em components/dashboard, sem uso por enquanto.
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <OverLimitBanner />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <StorefrontCard />
        </div>
        <div className="lg:col-span-8">
          <BalanceCard />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <PlanLimitCard />
        </div>
        <div className="lg:col-span-3">
          <TopBrandsCard />
        </div>
        <div className="lg:col-span-4">
          <GoalCard />
        </div>
      </div>
    </div>
  );
}
