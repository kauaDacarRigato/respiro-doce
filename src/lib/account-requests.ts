let owner: string | null = null;
let scope = new AbortController();
// Capture this signal when constructing a command, before the SDK resolves the
// token. Switching identity then cancels queued/in-flight requests as well.
export function setRequestOwner(next: string | null) {
  if (next === owner) return;
  scope.abort();
  owner = next;
  scope = new AbortController();
}
export function commandSignal() {
  return AbortSignal.any([scope.signal, AbortSignal.timeout(20000)]);
}
