#!/usr/bin/env node
// Applique les modèles à chaque bot (via le fournisseur choisi, OpenRouter par défaut).
// Usage : node tools/apply-models.mjs [http://127.0.0.1:8799] [--profile test|prod] [--reset-local]
//   test = config/models.test.json (modèles bon marché), prod = config/models.json (défaut du script).
//   Les choix faits depuis la page de paramètres (config/models.local.json) priment sur le profil,
//   sauf avec --reset-local qui les efface.
// La clé OpenRouter n'est jamais écrite dans le dépôt : elle se saisit dans la page de paramètres
// (ou OMB_OPENROUTER_API_KEY au démarrage du serveur).
import { MEMBERS, loadProfile, loadLocal, clearLocalModels, modelFor } from "./lib/team.mjs";

const args = process.argv.slice(2);
const pi = args.indexOf("--profile");
const profile = pi >= 0 ? args.splice(pi, 2)[1] : "prod";
const reset = args.includes("--reset-local");
if (reset) args.splice(args.indexOf("--reset-local"), 1);
if (!["test", "prod"].includes(profile)) { console.error("Profil inconnu : utiliser test ou prod"); process.exit(1); }
const base = (args[0] || "http://127.0.0.1:8799").replace(/\/$/, "");

if (reset) clearLocalModels();
const models = loadProfile(profile);
const local = loadLocal();
console.log(`Profil : ${profile}${reset ? " (choix locaux effacés)" : Object.keys(local.roles || {}).length ? " + choix locaux" : ""}`);

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
for (const member of MEMBERS) {
  const bot = bots.find((b) => b.name === member.name);
  if (!bot) { console.warn(`Bot introuvable : ${member.name}`); continue; }
  const model = modelFor(member.key, models, local);
  await call("PATCH", `/api/bots/${bot.id}`, { modelSelection: { instanceId: models.provider, model } });
  console.log(`${member.name.padEnd(18)} -> ${models.provider} / ${model}`);
  applied++;
}
console.log(`${applied} bots configurés.`);
