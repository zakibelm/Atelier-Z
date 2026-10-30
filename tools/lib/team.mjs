// Logique partagée : équipe, skills, souls des bots et modèles.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// key = nom du dossier de skill
export const MEMBERS = [
  { key: "chef-atelier", name: "Chef d'atelier", title: "Chef d'équipe, modérateur du salon", color: "blue" },
  { key: "orchestrateur", name: "Orchestrateur", title: "Expert en orchestration et répartition du travail", color: "purple" },
  { key: "cadrage", name: "Cadrage", title: "Fiche de mission et objectif client", color: "teal" },
  { key: "audit-site-technique", name: "Site et technique", title: "Audit technique du site", color: "cyan" },
  { key: "audit-contenu-message", name: "Contenu et message", title: "Audit du contenu et du message", color: "green" },
  { key: "analyse-concurrents", name: "Concurrents", title: "Analyse concurrentielle", color: "orange" },
  { key: "analyse-audience-geo", name: "Audience et GEO", title: "Audience et visibilité dans les moteurs d'IA", color: "pink" },
  { key: "verification-sources", name: "Vérificateur", title: "Vérification à la source (avocat du diable)", color: "red" },
  { key: "synthese-strategique", name: "Stratège", title: "Synthèse, options et plan d'action", color: "yellow" },
  { key: "redaction-rapport-pdf", name: "Rédacteur", title: "Rapport PDF sur demande", color: "silver" },
];

export const skillPath = (key) => join(root, "skills", key, "SKILL.md");
export const readSkillFile = (key) => readFileSync(skillPath(key), "utf8");

// Découpe un SKILL.md en { description, body }. Lève une erreur si le format est invalide.
export function parseSkill(raw, expectedName) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("Le skill doit commencer par un en-tête --- name / description ---");
  const name = (m[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const description = (m[1].match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  if (!name) throw new Error("En-tête : la ligne « name: » est manquante");
  if (expectedName && name !== expectedName) throw new Error(`En-tête : name doit rester « ${expectedName} »`);
  if (!description) throw new Error("En-tête : la ligne « description: » est manquante");
  return { name, description, body: m[2].trim() };
}

export const rules = () => readFileSync(join(root, "docs", "regles-salon.md"), "utf8").trim();

export function buildSoul(member, body) {
  const roster = MEMBERS.map((x) => `- ${x.name} : ${x.title}`).join("\n");
  return (
    `Tu fais partie d'Atelier Z, une équipe d'agents dans un salon de réunion avec l'utilisateur. Réponds en français du Québec. ` +
    `Tu es « ${member.name} ». Équipe du salon :\n${roster}\n\n` +
    `Respecte les règles du salon (silence par défaut, source obligatoire, validation humaine avant toute action risquée). ` +
    `Quand tu signales un problème, donne toujours l'action et le bénéfice. Montants en dollars canadiens (CAD).\n\n` +
    body
  );
}

export function buildTeam() {
  return {
    format: "openmaus.team",
    version: 1,
    team: {
      name: "Atelier Z",
      description: "Équipe d'agents spécialisés qui prépare, discute et livre des recommandations avec plan d'action (PDF sur demande).",
      members: MEMBERS.map((x) => {
        const s = parseSkill(readSkillFile(x.key), x.key);
        return {
          key: x.key,
          name: x.name,
          title: x.title,
          description: s.description.slice(0, 4000),
          soul: buildSoul(x, s.body),
          appearance: { color: x.color },
        };
      }),
      room: {
        name: "Atelier de recherche",
        bulletin: rules(),
        defaultResponder: { kind: "member", member: "chef-atelier" },
      },
    },
  };
}

// --- Modèles : profil (test | prod) + surcharges locales choisies depuis la page de paramètres ---
const localFile = join(root, "config", "models.local.json");

export function loadProfile(profile) {
  const file = profile === "test" ? "models.test.json" : "models.json";
  return JSON.parse(readFileSync(join(root, "config", file), "utf8"));
}

export function loadLocal() {
  return existsSync(localFile) ? JSON.parse(readFileSync(localFile, "utf8")) : { roles: {} };
}

export function saveLocalModel(key, model) {
  const local = loadLocal();
  local.roles = local.roles || {};
  local.roles[key] = { model };
  mkdirSync(dirname(localFile), { recursive: true });
  writeFileSync(localFile, JSON.stringify(local, null, 2) + "\n");
}

export function clearLocalModels() {
  rmSync(localFile, { force: true });
}

// Modèle effectif d'un rôle : surcharge locale > profil > défaut du profil.
export function modelFor(key, profileData, local = loadLocal()) {
  return local.roles?.[key]?.model || profileData.roles?.[key]?.model || profileData.default;
}

export const MODEL_ID = /^[A-Za-z0-9][\w.-]*\/[\w.:-]+$/;

// --- Source d'IA : openrouter (direct) ou openaiCompat (passerelle compatible OpenAI, ex. OmniRoute) ---
export const PROVIDERS = ["openrouter", "openaiCompat"];
const providerFile = join(root, "config", "provider.local.json");

export function getProvider() {
  if (existsSync(providerFile)) {
    const p = JSON.parse(readFileSync(providerFile, "utf8")).provider;
    if (PROVIDERS.includes(p)) return p;
  }
  return loadProfile("test").provider;
}

export function setProvider(provider) {
  if (!PROVIDERS.includes(provider)) throw new Error("Source d'IA inconnue");
  mkdirSync(dirname(providerFile), { recursive: true });
  writeFileSync(providerFile, JSON.stringify({ provider }, null, 2) + "\n");
}

// Identifiant de modèle valide pour la source : fournisseur/modèle pour OpenRouter,
// nom libre pour une passerelle (alias ou combo définis dans la passerelle).
export function modelIdOk(provider, id) {
  if (typeof id !== "string" || id.length > 128) return false;
  return provider === "openaiCompat" ? /^[A-Za-z0-9][\w.:@/+-]*$/.test(id) : MODEL_ID.test(id);
}
