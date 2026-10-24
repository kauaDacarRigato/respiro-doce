import { useRef, useState } from "react";
import { Download, FileCheck2 } from "lucide-react";
import { useAccountSync } from "@/features/sync/account-sync-context";
import { commandSignal } from "@/lib/account-requests";
import { decodeBackup, encodeBackup, tableOrder, type BackupPayload } from "./backup-format";
import { readAccountExport, downloadBlob } from "./export-data";
export function DataPage() {
  const { online } = useAccountSync();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const verification = useRef(0);
  const [checked, setChecked] = useState<BackupPayload | null>(null);
  async function backup() {
    if (busy || !online) return;
    const signal = commandSignal();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const raw = await readAccountExport(signal);
      const file = await encodeBackup(raw);
      if (signal.aborted) return;
      downloadBlob(
        new Blob([file], { type: "application/json" }),
        `respiro-doce-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setMessage(
        "Arquivo de backup gerado. Guarde a cópia em um local seguro fora deste aparelho.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setBusy(false);
    }
  }
  async function verify(file: File | undefined) {
    const attempt = ++verification.current;
    setChecked(null);
    setError("");
    if (!file) return;
    if (file.size > 20000000) {
      setError("Limite de 20 MB por arquivo.");
      return;
    }
    try {
      const payload = await decodeBackup(await file.text());
      if (verification.current === attempt) setChecked(payload);
    } catch (e) {
      if (verification.current === attempt)
        setError(e instanceof Error ? e.message : "Não foi possível conferir o arquivo.");
    }
  }
  return (
    <section className="catalog-page" aria-labelledby="data-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">SEUS DADOS, COM VOCÊ</span>
          <h1 id="data-title">Dados e backup</h1>
          <p>Guarde uma cópia completa e confira arquivos já exportados.</p>
        </div>
      </header>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      <article className="data-panel">
        <Download size={26} />
        <h2>Exportar dados da conta</h2>
        <p>
          Configurações, categorias, insumos, nutrição, receitas e composição, clientes, vendas e
          gastos — incluindo os valores históricos.
        </p>
        <p>
          Um único retrato dos dados, com versão e verificação de integridade. Não inclui senhas,
          sessões, arquivos externos ou rascunhos deste navegador.
        </p>
        <button
          className="primary-button compact-button"
          disabled={busy || !online}
          onClick={() => void backup()}
        >
          {busy ? "Preparando cópia…" : "Baixar backup JSON"}
        </button>
        {!online && (
          <p className="notice warning">Conecte-se para gerar uma cópia atualizada do servidor.</p>
        )}
      </article>
      <article className="data-panel">
        <FileCheck2 size={26} />
        <h2>Conferir um backup</h2>
        <p>
          Escolha o JSON exportado pelo aplicativo. A conferência acontece neste aparelho e não
          altera os dados da conta.
        </p>
        <label className="field">
          Arquivo de backup
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => void verify(e.target.files?.[0])}
          />
        </label>
        {checked && (
          <div className="backup-check" role="status">
            <strong>Arquivo íntegro e estrutura compatível · versão 1</strong>
            <p>
              Exportado em{" "}
              {new Date(checked.exported_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </p>
            <dl>
              {tableOrder.map((table) => (
                <div key={table}>
                  <dt>
                    {
                      {
                        business_settings: "Configurações",
                        expense_categories: "Categorias",
                        materials: "Insumos",
                        material_nutrition: "Fontes nutricionais",
                        recipes: "Receitas",
                        recipe_materials: "Itens de receitas",
                        customers: "Clientes",
                        sales: "Vendas",
                        expenses: "Gastos",
                      }[table]
                    }
                  </dt>
                  <dd>{table === "business_settings" ? 1 : checked.data[table].length}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </article>
      <p className="notice warning">
        Este arquivo é uma cópia dos dados do aplicativo, diferente do backup da infraestrutura.
        Faça novas cópias regularmente e guarde-as fora do aparelho. A restauração exige um banco
        isolado vazio e conferência antes de substituir qualquer ambiente ativo.
      </p>
    </section>
  );
}
