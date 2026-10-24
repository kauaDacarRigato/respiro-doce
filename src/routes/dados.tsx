import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/auth-provider";
import { AccessScreen } from "@/features/auth/access-screen";
import { AccountHome } from "@/features/auth/account-home";
import { DataPage } from "@/features/data/data-page";

export const Route = createFileRoute("/dados")({ component: DataRoute });
function DataRoute() {
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
      <DataPage />
    </AccountHome>
  );
}
