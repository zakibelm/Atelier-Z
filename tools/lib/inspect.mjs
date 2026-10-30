// Lecture réelle d'un site pour les agents d'Atelier Z : faits observés, jamais d'extrapolation.
// Aucune dépendance. Lecture seule (GET), sobre (séquentiel, pause entre les pages), robots.txt respecté pour l'exploration.
import dns from "node:dns/promises";
import net from "node:net";

const UA = "AtelierZ-Inspect/1.0 (audit en lecture seule)";
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const SKIP_EXT = /\.(?:pdf|jpe?g|png|gif|webp|svg|ico|mp4|mp3|zip|docx?|xlsx?|pptx?|css|js|xml|json|txt)(?:\?|$)/i;
const PRIORITY = /(tarif|prix|price|pricing|service|soin|traitement|contact|rendez|rdv|booking|reserv|propos|about|faq|special|promo|offre)/i;

// ---------- Garde anti-SSRF : on refuse les adresses internes ----------
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff");
  }
  return true;
}

async function assertPublic(urlStr, allowPrivate) {
  let u;
  try { u = new URL(urlStr); } catch { throw new Error(`Adresse invalide : ${urlStr}`); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Seules les adresses http et https sont permises");
  if (allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Adresse interne refusée (utilise --allow-private pour un test local)");
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new Error(`Nom de domaine introuvable : ${host}`); });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("Adresse interne refusée (utilise --allow-private pour un test local)");
  return u;
}

// ---------- Récupération d'une page (redirections suivies à la main, chacune revalidée) ----------
async function fetchText(urlStr, { allowPrivate = false, accept = "text/html,application/xhtml+xml" } = {}) {
  const hops = [];
  let current = urlStr;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublic(current, allowPrivate);
    const t0 = Date.now();
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": UA, accept, "accept-language": "fr-CA,fr;q=0.9,en;q=0.5" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ttfb = Date.now() - t0;
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      hops.push({ url: current, status: res.status });
      current = new URL(res.headers.get("location"), current).href;
      continue;
    }
    const chunks = [];
    let bytes = 0;
    let truncated = false;
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BYTES) { truncated = true; await reader.cancel(); break; }
      chunks.push(value);
    }
    return {
      url: current,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      ttfbMs: ttfb,
      totalMs: Date.now() - t0,
      bytes: Math.min(bytes, MAX_BYTES),
      truncated,
      redirects: hops,
      body: Buffer.concat(chunks).toString("utf8"),
    };
  }
  throw new Error(`Trop de redirections (${MAX_REDIRECTS}) depuis ${urlStr}`);
}

// ---------- Extraction HTML (sans dépendance) ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", agrave: "à", ecirc: "ê", ccedil: "ç", rsquo: "’", laquo: "«", raquo: "»" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const stripTags = (s) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const attrsOf = (tag) => {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    if (!(m[1] in out)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
};

const normHost = (h) => h.toLowerCase().replace(/^www\./, "");

function extractPrices(text) {
  const out = [];
  const re = /(\d{1,3}(?:[\s .,]\d{3})*(?:[.,]\d{1,2})?)\s?\$|\$\s?(\d{1,3}(?:[\s .,]\d{3})*(?:[.,]\d{1,2})?)/g;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[2]).replace(/[\s ]/g, "");
    const num = Number(raw.replace(/,(\d{1,2})$/, ".$1").replace(/[.,](?=\d{3}\b)/g, ""));
    if (!Number.isFinite(num) || num <= 0) continue;
    const before = text.slice(Math.max(0, m.index - 60), m.index).replace(/\s+/g, " ").trim();
    out.push({ value: num, text: m[0].trim(), label: before });
  }
  return out;
}

const labelKey = (label) => label.toLowerCase().replace(/[^a-zàâçéèêëîïôûùüÿœ ]/gi, " ").split(/\s+/).filter((w) => w.length > 2).slice(-3).join(" ");

export function parsePage(html, pageUrl) {
  const base = new URL(pageUrl);
  const noScripts = html.replace(/<script\b(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const title = stripTags((noScripts.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const metas = {};
  for (const m of noScripts.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const k = (a.name || a.property || a["http-equiv"] || "").toLowerCase();
    if (k && a.content !== undefined && !(k in metas)) metas[k] = decode(a.content).trim();
  }
  let canonical = "";
  const hreflang = [];
  for (const m of noScripts.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const rel = (a.rel || "").toLowerCase();
    if (rel.includes("canonical") && a.href && !canonical) canonical = new URL(a.href, base).href;
    if (rel.includes("alternate") && a.hreflang) hreflang.push(a.hreflang);
  }
  const lang = (noScripts.match(/<html\b[^>]*>/i) ? attrsOf(noScripts.match(/<html\b[^>]*>/i)[0]).lang : "") || "";
  const headings = { h1: [], h2: [], h3: [] };
  for (const m of noScripts.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const t = stripTags(m[2]);
    if (t) headings["h" + m[1]].push(t);
  }
  let imgs = 0, noAlt = 0, emptyAlt = 0;
  for (const m of noScripts.matchAll(/<img\b[^>]*>/gi)) {
    imgs++;
    const a = attrsOf(m[0]);
    if (!("alt" in a)) noAlt++; else if (a.alt.trim() === "") emptyAlt++;
  }
  const internal = new Set(), external = new Set();
  const ctas = [];
  for (const m of noScripts.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrsOf("<a " + m[1] + ">");
    if (!a.href || /^(#|mailto:|tel:|javascript:)/i.test(a.href)) continue;
    let u;
    try { u = new URL(a.href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    (normHost(u.hostname) === normHost(base.hostname) ? internal : external).add(u.href);
    const label = stripTags(m[2]);
    if (label && /(rendez|réserv|reserv|book|appel|contact|soumission|devis|essai|commenc|inscri)/i.test(label) && ctas.length < 6) ctas.push(label.slice(0, 60));
  }
  const ld = [];
  const ldTypes = new Set();
  let ldInvalid = 0;
  const collect = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(collect);
    if (o["@type"]) [].concat(o["@type"]).forEach((t) => ldTypes.add(String(t)));
    if (o["@graph"]) collect(o["@graph"]);
  };
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); ld.push(j); collect(j); } catch { ldInvalid++; }
  }
  const text = stripTags(noScripts.replace(/<(?:script|svg)[\s\S]*?<\/(?:script|svg)>/gi, " "));
  const phones = [...new Set([...text.matchAll(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)].map((m) => m[0].replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")))];
  const forms = [...noScripts.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((f) => ({ fields: (f[0].match(/<(?:input|select|textarea)\b(?![^>]*type=["']?(?:hidden|submit|button)["']?)/gi) || []).length }));
  return {
    title, titleLength: title.length,
    metaDescription: metas.description || "", metaDescriptionLength: (metas.description || "").length,
    robotsMeta: metas.robots || "", viewport: metas.viewport || "", lang, canonical, hreflang,
    og: { title: metas["og:title"] || "", description: metas["og:description"] || "", image: metas["og:image"] || "" },
    headings, images: { total: imgs, withoutAlt: noAlt, emptyAlt },
    links: { internal: internal.size, external: external.size },
    internalLinks: [...internal],
    ctas, forms,
    jsonLd: { blocks: ld.length, types: [...ldTypes], invalid: ldInvalid },
    words: text ? text.split(/\s+/).length : 0,
    prices: extractPrices(text).slice(0, 40),
    phones,
  };
}

// ---------- robots.txt et sitemap ----------
async function robotsInfo(origin, opts) {
  const info = { status: null, sitemaps: [], disallow: [], sitemapStatus: null };
  try {
    const r = await fetchText(origin + "/robots.txt", { ...opts, accept: "text/plain" });
    info.status = r.status;
    if (r.status === 200) {
      let applies = false;
      for (const line of r.body.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
        if (!m) continue;
        const k = m[1].toLowerCase();
        if (k === "user-agent") applies = m[2] === "*";
        else if (k === "disallow" && applies && m[2]) info.disallow.push(m[2]);
        else if (k === "sitemap") info.sitemaps.push(m[2]);
      }
    }
  } catch (e) { info.error = e.message; }
  const smUrl = info.sitemaps[0] || origin + "/sitemap.xml";
  try { info.sitemapStatus = (await fetchText(smUrl, { ...opts, accept: "application/xml,text/xml" })).status; info.sitemapUrl = smUrl; } catch (e) { info.sitemapError = e.message; }
  return info;
}

const disallowed = (path, rules) => rules.some((r) => path.startsWith(r.replace(/\*$/, "")) && !r.includes("*"));

// ---------- Inspection ----------
export async function inspectSite(startUrl, { pages = 1, allowPrivate = false, delayMs = 400 } = {}) {
  const maxPages = Math.min(Math.max(Number(pages) || 1, 1), 20);
  const start = await assertPublic(startUrl, allowPrivate);
  const opts = { allowPrivate };
  const robots = await robotsInfo(start.origin, opts);
  const result = { inspectedAt: new Date().toISOString(), startUrl: start.href, robots, pages: [], flags: [], consistency: {} };

  const queue = [start.href];
  const seen = new Set();
  while (queue.length && result.pages.length < maxPages) {
    const url = queue.shift();
    const key = url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const path = new URL(url).pathname;
    if (result.pages.length > 0 && disallowed(path, robots.disallow)) continue;
    let r;
    try { r = await fetchText(url, opts); } catch (e) {
      result.pages.push({ url, error: e.message });
      continue;
    }
    const ct = r.headers["content-type"] || "";
    const page = { url: r.url, status: r.status, contentType: ct, ttfbMs: r.ttfbMs, totalMs: r.totalMs, bytes: r.bytes, truncated: r.truncated, redirects: r.redirects, headers: { server: r.headers.server || "", cacheControl: r.headers["cache-control"] || "", xRobotsTag: r.headers["x-robots-tag"] || "", https: r.url.startsWith("https:") } };
    if (r.status === 200 && /html/i.test(ct)) {
      const p = parsePage(r.body, r.url);
      const links = p.internalLinks;
      delete p.internalLinks;
      Object.assign(page, p);
      const cand = links.filter((l) => !SKIP_EXT.test(l) && !seen.has(l.replace(/\/$/, "")));
      cand.sort((a, b) => Number(PRIORITY.test(b)) - Number(PRIORITY.test(a)));
      for (const l of cand) if (!queue.includes(l)) queue.push(l);
    }
    result.pages.push(page);
    if (queue.length && result.pages.length < maxPages) await new Promise((res) => setTimeout(res, delayMs));
  }

  // Incohérences entre pages (à vérifier : heuristique sur le libellé qui précède le prix)
  const byLabel = new Map();
  const phones = new Map();
  for (const pg of result.pages) {
    for (const pr of pg.prices || []) {
      const k = labelKey(pr.label);
      if (k.split(" ").length < 2) continue;
      if (!byLabel.has(k)) byLabel.set(k, []);
      byLabel.get(k).push({ page: pg.url, value: pr.value, text: pr.text, label: pr.label });
    }
    for (const ph of pg.phones || []) { if (!phones.has(ph)) phones.set(ph, []); phones.get(ph).push(pg.url); }
  }
  result.consistency.prices = [...byLabel.entries()]
    .filter(([, v]) => new Set(v.map((x) => x.value)).size > 1 && new Set(v.map((x) => x.page)).size > 1)
    .map(([label, occurrences]) => ({ label, occurrences }));
  result.consistency.phones = [...phones.entries()].map(([number, pgs]) => ({ number, pages: [...new Set(pgs)] }));

  // Constats factuels
  const F = (page, text) => result.flags.push({ page, text });
  if (robots.status !== 200) F(start.origin, `robots.txt : statut ${robots.status ?? "introuvable"}`);
  if (robots.sitemapStatus !== 200) F(start.origin, `sitemap : statut ${robots.sitemapStatus ?? "introuvable"} (${robots.sitemapUrl || start.origin + "/sitemap.xml"})`);
  const titles = new Map();
  for (const pg of result.pages) {
    if (pg.error) { F(pg.url, `Lecture impossible : ${pg.error}`); continue; }
    if (pg.status !== 200) F(pg.url, `Statut HTTP ${pg.status}`);
    if (!pg.headers.https) F(pg.url, "Page servie sans HTTPS");
    if (pg.status === 200 && /html/i.test(pg.contentType)) {
      if (!pg.title) F(pg.url, "Balise title absente");
      else if (pg.titleLength > 65) F(pg.url, `Title long (${pg.titleLength} caractères)`);
      if (!pg.metaDescription) F(pg.url, "Méta-description absente");
      else if (pg.metaDescriptionLength > 160) F(pg.url, `Méta-description longue (${pg.metaDescriptionLength} caractères)`);
      if (pg.headings.h1.length === 0) F(pg.url, "Aucun H1");
      if (pg.headings.h1.length > 1) F(pg.url, `${pg.headings.h1.length} balises H1`);
      if (!pg.viewport) F(pg.url, "Balise viewport absente (affichage mobile)");
      if (!pg.canonical) F(pg.url, "Lien canonique absent");
      if (/noindex/i.test(pg.robotsMeta) || /noindex/i.test(pg.headers.xRobotsTag)) F(pg.url, "Page en noindex");
      if (pg.images.withoutAlt > 0) F(pg.url, `${pg.images.withoutAlt} image(s) sans attribut alt sur ${pg.images.total}`);
      if (pg.jsonLd.blocks === 0) F(pg.url, "Aucune donnée structurée JSON-LD");
      if (pg.jsonLd.invalid > 0) F(pg.url, `${pg.jsonLd.invalid} bloc(s) JSON-LD invalide(s)`);
      if (pg.ttfbMs > 800) F(pg.url, `Réponse lente : ${pg.ttfbMs} ms avant le premier octet`);
      if (pg.bytes > 1024 * 1024) F(pg.url, `HTML volumineux (${Math.round(pg.bytes / 1024)} Ko)`);
      if (pg.title) { if (!titles.has(pg.title)) titles.set(pg.title, []); titles.get(pg.title).push(pg.url); }
    }
  }
  for (const [t, urls] of titles) if (urls.length > 1) F(urls.join(" , "), `Même title sur ${urls.length} pages : « ${t.slice(0, 60)} »`);
  for (const c of result.consistency.prices) F(c.occurrences.map((o) => o.page).join(" , "), `Prix possiblement incohérents pour « ${c.label} » : ${[...new Set(c.occurrences.map((o) => o.text))].join(" / ")} (à vérifier)`);
  if (result.consistency.phones.length > 1) F("site", `${result.consistency.phones.length} numéros de téléphone différents : ${result.consistency.phones.map((p) => p.number).join(", ")}`);
  return result;
}

// ---------- Rapport Markdown court (pour le salon) ----------
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
export function toMarkdown(data, { maxPages = 12 } = {}) {
  const ok = data.pages.filter((p) => !p.error);
  const L = [];
  L.push(`# Inspection de ${data.startUrl}`);
  L.push(`Données lues en direct le ${data.inspectedAt.slice(0, 16).replace("T", " ")} UTC par inspect-url (aucune extrapolation).`);
  L.push("");
  L.push(`**Pages lues :** ${ok.length} sur ${data.pages.length} tentées · **robots.txt :** ${data.robots.status ?? "introuvable"} · **sitemap :** ${data.robots.sitemapStatus ?? "introuvable"}`);
  L.push("");
  L.push("## Pages");
  L.push("| Page | Statut | Réponse | Title | Méta-desc. | H1 | JSON-LD | Images sans alt |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const p of data.pages.slice(0, maxPages)) {
    if (p.error) { L.push(`| ${esc(p.url)} | erreur | | ${esc(p.error)} | | | | |`); continue; }
    L.push(`| ${esc(p.url)} | ${p.status} | ${p.ttfbMs} ms | ${p.title ? p.titleLength + " car." : "absent"} | ${p.metaDescription ? p.metaDescriptionLength + " car." : "absente"} | ${p.headings?.h1.length ?? "-"} | ${p.jsonLd ? p.jsonLd.types.join(", ") || (p.jsonLd.blocks ? "présent" : "aucun") : "-"} | ${p.images ? p.images.withoutAlt + "/" + p.images.total : "-"} |`);
  }
  if (data.pages.length > maxPages) L.push(`(… ${data.pages.length - maxPages} autres pages dans le fichier JSON)`);
  L.push("");
  L.push("## Constats factuels");
  if (!data.flags.length) L.push("Aucun constat automatique.");
  for (const f of data.flags.slice(0, 40)) L.push(`- ${f.text} — ${f.page}`);
  if (data.flags.length > 40) L.push(`- (… ${data.flags.length - 40} autres constats dans le fichier JSON)`);
  L.push("");
  L.push("## Prix et téléphones relevés");
  for (const p of ok.slice(0, maxPages)) {
    if ((p.prices || []).length) L.push(`- ${p.url} : ${p.prices.slice(0, 8).map((x) => `${x.text}${x.label ? " (« …" + x.label.slice(-30) + " »)" : ""}`).join(" ; ")}`);
  }
  if (data.consistency.phones.length) L.push(`- Téléphones : ${data.consistency.phones.map((x) => x.number).join(", ")}`);
  L.push("");
  L.push("Limites : lecture HTML seule (pas d'exécution JavaScript, pas de mesure de vitesse réelle). Les « incohérences de prix » sont une heuristique à vérifier à la main.");
  return L.join("\n");
}
