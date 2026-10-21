import { useState, type FormEvent } from "react";
import { CakeSlice, ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "./auth-provider";
import { getSupabase } from "@/lib/supabase";
import { authMessage } from "@/lib/auth-config";

type Mode = "login" | "signup" | "reset";

export function AccessScreen() {
  const { configured, recovery, finishRecovery, error: sessionError } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const title = recovery
    ? "Defina sua nova senha"
    : mode === "signup"
      ? "Crie sua conta"
      : mode === "reset"
        ? "Recupere seu acesso"
        : "Seu negócio,\nsob controle.";

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmation("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const client = getSupabase();
    if (!client) return;
    setError("");
    setNotice("");
    if ((recovery || mode === "signup") && password !== confirmation) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    try {
      if (recovery) {
        const result = await client.auth.updateUser({ password });
        if (result.error) setError(authMessage(result.error));
        else {
          setPassword("");
          setConfirmation("");
          finishRecovery();
        }
      } else if (mode === "reset") {
        const result = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/`,
        });
        if (result.error) setError(authMessage(result.error));
        else
          setNotice(
            "Se houver uma conta com esse e-mail, você receberá as instruções de recuperação.",
          );
      } else if (mode === "signup") {
        const result = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (result.error) setError(authMessage(result.error));
        else if (!result.data.session) {
          setPassword("");
          setConfirmation("");
          setNotice(
            "Confira seu e-mail para confirmar o cadastro. Se já possui conta, tente entrar ou recuperar a senha.",
          );
        }
      } else {
        const result = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) setError(authMessage(result.error));
      }
    } catch {
      setError("Não foi possível conectar. Confira sua internet e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-layout">
      <section className="brand-panel" aria-label="Respiro Doce">
        <a className="brand" href="/">
          <span className="brand-mark">
            <CakeSlice size={26} />
          </span>
          <span>
            Respiro Doce<small>PRECIFICADOR E CAIXA</small>
          </span>
        </a>
        <div className="brand-copy">
          <span className="eyebrow">MAIS CLAREZA. MAIS TRANQUILIDADE.</span>
          <h1>
            Cuide dos doces.
            <br />
            <span>Enxergue os resultados.</span>
          </h1>
          <p>Preços bem calculados, vendas organizadas e seu caixa sempre por perto.</p>
          <div className="brand-pill">
            <ShieldCheck size={18} /> Um espaço só para os dados do seu negócio
          </div>
        </div>
        <span className="brand-footer">Feito para acompanhar o seu dia.</span>
      </section>
      <section className="access-panel" aria-labelledby="access-title">
        <div className="access-card">
          {!recovery && mode !== "login" && (
            <button
              type="button"
              className="back-button"
              disabled={busy}
              onClick={() => changeMode("login")}
            >
              <ArrowLeft size={18} /> Voltar para entrar
            </button>
          )}
          <span className="eyebrow">BEM-VINDO À RESPIRO DOCE</span>
          <h2 id="access-title">{title}</h2>
          <p className="access-description">
            {recovery
              ? "Escolha uma senha forte para proteger sua conta."
              : mode === "reset"
                ? "Informe o e-mail que você usa para entrar."
                : mode === "signup"
                  ? "Comece a organizar o seu negócio em um único lugar."
                  : "Entre para acompanhar o que você constrói todos os dias."}
          </p>
          {!configured && (
            <p className="notice warning" role="status">
              O acesso está em preparação. Tente novamente quando a configuração estiver concluída.
            </p>
          )}
          {sessionError && (
            <p className="notice warning" role="alert">
              {sessionError}
            </p>
          )}
          <form onSubmit={submit} aria-busy={busy}>
            {!recovery && (
              <label className="field">
                E-mail
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  disabled={busy}
                />
              </label>
            )}
            {(recovery || mode !== "reset") && (
              <>
                <label className="field">
                  {recovery ? "Nova senha" : "Senha"}
                  <span className="password-field">
                    <input
                      type={visible ? "text" : "password"}
                      autoComplete={
                        recovery || mode === "signup" ? "new-password" : "current-password"
                      }
                      required
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={recovery ? "Sua nova senha" : "Sua senha"}
                      disabled={busy}
                    />
                    <button
                      type="button"
                      aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={visible}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </span>
                </label>
                {(recovery || mode === "signup") && (
                  <label className="field">
                    Confirme a senha
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      maxLength={128}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                )}
              </>
            )}
            {!recovery && mode === "login" && (
              <button
                className="text-button forgot"
                type="button"
                disabled={busy}
                onClick={() => changeMode("reset")}
              >
                Esqueci minha senha
              </button>
            )}
            {error && (
              <p className="notice danger" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="notice success" role="status">
                {notice}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={busy || !configured}>
              {busy
                ? "Aguarde…"
                : recovery
                  ? "Salvar nova senha"
                  : mode === "signup"
                    ? "Criar conta"
                    : mode === "reset"
                      ? "Enviar instruções"
                      : "Entrar"}
            </button>
          </form>
          {!recovery && mode === "login" && (
            <p className="signup-prompt">
              Primeiro acesso?{" "}
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => changeMode("signup")}
              >
                Criar uma conta
              </button>
            </p>
          )}
          <p className="access-footnote">Seus dados ficam separados dos dados de outras contas.</p>
        </div>
      </section>
    </main>
  );
}
