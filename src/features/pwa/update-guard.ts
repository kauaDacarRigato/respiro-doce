// O estado de edição é só memória; nunca guarda conteúdo, senha ou dados da conta.
export function hasUpdateBlocker(dirtyForms: ReadonlySet<HTMLFormElement>) {
  return Boolean(
    document.querySelector('[role="dialog"], [aria-busy="true"]') ||
    [...dirtyForms].some((form) => form.isConnected),
  );
}
