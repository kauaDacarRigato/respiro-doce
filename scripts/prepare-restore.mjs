// Node 24+ (native TypeScript), no database connection or credentials required.
import { readFile, writeFile } from "node:fs/promises";
import { decodeBackup } from "../src/features/data/backup-format.ts";
import { buildRestoreSql } from "../src/features/data/restore-sql.ts";
const [file, owner, output, isolated] = process.argv.slice(2);
if (!file || !owner || !output || isolated !== "--isolated-empty")
  throw new Error(
    "Uso: node scripts/prepare-restore.mjs backup.json UUID_DONO restore.local.sql --isolated-empty",
  );
const payload = await decodeBackup(await readFile(file, "utf8"));
await writeFile(output, buildRestoreSql(payload, owner), { flag: "wx", mode: 0o600 });
console.log(
  "SQL preparado. Execute somente em banco isolado vazio, após conferir as instruções de restauração.",
);
