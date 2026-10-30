#!/usr/bin/env node
// Page de paramètres d'Atelier Z : clé OpenRouter, modèle et skill de chaque agent.
// Usage : node tools/settings-server.mjs
// Variables : OMB_URL (défaut http://127.0.0.1:8799), ATELIER_SETTINGS_PORT (8801),
//             ATELIER_SETTINGS_HOST (127.0.0.1), ATELIER_SETTINGS_TOKEN (jeton d'accès, obligatoire hors localhost).
// La clé OpenRouter est transmise à OpenMausBot (stockée dans son dossier de données, côté utilisateur).
// Elle n'est jamais écrite dans le dépôt, ni renvoyée par cette API.
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import {
  root, MEMBERS, skillPath, readSkillFile, parseSkill, buildSoul,
  loadProfile, loadLocal, saveLocalModel, clearLocalModels, modelFor, MODEL_ID,
} from "./lib/team.mjs";

const OMB = (process.env.OMB_URL || "http://127.0.0.1:8799").replace(/\/$/, "");
const PORT = Number(process.env.ATELIER_SETTINGS_PORT || 8801);
const HOST = process.env.ATELIER_SETTINGS_HOST || "127.0.0.1";
const TOKEN = process.env.ATELIER_SETTINGS_TOKEN || "";
const MAX_BODY = 64 * 1024;
const MAX_SKILL = 20000;
const page = readFileSync(join(root, "settings", "index.html"));

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function omb(method, path, body) {
  let res;
  try {
    res = await fetch(OMB + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, `OpenMausBot est injoignable (${OMB}). Démarre-le d'abord.`);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, data.error || `OpenMausBot : erreur ${res.status}`);
  return data;
}

// --- Catalogue de modèles OpenRouter (public, mis en cache 10 minutes) ---
let modelCache = { at: 0, list: null };
async function modelCatalog() {
  if (modelCache.list && Date.now() - modelCache.at < 600000) return modelCache.list;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const { data } = await res.json();
    const perM = (v) => (v === undefined || v === null || v === "" ? null : Math.round(Number(v) * 1e8) / 100);
    const list = data
      .filter((m) => typeof m.id === "string" && MODEL_ID.test(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        context: m.context_length || null,
        in: perM(m.pricing?.prompt),
        out: perM(m.pricing?.completion),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    modelCache = { at: Date.now(), list };
    return list;
  } catch {
    return null;
  }
}

function suggestedModels() {
  const ids = new Set();
  for (const p of ["test", "prod"]) {
    const d = loadProfile(p);
    ids.add(d.default);
    for (const r of Object.values(d.roles)) ids.add(r.model);
  }
  return [...ids].sort().map((id) => ({ id, name: id, context: null, in: null, out: null }));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, "Requête trop volumineuse");
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "JSON invalide"); }
}

// --- Accès : localhost par défaut, jeton sinon ---
function sameToken(given) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}
function authorize(req) {
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  const local = host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  if (TOKEN) {
    if (!sameToken(req.headers["x-atelier-token"])) throw new HttpError(401, "Jeton d'accès requis");
  } else if (!local) {
    throw new HttpError(403, "Accès refusé : définis ATELIER_SETTINGS_TOKEN pour ouvrir cette page hors de la machine locale");
  }
  if (req.method !== "GET") {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, "Origine refusée");
    if (req.headers["x-requested-with"] !== "atelier-z") throw new HttpError(403, "En-tête de requête manquant");
  }
}

// --- État ---
async function state() {
  const [{ bots }, config] = await Promise.all([omb("GET", "/api/bots"), omb("GET", "/api/config")]);
  const prof = loadProfile("test");
  const local = loadLocal();
  const agents = MEMBERS.map((m) => {
    const bot = bots.find((b) => b.name === m.name);
    return {
      key: m.key,
      name: m.name,
      title: m.title,
      color: m.color,
      present: !!bot,
      model: bot?.modelSelection?.model || "",
      provider: bot?.modelSelection?.instanceId || prof.provider,
      customModel: !!local.roles?.[m.key],
      skill: readSkillFile(m.key),
    };
  });
  return { openrouterConfigured: !!config.openrouter?.configured, provider: prof.provider, agents };
}

function botFor(bots, member) {
  const bot = bots.find((b) => b.name === member.name);
  if (!bot) throw new HttpError(404, `Le bot « ${member.name} » n'existe pas dans OpenMausBot. Lance d'abord scripts/install.sh.`);
  return bot;
}

// --- Routes ---
async function route(req, url) {
  const p = url.pathname;
  if (req.method === "GET" && p === "/api/state") return state();

  if (req.method === "GET" && p === "/api/models") {
    const live = await modelCatalog();
    return { live: !!live, models: live || suggestedModels() };
  }

  if (req.method === "PUT" && p === "/api/openrouter-key") {
    const { key } = await readBody(req);
    if (typeof key !== "string") throw new HttpError(400, "Clé manquante");
    const k = key.trim();
    if (k === "") {
      await omb("PATCH", "/api/config", { openrouter: { key: "" } });
      return { saved: true, cleared: true };
    }
    if (!/^sk-or-[\w-]{10,}$/.test(k) || k.length > 300) throw new HttpError(400, "Cette clé ne ressemble pas à une clé OpenRouter (elle commence par sk-or-).");
    const verdict = await omb("POST", "/api/keys/test", { provider: "openrouter", key: k });
    if (verdict.ok === false && verdict.reason === "rejected") throw new HttpError(400, "OpenRouter a refusé cette clé. Vérifie qu'elle est active.");
    await omb("PATCH", "/api/config", { openrouter: { key: k } });
    return { saved: true, verified: verdict.ok === true };
  }

  let m = p.match(/^\/api\/agents\/([a-z0-9-]+)$/);
  if (req.method === "PUT" && m) {
    const member = MEMBERS.find((x) => x.key === m[1]);
    if (!member) throw new HttpError(404, "Agent inconnu");
    const body = await readBody(req);
    const { bots } = await omb("GET", "/api/bots");
    const bot = botFor(bots, member);
    const out = {};

    if (body.model !== undefined) {
      const model = String(body.model).trim();
      if (model.length > 128 || !MODEL_ID.test(model)) throw new HttpError(400, "Identifiant de modèle invalide (format attendu : fournisseur/modèle)");
      const provider = loadProfile("test").provider;
      await omb("PATCH", `/api/bots/${bot.id}`, { modelSelection: { instanceId: provider, model } });
      saveLocalModel(member.key, model);
      out.model = model;
    }

    if (body.skill !== undefined) {
      const text = String(body.skill).replace(/\r\n/g, "\n");
      if (text.length > MAX_SKILL) throw new HttpError(400, `Skill trop long (maximum ${MAX_SKILL} caractères)`);
      let parsed;
      try { parsed = parseSkill(text, member.key); } catch (e) { throw new HttpError(400, e.message); }
      await omb("PATCH", `/api/bots/${bot.id}`, { soul: buildSoul(member, parsed.body), description: parsed.description.slice(0, 4000) });
      writeFileSync(skillPath(member.key), text.endsWith("\n") ? text : text + "\n");
      out.skill = true;
    }
    return { saved: true, ...out };
  }

  if (req.method === "POST" && p === "/api/profile") {
    const { profile } = await readBody(req);
    if (!["test", "prod"].includes(profile)) throw new HttpError(400, "Profil inconnu");
    clearLocalModels();
    const data = loadProfile(profile);
    const { bots } = await omb("GET", "/api/bots");
    for (const member of MEMBERS) {
      const bot = bots.find((b) => b.name === member.name);
      if (bot) await omb("PATCH", `/api/bots/${bot.id}`, { modelSelection: { instanceId: data.provider, model: modelFor(member.key, data, { roles: {} }) } });
    }
    return { saved: true, profile };
  }

  throw new HttpError(404, "Route inconnue");
}

const server = http.createServer(async (req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(obj));
  };
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
      });
      return res.end(page);
    }
    authorize(req);
    send(200, await route(req, url));
  } catch (e) {
    send(e.status || 500, { error: e.status ? e.message : "Erreur interne" });
    if (!e.status) console.error(e);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Paramètres Atelier Z : http://${HOST}:${PORT}  (OpenMausBot : ${OMB})`);
  if (HOST !== "127.0.0.1" && !TOKEN) console.warn("Attention : hôte non local sans ATELIER_SETTINGS_TOKEN, les requêtes externes seront refusées.");
});
