import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
  CakeSlice,
  LogOut,
  Home,
  Package,
  Users,
  Wallet,
  ChartNoAxesCombined,
  ArrowUpRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { getSupabase } from "@/lib/supabase";

export function AccountHome({ children }: { children?: ReactNode }) {
  const { session, signOut, error } = useAuth();
  const location = useLocation();
  const account = useQuery({
    queryKey: ["account", session?.user.id],
    enabled: Boolean(session),
    retry: false,
    staleTime: Infinity,
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
  const links = (
    <>
      <Link to="/" className={location.pathname === "/" ? "active" : ""}>
        <Home size={21} />
        <span>Início</span>
      </Link>
      <Link
        to="/produtos"
        className={["/produtos", "/receitas"].includes(location.pathname) ? "active" : ""}
      >
        <Package size={21} />
        <span>Produtos</span>
      </Link>
      <button disabled title="Em breve">
        <Users size={21} />
        <span>Clientes</span>
      </button>
      <button disabled title="Em breve">
        <Wallet size={21} />
        <span>Caixa</span>
      </button>
      <button disabled title="Em breve">
        <ChartNoAxesCombined size={21} />
        <span>Resumo</span>
      </button>
    </>
  );
  return (
    <main className="workspace">
      <aside className="workspace-sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <CakeSlice size={26} />
          </span>
          <span>
            Respiro Doce<small>PRECIFICADOR E CAIXA</small>
          </span>
        </a>
        <nav aria-label="Menu principal">{links}</nav>
        <div className="sidebar-bottom">
          <span>{session?.user.email}</span>
          <button
            className="secondary-button"
            onClick={() => {
              void signOut();
            }}
          >
            <LogOut size={17} /> Sair da conta
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="mobile-app-header">
          <a className="brand" href="/">
            <span className="brand-mark">
              <CakeSlice size={23} />
            </span>
            <span>
              Respiro Doce<small>PRECIFICADOR E CAIXA</small>
            </span>
          </a>
          <button
            className="icon-button"
            aria-label="Sair da conta"
            onClick={() => {
              void signOut();
            }}
          >
            <LogOut size={20} />
          </button>
        </header>
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        {account.isPending ? (
          <p className="loading-screen" role="status">
            Preparando sua área…
          </p>
        ) : account.isError ? (
          <section className="empty-state">
            <h1>Não foi possível preparar sua área</h1>
            <p role="alert">{account.error.message}</p>
            <button
              className="secondary-button"
              onClick={() => {
                void account.refetch();
              }}
            >
              Tentar novamente
            </button>
          </section>
        ) : (
          (children ?? (
            <section className="home-overview">
              <span className="eyebrow">CADA RECEITA COMEÇA AQUI</span>
              <h1>
                Seu próximo passo:
                <br />
                <span>descobrir o preço de cada doce.</span>
              </h1>
              <p>
                Cadastre os ingredientes e as embalagens, monte suas receitas e acompanhe o custo de
                cada unidade.
              </p>
              <Link to="/receitas" className="primary-button compact-button">
                Montar receitas <ArrowUpRight size={19} />
              </Link>
              <div className="home-tip">
                <Package size={26} />
                <div>
                  <strong>Uma base bem preenchida faz diferença.</strong>
                  <p>
                    Informe quantidade e preço da embalagem. O custo por grama, mL ou unidade é
                    calculado para você.
                  </p>
                </div>
              </div>
            </section>
          ))
        )}
      </div>
      <nav className="mobile-bottom-nav" aria-label="Menu principal no celular">
        {links}
      </nav>
    </main>
  );
}
