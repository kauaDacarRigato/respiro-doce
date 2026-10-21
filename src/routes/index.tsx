import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/auth-provider";
import { AccessScreen } from "@/features/auth/access-screen";
import { AccountHome } from "@/features/auth/account-home";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  const { loading, session, recovery } = useAuth();
  if (loading)
    return (
      <main className="loading-screen" role="status">
        Preparando seu acesso…
      </main>
    );
  if (!session || recovery) return <AccessScreen />;
  return <AccountHome />;
}
