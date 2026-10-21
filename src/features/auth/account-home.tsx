import { useQuery } from "@tanstack/react-query";
import { CakeSlice, LogOut, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useAuth } from "./auth-provider";
import { getSupabase } from "@/lib/supabase";

export function AccountHome() {
  const { session, signOut, error } = useAuth();
  const account = useQuery({
    queryKey: ["account", session?.user.id],
    enabled: Boolean(session),
    retry: false,
    queryFn: async () => {
      const client = getSupabase();
      if (!client) throw new Error("Conexão indisponível.");
      const result = await client.rpc("initialize_account");
      if (result.error)
        throw new Error(
          "Não foi possível preparar sua área. Confira sua conexão e tente novamente.",
        );
      return true;
    },
  });

  return (
    <main className="account-layout">
      <header className="account-header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <CakeSlice size={26} />
          </span>
          <span>
            Respiro Doce<small>PRECIFICADOR E CAIXA</small>
          </span>
        </a>
        <button
          className="secondary-button"
          onClick={() => {
            void signOut();
          }}
        >
          <LogOut size={18} /> Sair
        </button>
      </header>
      <section className="welcome-card">
        <span className="eyebrow">SEU ESPAÇO DE TRABALHO</span>
        <h1>
          Bem-vindo à<br />
          Respiro Doce.
        </h1>
        <p className="account-email">{session?.user.email}</p>
        {account.isPending ? (
          <p role="status">Preparando sua área…</p>
        ) : account.isError ? (
          <>
            <p className="notice danger" role="alert">
              {account.error.message}
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                void account.refetch();
              }}
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <>
            <div className="ready-badge">
              <CheckCircle2 size={20} /> Sua conta está pronta.
            </div>
            <p>
              Em breve, você poderá cadastrar seus produtos e acompanhar vendas, clientes e caixa
              por aqui.
            </p>
          </>
        )}
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        <div className="privacy-note">
          <ShieldCheck size={18} />
          <span>Esta área pertence à sua conta.</span>
        </div>
      </section>
    </main>
  );
}
