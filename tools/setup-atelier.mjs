#!/usr/bin/env node
// Installe l'équipe Atelier Z dans un serveur OpenMausBot en marche et crée le salon.
// Usage : node tools/setup-atelier.mjs [http://127.0.0.1:8799]
// Idempotent : n'importe pas l'équipe deux fois et ne recrée pas le salon s'il existe.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] || "http://127.0.0.1:8799").replace(/\/$/, "");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const team = JSON.parse(readFileSync(join(root, "team", "atelier-z.team.json"), "utf8"));
const roomName = team.team.room.name;

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return data;
}

const names = team.team.members.map((m) => m.name);
let state = await call("GET", "/api/bots");
let bots = state.bots.filter((b) => names.includes(b.name));

if (bots.length < names.length) {
  await call("POST", "/api/teams/import?mode=add", team);
  state = await call("GET", "/api/bots");
  bots = state.bots.filter((b) => names.includes(b.name));
  console.log(`Équipe importée : ${bots.length} bots`);
} else {
  console.log(`Équipe déjà présente : ${bots.length} bots`);
}

const chef = bots.find((b) => b.name === "Chef d'atelier");
let group = (state.groups || []).find((g) => g.name === roomName);
if (group && group.setupCompletedAt) {
  console.log(`Salon déjà présent : « ${roomName} »`);
  process.exit(0);
}
if (!group) {
  const created = await call("POST", "/api/groups", {
    name: roomName,
    memberIds: bots.map((b) => b.id),
    section: "Atelier Z",
  });
  group = created.group;
}
await call("PATCH", `/api/groups/${group.id}/setup`, {
  action: "complete",
  bulletin: team.team.room.bulletin,
  defaultResponder: { kind: "member", botId: chef.id },
});
console.log(`Salon configuré : « ${roomName} » (${bots.length} membres, répondant par défaut : ${chef.name})`);
