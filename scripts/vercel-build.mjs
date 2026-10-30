// Construit public/ pour Vercel : seule la page de paramètres est publiée (rien d'autre du dépôt).
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(root, "public"), { recursive: true, force: true });
mkdirSync(join(root, "public"), { recursive: true });
cpSync(join(root, "settings", "index.html"), join(root, "public", "index.html"));
console.log("public/index.html prêt");
