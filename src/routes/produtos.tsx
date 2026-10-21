import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/auth-provider";
import { AccessScreen } from "@/features/auth/access-screen";
import { AccountHome } from "@/features/auth/account-home";
import { MaterialsPage } from "@/features/products/materials-page";

export const Route = createFileRoute("/produtos")({ component: ProductsRoute });
function ProductsRoute() {
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
      <MaterialsPage />
    </AccountHome>
  );
}
