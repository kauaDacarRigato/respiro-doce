import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { hasUpdateBlocker } from "./update-guard";

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function PwaControls() {
  const [installed, setInstalled] = useState(true);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [installing, setInstalling] = useState(false);
  const dirty = useRef(new Set<HTMLFormElement>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let lastCheck = 0;
    let controlled = Boolean(navigator.serviceWorker?.controller);
    const watches: Array<() => void> = [];
    const display = window.matchMedia("(display-mode: standalone)");
    const displayChanged = () => setInstalled(isInstalled());
    displayChanged();
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const completed = () => {
      setInstalled(true);
      setPrompt(null);
      setHelp(false);
    };
    const edited = (event: Event) => {
      if (event.target instanceof HTMLElement) {
        const form = event.target.closest("form");
        if (form) dirty.current.add(form);
      }
      for (const form of dirty.current) if (!form.isConnected) dirty.current.delete(form);
    };
    const reset = (event: Event) => {
      if (event.target instanceof HTMLFormElement) dirty.current.delete(event.target);
    };
    const check = () => {
      if (
        !registration ||
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        Date.now() - lastCheck < 60000
      )
        return;
      lastCheck = Date.now();
      void registration.update().catch(() => {
        /* A versão atual segue funcionando. */
      });
    };
    const changed = () => {
      if (disposed) return;
      if (controlled) {
        // Uma edição iniciada entre o clique e a ativação também impede o recarregamento.
        if (hasUpdateBlocker(dirty.current)) {
          setApplying(false);
          setWaiting(null);
          setMessage(
            "Nova versão pronta. Salve seu trabalho e reabra o aplicativo para utilizá-la.",
          );
        } else window.location.reload();
      }
      controlled = true;
    };
    const workerMessage = (event: MessageEvent) => {
      if (event.data?.type === "RESPIRO_UPDATE_BLOCKED") {
        clearTimeout(timer.current);
        setApplying(false);
        setMessage("Feche as outras abas e janelas do Respiro Doce e tente atualizar novamente.");
      }
    };
    const start = async () => {
      if (!import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator))
        return;
      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (disposed) return;
        const inspect = () => {
          if (registration?.waiting) setWaiting(registration.waiting);
          const worker = registration?.installing;
          if (worker) {
            const state = () => {
              if (!disposed && worker.state === "installed" && navigator.serviceWorker.controller)
                setWaiting(registration?.waiting ?? worker);
            };
            worker.addEventListener("statechange", state);
            watches.push(() => worker.removeEventListener("statechange", state));
          }
        };
        registration.addEventListener("updatefound", inspect);
        watches.push(() => registration?.removeEventListener("updatefound", inspect));
        inspect();
      } catch {
        // Sem worker, o site continua acessível normalmente pela internet.
      }
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", completed);
    display.addEventListener("change", displayChanged);
    document.addEventListener("input", edited, true);
    document.addEventListener("change", edited, true);
    document.addEventListener("reset", reset, true);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    navigator.serviceWorker?.addEventListener("controllerchange", changed);
    navigator.serviceWorker?.addEventListener("message", workerMessage);
    if (document.readyState === "complete") void start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      disposed = true;
      clearTimeout(timer.current);
      window.removeEventListener("load", start);
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", completed);
      display.removeEventListener("change", displayChanged);
      document.removeEventListener("input", edited, true);
      document.removeEventListener("change", edited, true);
      document.removeEventListener("reset", reset, true);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
      for (const stop of watches) stop();
    };
  }, []);

  async function install() {
    if (!prompt || installing) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setHelp(true);
    } finally {
      setPrompt(null);
      setInstalling(false);
    }
  }
  function update() {
    setMessage("");
    if (hasUpdateBlocker(dirty.current)) {
      setMessage(
        "Salve ou feche os formulários em edição e aguarde as operações terminarem antes de atualizar.",
      );
      return;
    }
    if (!waiting || applying) return;
    if (!navigator.onLine) {
      setMessage("Conecte-se à internet antes de atualizar.");
      return;
    }
    setApplying(true);
    waiting.postMessage({ type: "RESPIRO_ACTIVATE" });
    timer.current = setTimeout(() => {
      setApplying(false);
      setMessage(
        "Não foi possível aplicar agora. Feche as outras janelas do aplicativo e tente novamente.",
      );
    }, 6000);
  }

  if (installed && !waiting && !message) return null;
  return (
    <aside className="pwa-controls" aria-label="Instalação e atualização do aplicativo">
      <div className="pwa-actions">
        {!installed &&
          (prompt ? (
            <button
              type="button"
              className="text-button"
              disabled={installing}
              onClick={() => void install()}
            >
              <Download size={16} /> {installing ? "Abrindo instalação…" : "Instalar aplicativo"}
            </button>
          ) : (
            <button
              type="button"
              className="text-button"
              aria-expanded={help}
              aria-controls="pwa-install-help"
              onClick={() => setHelp(!help)}
            >
              <Download size={16} /> Como instalar
            </button>
          ))}
        {waiting && (
          <span className="pwa-update">
            Nova versão disponível
            <button type="button" className="text-button" disabled={applying} onClick={update}>
              <RefreshCw size={16} /> {applying ? "Atualizando…" : "Atualizar aplicativo"}
            </button>
          </span>
        )}
      </div>
      {!installed && help && (
        <div id="pwa-install-help" className="pwa-help">
          <strong>Tenha o Respiro Doce na sua tela inicial.</strong>
          <p>
            No iPhone ou iPad: abra o endereço publicado no Safari, toque em Compartilhar e em
            Adicionar à Tela de Início. Ative Abrir como App da Web, se essa opção aparecer.
          </p>
          <p>
            No Android ou computador: abra o menu do navegador e procure Instalar aplicativo ou
            Adicionar à tela inicial. A opção depende do navegador.
          </p>
          <p>
            Abra o endereço publicado diretamente no navegador. A instalação não acontece dentro da
            prévia do editor. Para consultar e salvar seus dados, mantenha uma conexão com a
            internet.
          </p>
        </div>
      )}
      {message && (
        <p className="pwa-message" role="status">
          {message}
        </p>
      )}
    </aside>
  );
}
