import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/auth-provider";
import { AccessScreen } from "@/features/auth/access-screen";
import { AccountHome } from "@/features/auth/account-home";
import { ReportsPage } from "@/features/reports/reports-page";

export const Route = createFileRoute("/resumo")({ component: ReportsPageRoute });
function ReportsPageRoute() {
  const { loading, session, recovery } = useAuth();
  if (loading)
    return (
      <main className="loading-screen" role="status">
        Preparando seu acesso…
      </main>
    );
  if (!session || recovery) return <AccessScreen />;
  return (
    <AccountHome>
      <ReportsPage />
    </AccountHome>
  );
}
