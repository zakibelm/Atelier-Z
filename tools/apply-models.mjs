#!/usr/bin/env node
// Applique config/models.json : assigne un modèle (via le fournisseur choisi, OpenRouter par défaut) à chaque bot.
// Usage : node tools/apply-models.mjs [http://127.0.0.1:8799] [--profile test|prod]
//   test = config/models.test.json (modèles bon marché), prod = config/models.json (défaut du script).
// La clé OpenRouter n'est jamais écrite dans le dépôt : elle se donne au serveur avec OMB_OPENROUTER_API_KEY.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const pi = args.indexOf("--profile");
const profile = pi >= 0 ? args.splice(pi, 2)[1] : "prod";
if (!["test", "prod"].includes(profile)) { console.error("Profil inconnu : utiliser test ou prod"); process.exit(1); }
const base = (args[0] || "http://127.0.0.1:8799").replace(/\/$/, "");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = profile === "test" ? "models.test.json" : "models.json";
const models = JSON.parse(readFileSync(join(root, "config", file), "utf8"));
console.log(`Profil : ${profile} (config/${file})`);
const team = JSON.parse(readFileSync(join(root, "team", "atelier-z.team.json"), "utf8"));

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const { bots } = await call("GET", "/api/bots");
let applied = 0;
for (const member of team.team.members) {
  const bot = bots.find((b) => b.name === member.name);
  if (!bot) { console.warn(`Bot introuvable : ${member.name}`); continue; }
  const model = models.roles[member.key]?.model || models.default;
  await call("PATCH", `/api/bots/${bot.id}`, {
    modelSelection: { instanceId: models.provider, model },
  });
  console.log(`${member.name.padEnd(18)} -> ${models.provider} / ${model}`);
  applied++;
}
console.log(`${applied} bots configurés.`);
