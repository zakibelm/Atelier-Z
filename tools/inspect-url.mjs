#!/usr/bin/env node
// Lit un site en direct et sort des faits observés (statut, balises, JSON-LD, prix, téléphones, robots/sitemap).
// Usage : node tools/inspect-url.mjs <url> [--pages N] [--md] [--json] [--out dossier] [--room [http://127.0.0.1:8799]] [--allow-private]
//   --pages N     explore jusqu'à N pages du même site (1 à 20, défaut 1)
//   --md          affiche le résumé Markdown (défaut)   --json  affiche le JSON complet
//   --out dossier écrit inspection.json et inspection.md (ex. missions/client-x)
//   --room [url]  publie le résumé dans le salon « Atelier de recherche » d'OpenMausBot
//   --allow-private  autorise les adresses internes (tests locaux seulement)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inspectSite, toMarkdown } from "./lib/inspect.mjs";
import { postToRoom } from "./lib/room.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const value = (n) => { const i = args.indexOf(n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const allowPrivate = flag("--allow-private");
const wantJson = flag("--json");
flag("--md");
const pages = value("--pages") ?? 1;
const out = value("--out");
let room;
const ri = args.indexOf("--room");
if (ri >= 0) { room = args[ri + 1] && args[ri + 1].startsWith("http") ? args.splice(ri, 2)[1] : (args.splice(ri, 1), "http://127.0.0.1:8799"); }
const url = args[0];
if (!url) { console.error("Usage : node tools/inspect-url.mjs <url> [--pages N] [--out dossier] [--room]"); process.exit(1); }

try {
  const data = await inspectSite(url, { pages, allowPrivate });
  const md = toMarkdown(data);
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "inspection.json"), JSON.stringify(data, null, 2) + "\n");
    writeFileSync(join(out, "inspection.md"), md + "\n");
    console.error(`Écrit : ${join(out, "inspection.json")} et inspection.md`);
  }
  if (room) {
    await postToRoom(room, "Données d'inspection réelles (inspect-url). Chercheur site et technique : appuie-toi uniquement sur ces faits.\n\n" + md.slice(0, 7000));
    console.error("Résumé publié dans le salon.");
  }
  console.log(wantJson ? JSON.stringify(data, null, 2) : md);
} catch (e) {
  console.error("Erreur : " + e.message);
  process.exit(1);
}
