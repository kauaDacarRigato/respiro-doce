export function readAuthConfig(env: Record<string, string | undefined>) {
  const url = env["VITE_SUPABASE_URL"];
  const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key || key.includes("SUBSTITUIR")) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) return null;
    if (!key.startsWith("sb_publishable_")) return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

export function authMessage(
  error: { code?: string | undefined; status?: number | undefined } | null,
): string {
  if (!error) return "Não foi possível concluir. Tente novamente.";
  if (error.code === "invalid_credentials") return "E-mail ou senha incorretos.";
  if (error.code === "email_not_confirmed") return "Confirme seu e-mail antes de entrar.";
  if (error.code === "over_request_rate_limit" || error.status === 429)
    return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
  if (error.code === "weak_password") return "Escolha uma senha mais forte.";
  if (error.code === "otp_expired")
    return "Este link expirou. Solicite outro e-mail de recuperação.";
  return "Não foi possível concluir. Confira sua conexão e tente novamente.";
}
