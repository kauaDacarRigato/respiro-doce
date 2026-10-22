import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/auth-provider";
import { AccessScreen } from "@/features/auth/access-screen";
import { AccountHome } from "@/features/auth/account-home";
import { CashPage } from "@/features/cash/cash-page";

export const Route = createFileRoute("/caixa")({ component: CashPageRoute });
function CashPageRoute() {
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
      <CashPage />
    </AccountHome>
  );
}
