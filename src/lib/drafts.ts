const prefix = "respiro-doce:draft:";
const ttl = 24 * 60 * 60 * 1000;

function key(ownerId: string, form: string) {
  return `${prefix}${encodeURIComponent(ownerId)}:${encodeURIComponent(form)}`;
}

// Somente dados de formulários; nunca passar senha, token ou sessão.
export function saveDraft(ownerId: string, form: string, value: Record<string, unknown>) {
  if (/"[^"\\]*(?:password|senha|token|secret|session)[^"\\]*"\s*:/i.test(JSON.stringify(value)))
    throw new Error("Credenciais não podem ser guardadas em rascunhos.");
  try {
    localStorage.setItem(
      key(ownerId, form),
      JSON.stringify({ expiresAt: Date.now() + ttl, value }),
    );
    return true;
  } catch {
    /* O formulário em memória continua disponível se o armazenamento estiver bloqueado. */
    return false;
  }
}

export function readDraft(ownerId: string, form: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key(ownerId, form));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (
      !Number.isFinite(draft.expiresAt) ||
      draft.expiresAt <= Date.now() ||
      !draft.value ||
      typeof draft.value !== "object" ||
      Array.isArray(draft.value)
    ) {
      localStorage.removeItem(key(ownerId, form));
      return null;
    }
    return draft.value;
  } catch {
    return null;
  }
}

export function clearDrafts() {
  try {
    for (const entry of Object.keys(localStorage))
      if (entry.startsWith(prefix)) localStorage.removeItem(entry);
  } catch {
    /* Armazenamento indisponível. */
  }
}

export function removeDraft(ownerId: string, form: string) {
  try {
    localStorage.removeItem(key(ownerId, form));
  } catch {
    /* Opcional. */
  }
}
