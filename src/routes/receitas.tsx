import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/auth-provider";
import { AccessScreen } from "@/features/auth/access-screen";
import { AccountHome } from "@/features/auth/account-home";
import { RecipesPage } from "@/features/products/recipes-page";

export const Route = createFileRoute("/receitas")({ component: RecipesRoute });
function RecipesRoute() {
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
      <RecipesPage />
    </AccountHome>
  );
}
