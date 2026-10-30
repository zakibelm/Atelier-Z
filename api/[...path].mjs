// Passerelle Vercel d'Atelier Z.
// - Protégée par un jeton obligatoire (ATELIER_SETTINGS_TOKEN) : sans lui, rien ne répond.
// - Outils sans état exécutés ici : inspection d'un site (/api/inspect) et PDF d'un texte collé (/api/report-pdf).
// - Tout le reste (salon, agents, clé, modèles) est relayé vers le serveur Atelier Z du VPS
//   (ATELIER_BACKEND_URL en HTTPS + ATELIER_BACKEND_TOKEN) : Vercel ne garde ni clé d'IA, ni données.
import { timingSafeEqual } from "node:crypto";
import { inspectSite, toMarkdown } from "../tools/lib/inspect.mjs";
import { markdownToPdf } from "../tools/lib/pdf.mjs";
import { MEMBERS, readSkillFile, parseSkill, loadProfile, rules } from "../tools/lib/team.mjs";

// Les espaces et retours à la ligne collés par erreur autour du jeton dans Vercel sont ignorés
const TOKEN = (process.env.ATELIER_SETTINGS_TOKEN || "").trim();
const BACKEND = (process.env.ATELIER_BACKEND_URL || "").trim().replace(/\/$/, "");
const BACKEND_TOKEN = (process.env.ATELIER_BACKEND_TOKEN || "").trim();
const PROXY_OK = /^\/api\/(?:state|models|source|gateway|openrouter-key|bulk-model|profile|inspect\/room|report-pdf|agents\/[a-z0-9-]+)$/;

const NO_BACKEND = "Le serveur Atelier Z (VPS) n'est pas relié à cette page. Les outils « Inspecter un site » et « Rapport PDF » (texte collé) fonctionnent ; les agents, la clé et les modèles demandent ATELIER_BACKEND_URL et ATELIER_BACKEND_TOKEN dans les variables Vercel.";

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(obj));
}

function sameToken(given) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bodyOf(req) {
  const b = req.body;
  if (b === undefined || b === null || b === "") return {};
  if (typeof b === "string") { try { return JSON.parse(b); } catch { return {}; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString("utf8")); } catch { return {}; } }
  return b;
}

export default async function handler(req, res) {
  try {
    // Accès : jeton obligatoire, refus par défaut si non configuré
    if (!TOKEN || TOKEN.length < 16) return send(res, 503, { error: "Jeton d'accès non configuré (ATELIER_SETTINGS_TOKEN, 16 caractères minimum)." });
    const given = String(req.headers["x-atelier-token"] || "").trim();
    if (!sameToken(given)) {
      // Indice de diagnostic : seule la longueur est révélée, jamais le contenu
      const hint = given && given.length !== TOKEN.length ? ` (longueur reçue : ${given.length}, attendue : ${TOKEN.length})` : "";
      return send(res, 401, { error: (given ? "Jeton d'accès refusé" : "Jeton d'accès requis") + hint });
    }
    if (req.method !== "GET") {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: "Origine refusée" });
      if (req.headers["x-requested-with"] !== "atelier-z") return send(res, 403, { error: "En-tête de requête manquant" });
    }

    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "");
    const body = req.method === "GET" ? {} : bodyOf(req);

    // --- Catalogue de l'équipe (lecture seule, tiré du dépôt) ---
    if (req.method === "GET" && path === "/api/catalog") {
      try {
        const test = loadProfile("test");
        const prod = loadProfile("prod");
        const agents = MEMBERS.map((m) => {
          const raw = readSkillFile(m.key);
          const parsed = parseSkill(raw, m.key);
          return {
            key: m.key, name: m.name, title: m.title, color: m.color,
            description: parsed.description,
            skill: raw,
            models: { test: test.roles[m.key]?.model || test.default, prod: prod.roles[m.key]?.model || prod.default },
          };
        });
        return send(res, 200, { agents, rules: rules(), provider: prod.provider });
      } catch (e) {
        console.error("Catalogue illisible :", e?.message || e);
        return send(res, 500, { error: "Les fichiers de l'équipe sont absents de ce déploiement." });
      }
    }

    // --- Outils sans état, exécutés sur Vercel ---
    if (req.method === "POST" && path === "/api/inspect") {
      const target = body.url;
      if (typeof target !== "string" || target.length > 2048) return send(res, 400, { error: "Adresse manquante" });
      const n = Math.min(Math.max(parseInt(body.pages, 10) || 1, 1), 8);
      let data;
      try { data = await inspectSite(target.trim(), { pages: n, allowPrivate: process.env.ATELIER_INSPECT_ALLOW_PRIVATE === "1" }); } catch (e) { return send(res, 400, { error: e.message }); }
      return send(res, 200, { markdown: toMarkdown(data), savedTo: null, pages: data.pages.length, flags: data.flags.length });
    }

    if (req.method === "POST" && path === "/api/report-pdf" && !body.fromRoom) {
      const md = typeof body.markdown === "string" ? body.markdown : "";
      if (!md.trim()) return send(res, 400, { error: "Le rapport est vide" });
      if (md.length > 400000) return send(res, 413, { error: "Rapport trop volumineux" });
      const t = typeof body.title === "string" ? body.title.slice(0, 160) : "";
      const c = typeof body.client === "string" ? body.client.slice(0, 120) : "";
      const buf = await markdownToPdf(md, { title: t, client: c, draft: !!body.draft });
      const name = ((t || c || "rapport").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rapport") + ".pdf";
      res.statusCode = 200;
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `attachment; filename="${name}"`);
      res.setHeader("cache-control", "no-store");
      res.setHeader("content-length", String(buf.length));
      return res.end(buf);
    }

    // --- Le reste : relayé vers le serveur Atelier Z du VPS ---
    if (!PROXY_OK.test(path)) return send(res, 404, { error: "Route inconnue" });
    if (!BACKEND || !BACKEND_TOKEN) return send(res, 503, { error: NO_BACKEND, code: "no-backend" });
    if (!BACKEND.startsWith("https://") && process.env.ATELIER_BACKEND_ALLOW_HTTP !== "1") {
      return send(res, 503, { error: "ATELIER_BACKEND_URL doit commencer par https:// : le jeton ne doit jamais voyager en clair.", code: "no-backend" });
    }
    let upstream;
    try {
      upstream = await fetch(BACKEND + path + url.search, {
        method: req.method,
        redirect: "manual",
        headers: { "x-atelier-token": BACKEND_TOKEN, "x-requested-with": "atelier-z", "content-type": "application/json" },
        body: req.method === "GET" ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(50000),
      });
    } catch {
      return send(res, 502, { error: "Le serveur Atelier Z (VPS) est injoignable. Vérifie qu'il tourne et que son adresse HTTPS est correcte.", code: "no-backend" });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.statusCode = upstream.status;
    for (const h of ["content-type", "content-disposition"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader("cache-control", "no-store");
    return res.end(buf);
  } catch (e) {
    console.error("Erreur passerelle :", e?.message || e);
    return send(res, 500, { error: "Erreur interne" });
  }
}
