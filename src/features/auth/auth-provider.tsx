import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { setRequestOwner } from "@/lib/account-requests";
import { clearDrafts, clearOtherDrafts } from "@/lib/drafts";

type AuthState = {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  recovery: boolean;
  error: string;
  finishRecovery: () => void;
  signOut: () => Promise<boolean>;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const previousOwner = useRef<string | null>(null);
  const activeOwner = useRef<string | null>(null);

  useEffect(() => {
    const client = getSupabase();
    setConfigured(Boolean(client));
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    let signedIn = false;
    const subscription = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      const owner = next?.user.id ?? null;
      signedIn = Boolean(owner);
      activeOwner.current = owner;
      setRequestOwner(owner);
      if (owner) clearOtherDrafts(owner);
      if (previousOwner.current !== owner) {
        void queryClient.cancelQueries();
        queryClient.clear();
        if (previousOwner.current && owner) clearDrafts();
      }
      // Manter identidade anterior durante expiração para reconhecer troca de conta.
      if (owner) previousOwner.current = owner;
      setSession(next);
      if (owner) setError("");
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        try {
          sessionStorage.setItem("respiro-doce:recovery", owner ?? "");
        } catch {
          /* Opcional. */
        }
      } else if (owner) {
        try {
          setRecovery(sessionStorage.getItem("respiro-doce:recovery") === owner);
        } catch {
          /* Opcional. */
        }
      }
      if (!next) setRecovery(false);
      setLoading(false);
    });
    // getSession processa o callback PKCE; a segurança dos dados é garantida pelo banco.
    void client.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError && !signedIn) {
          setError(
            "Não foi possível recuperar seu acesso. Entre novamente ou solicite outro link.",
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (active && !signedIn) {
          setError("Confira sua conexão e tente entrar novamente.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
      setRequestOwner(null);
      subscription.data.subscription.unsubscribe();
    };
  }, [queryClient]);

  async function signOut() {
    try {
      const result = await getSupabase()?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
    } catch {
      // Current supabase-js can remove the local session and emit SIGNED_OUT
      // even when server revocation fails. Complete local cleanup in that case.
      if (activeOwner.current) {
        setError("Não foi possível sair. Tente novamente.");
        return false;
      }
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    clearDrafts();
    try {
      sessionStorage.removeItem("respiro-doce:recovery");
    } catch {
      /* Opcional. */
    }
    previousOwner.current = null;
    activeOwner.current = null;
    setError("");
    setSession(null);
    return true;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        configured,
        recovery,
        error,
        finishRecovery: () => {
          try {
            sessionStorage.removeItem("respiro-doce:recovery");
          } catch {
            /* Opcional. */
          }
          setRecovery(false);
        },
        signOut,
      }}
    >
      <Fragment key={session?.user.id ?? "anonymous"}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("Autenticação indisponível.");
  return state;
}
