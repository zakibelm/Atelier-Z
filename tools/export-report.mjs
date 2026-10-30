#!/usr/bin/env node
// Exporte un rapport Markdown (celui du Rédacteur) en PDF.
// Usage : node tools/export-report.mjs <rapport.md> [--title "Titre"] [--client "Nom du client"] [--out rapport.pdf] [--draft]
//   --draft ajoute « BROUILLON, à valider » au pied de page (à retirer avant l'envoi au client).
import { readFileSync, writeFileSync } from "node:fs";
import { markdownToPdf } from "./lib/pdf.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const value = (n) => { const i = args.indexOf(n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const draft = flag("--draft");
const title = value("--title") ?? "";
const client = value("--client") ?? "";
const out = value("--out");
const src = args[0];
if (!src) { console.error('Usage : node tools/export-report.mjs <rapport.md> [--title "..."] [--client "..."] [--out rapport.pdf] [--draft]'); process.exit(1); }

try {
  const md = readFileSync(src, "utf8");
  const pdf = await markdownToPdf(md, { title, client, draft });
  const dest = out || src.replace(/\.md$/i, "") + ".pdf";
  writeFileSync(dest, pdf);
  console.log(`PDF écrit : ${dest} (${Math.round(pdf.length / 1024)} Ko)`);
} catch (e) {
  console.error("Erreur : " + e.message);
  process.exit(1);
}
