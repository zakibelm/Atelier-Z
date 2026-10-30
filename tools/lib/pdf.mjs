// Markdown -> PDF (Lettre, polices intégrées, sans navigateur). Sert au rapport final de l'Atelier Z.
// Gère : titres, paragraphes, listes, tableaux, gras/italique, citations, séparateurs, pagination.
import PDFDocument from "pdfkit";

const ACCENT = "#2f5bea";
const INK = "#15181d";
const MUTED = "#5b6472";
const LINE = "#cfd5de";
const SEVERITY = { critique: "#b42318", "élevée": "#c2410c", elevee: "#c2410c", moyenne: "#9a6700", faible: "#5b6472" };

// Les polices intégrées (Helvetica) ne couvrent que le jeu WinAnsi : on remplace ou retire le reste.
const REPLACE = [[/→|➜|➔|⇒/g, "->"], [/←/g, "<-"], [/≥/g, ">="], [/≤/g, "<="], [/✓|✔|✅/g, "OK"], [/✕|✗|✘|❌/g, "x"], [/[​-‍﻿]/g, ""], [/ | /g, " "], [/[‑‐]/g, "-"]];
const OK_CHARS = /[^\u0009\u000A -~ -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g;
export const clean = (s) => REPLACE.reduce((t, [re, to]) => t.replace(re, to), String(s)).replace(OK_CHARS, "");

// ---------- Analyse Markdown ----------
function parseBlocks(md) {
  const lines = clean(md).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: "p", text: para.join(" ") }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { flush(); continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); blocks.push({ type: "h", level: m[1].length, text: m[2].trim() }); continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); blocks.push({ type: "hr" }); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      flush();
      blocks.push({ type: "li", depth: Math.min(Math.floor(m[1].length / 2), 3), ordered: /\d/.test(m[2]), num: parseInt(m[2], 10), text: m[3] });
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { flush(); blocks.push({ type: "quote", text: m[1] }); continue; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

// **gras**, *italique*, _italique_, `code` -> segments
function runs(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ t: tok.slice(2, -2), b: true });
    else if (tok.startsWith("`")) out.push({ t: tok.slice(1, -1), code: true });
    else out.push({ t: tok.slice(1, -1), i: true });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out.filter((r) => r.t !== "");
}
const fontFor = (r, base = "Helvetica") => (r.code ? "Courier" : r.b && r.i ? "Helvetica-BoldOblique" : r.b || base === "Helvetica-Bold" ? "Helvetica-Bold" : r.i ? "Helvetica-Oblique" : "Helvetica");

function drawRuns(doc, text, opts = {}) {
  const rs = runs(text);
  if (!rs.length) { doc.text("", opts); return; }
  rs.forEach((r, idx) => {
    doc.font(fontFor(r, opts.baseFont)).fillColor(opts.color || INK);
    doc.text(r.t, { ...opts, continued: idx < rs.length - 1 });
  });
}

// ---------- Rendu ----------
export function markdownToPdf(markdown, { title = "", client = "", date = new Date(), draft = false } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 64, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: { Title: clean(title) || "Rapport Atelier Z", Author: "Atelier Z", Creator: "Atelier Z" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const blocks = parseBlocks(markdown);
    let docTitle = clean(title);
    if (!docTitle) {
      const i = blocks.findIndex((b) => b.type === "h" && b.level === 1);
      if (i >= 0) docTitle = blocks.splice(i, 1)[0].text;
    } else {
      const i = blocks.findIndex((b) => b.type === "h" && b.level === 1 && b.text === docTitle);
      if (i >= 0) blocks.splice(i, 1);
    }
    docTitle = docTitle.replace(/\*\*/g, "") || "Rapport";
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const need = (h) => { if (doc.y + h > bottom()) doc.addPage(); };

    // En-tête de la première page
    doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("ATELIER Z  ·  RAPPORT", left, 34, { characterSpacing: 1 });
    doc.moveDown(0.6).fillColor(INK).font("Helvetica-Bold").fontSize(24).text(docTitle, left, doc.y, { width });
    const d = new Intl.DateTimeFormat("fr-CA", { year: "numeric", month: "long", day: "numeric" }).format(date);
    const sub = [clean(client), d].filter(Boolean).join("  ·  ");
    doc.moveDown(0.3).fillColor(MUTED).font("Helvetica").fontSize(11).text(sub, left, doc.y, { width });
    doc.moveDown(0.8);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor(LINE).stroke();
    doc.moveDown(1);

    const sizes = { 1: 18, 2: 15, 3: 12.5, 4: 11 };
    let olCounter = {};
    for (const b of blocks) {
      if (b.type !== "li") olCounter = {};
      if (b.type === "h") {
        const size = sizes[b.level] || 11;
        need(size * 2.6 + 30);
        doc.moveDown(b.level <= 2 ? 0.9 : 0.5);
        doc.fontSize(size).fillColor(b.level === 1 ? ACCENT : INK);
        drawRuns(doc, b.text, { baseFont: "Helvetica-Bold", width, color: b.level === 1 ? ACCENT : INK });
        if (b.level <= 2) { doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).lineWidth(0.6).strokeColor(LINE).stroke(); doc.moveDown(0.5); } else doc.moveDown(0.25);
      } else if (b.type === "p") {
        need(30);
        doc.fontSize(10.5);
        drawRuns(doc, b.text, { width, lineGap: 2.5, align: "left" });
        doc.moveDown(0.6);
      } else if (b.type === "li") {
        need(24);
        const indent = 14 + b.depth * 16;
        let marker = "•";
        if (b.ordered) { olCounter[b.depth] = (olCounter[b.depth] || 0) + 1; marker = olCounter[b.depth] + "."; }
        const y = doc.y;
        doc.font("Helvetica").fontSize(10.5).fillColor(ACCENT).text(marker, left + b.depth * 16, y, { width: indent - 2, lineBreak: false });
        doc.x = left + indent; doc.y = y;
        drawRuns(doc, b.text, { width: width - indent, lineGap: 2, align: "left" });
        doc.x = left;
        doc.moveDown(0.25);
      } else if (b.type === "quote") {
        need(26);
        const y = doc.y;
        doc.fontSize(10.5);
        doc.x = left + 12;
        drawRuns(doc, b.text, { width: width - 12, lineGap: 2, color: MUTED });
        doc.rect(left, y, 3, Math.max(doc.y - y, 12)).fill(ACCENT);
        doc.x = left; doc.moveDown(0.5);
      } else if (b.type === "hr") {
        need(16);
        doc.moveDown(0.3).moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.6).strokeColor(LINE).stroke();
        doc.moveDown(0.6);
      } else if (b.type === "table") {
        drawTable(doc, b.rows, { left, width, need, bottom });
        doc.x = left; doc.moveDown(0.8);
      }
      doc.x = left;
    }

    // Pieds de page (pagination)
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 38;
      doc.moveTo(left, y - 8).lineTo(left + width, y - 8).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
      doc.text("Atelier Z  ·  " + docTitle.slice(0, 70) + (draft ? "  ·  BROUILLON, à valider" : ""), left, y, { width: width - 70, lineBreak: false });
      doc.text(`Page ${i - range.start + 1} / ${range.count}`, left + width - 70, y, { width: 70, align: "right", lineBreak: false });
      doc.page.margins.bottom = oldBottom;
    }
    doc.end();
  });
}

function drawTable(doc, rows, { left, width, need, bottom }) {
  const cols = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
  // Largeurs proportionnelles au contenu (bornées)
  const weight = Array.from({ length: cols }, (_, c) => Math.min(Math.max(...norm.map((r) => String(r[c]).replace(/\*\*/g, "").length), 4), 60));
  const pad = 5, fs = 9;
  // Largeur minimale : le plus long mot de la colonne (plafonné) pour ne pas couper « critique » en deux
  const minW = Array.from({ length: cols }, (_, c) => {
    let longest = 0;
    norm.forEach((r, ri) => {
      doc.font("Helvetica-Bold").fontSize(fs); // mesure en gras : les en-têtes et les gravités sont en gras
      for (const w of String(r[c]).replace(/\*\*/g, "").split(/\s+/)) longest = Math.max(longest, doc.widthOfString(w));
    });
    return Math.min(longest + pad * 2 + 2, 110);
  });
  const total = weight.reduce((a, b) => a + b, 0);
  let widths = weight.map((w, c) => Math.max((w / total) * width, minW[c]));
  for (let guard = 0; guard < 10; guard++) {
    const sum = widths.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - width) < 0.5) break;
    if (sum > width) {
      const flex = widths.map((w, c) => Math.max(w - minW[c], 0));
      const flexSum = flex.reduce((a, b) => a + b, 0);
      if (flexSum <= 0) { widths = widths.map((w) => (w * width) / sum); break; }
      const cut = Math.min(sum - width, flexSum);
      widths = widths.map((w, c) => w - (flex[c] / flexSum) * cut);
    } else {
      const extra = width - sum;
      widths = widths.map((w, c) => w + (weight[c] / total) * extra);
    }
  }
  const cellHeight = (text, w, bold) => { doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs); return doc.heightOfString(text.replace(/\*\*/g, ""), { width: w - pad * 2, lineGap: 1.5 }) + pad * 2; };
  norm.forEach((row, ri) => {
    const header = ri === 0;
    const h = Math.max(...row.map((c, ci) => cellHeight(c, widths[ci], header)));
    if (doc.y + h > bottom()) {
      doc.addPage();
      if (!header) drawRow(norm[0], true); // répète l'en-tête
    }
    drawRow(row, header);
    function drawRow(cells, isHeader) {
      const rh = Math.max(...cells.map((c, ci) => cellHeight(c, widths[ci], isHeader)));
      let x = left;
      const y = doc.y;
      cells.forEach((c, ci) => {
        if (isHeader) doc.rect(x, y, widths[ci], rh).fill("#eef1f6");
        doc.rect(x, y, widths[ci], rh).lineWidth(0.5).strokeColor(LINE).stroke();
        const plain = c.replace(/\*\*/g, "").trim().toLowerCase();
        const sev = !isHeader && SEVERITY[plain];
        doc.font(isHeader || sev ? "Helvetica-Bold" : "Helvetica").fontSize(fs).fillColor(sev || INK);
        doc.text(isHeader || sev ? c.replace(/\*\*/g, "") : c.replace(/\*\*/g, ""), x + pad, y + pad, { width: widths[ci] - pad * 2, lineGap: 1.5 });
        x += widths[ci];
      });
      doc.x = left; doc.y = y + rh;
    }
  });
}
