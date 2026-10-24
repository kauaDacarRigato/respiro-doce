import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

// Somente o build do navegador: o servidor SSR não registra nem compila um segundo worker.
export function respiroPwa(): Plugin {
  return {
    name: "respiro-pwa",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle(_options, bundle) {
      const hash = createHash("sha256");
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name]!;
        hash.update(name);
        hash.update(item.type === "chunk" ? item.code : item.source);
      }
      for (const name of [
        "offline.html",
        "manifest.webmanifest",
        "icons/app.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-512.png",
        "icons/apple-touch-icon.png",
      ]) {
        hash.update(readFileSync(resolve("public", name)));
      }
      const template = readFileSync(resolve("pwa/sw.template.js"), "utf8");
      hash.update(template);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: template.replace("__BUILD_VERSION__", hash.digest("hex").slice(0, 20)),
      });
    },
  };
}
