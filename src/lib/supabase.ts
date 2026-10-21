import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readAuthConfig } from "./auth-config";
import { publicAuthConfig } from "./public-config";

let browserClient: SupabaseClient | null = null;

// Nunca criar um cliente autenticado compartilhado entre requisições SSR.
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  // Se houver override, exigir o par completo. Nunca misturar chave e URL de projetos.
  const override =
    import.meta.env["VITE_SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  const config = readAuthConfig(override ? import.meta.env : publicAuthConfig);
  if (!config) return null;
  browserClient ??= createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return browserClient;
}
