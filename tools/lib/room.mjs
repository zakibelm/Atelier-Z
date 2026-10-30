// Accès au salon « Atelier de recherche » d'OpenMausBot : publier un message, relire le dernier rapport du Rédacteur.
export const ROOM_NAME = "Atelier de recherche";

async function call(base, method, path, body) {
  const res = await fetch(base.replace(/\/$/, "") + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenMausBot : ${method} ${path} -> ${res.status}`);
  return res.json();
}

async function findRoom(base) {
  const { groups } = await call(base, "GET", "/api/bots");
  const g = (groups || []).find((x) => x.name === ROOM_NAME);
  if (!g) throw new Error(`Salon « ${ROOM_NAME} » introuvable. Lance d'abord scripts/install.sh.`);
  return g;
}

export async function postToRoom(base, text) {
  const g = await findRoom(base);
  await call(base, "POST", `/api/groups/${g.id}/messages`, { text });
}

// Dernier message texte du Rédacteur (le rapport en Markdown).
export async function lastReport(base) {
  const g = await findRoom(base);
  const msgs = [...(g.messages || [])].reverse();
  const m = msgs.find((x) => x.role === "bot" && x.kind === "text" && x.from?.name === "Rédacteur" && String(x.text || "").trim().length > 40);
  return m ? String(m.text) : null;
}
