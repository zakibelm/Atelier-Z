#!/usr/bin/env node
// Génère team/atelier-z.team.json (format OpenMausBot « openmaus.team ») à partir des skills et des règles du salon.
// Usage : node tools/build-team.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// key = nom du dossier de skill ; la clé du membre est dérivée du même nom.
const members = [
  { skill: "chef-atelier", name: "Chef d'atelier", title: "Chef d'équipe, modérateur du salon", color: "blue" },
  { skill: "orchestrateur", name: "Orchestrateur", title: "Expert en orchestration et répartition du travail", color: "purple" },
  { skill: "cadrage", name: "Cadrage", title: "Fiche de mission et objectif client", color: "teal" },
  { skill: "audit-site-technique", name: "Site et technique", title: "Audit technique du site", color: "cyan" },
  { skill: "audit-contenu-message", name: "Contenu et message", title: "Audit du contenu et du message", color: "green" },
  { skill: "analyse-concurrents", name: "Concurrents", title: "Analyse concurrentielle", color: "orange" },
  { skill: "analyse-audience-geo", name: "Audience et GEO", title: "Audience et visibilité dans les moteurs d'IA", color: "pink" },
  { skill: "verification-sources", name: "Vérificateur", title: "Vérification à la source (avocat du diable)", color: "red" },
  { skill: "synthese-strategique", name: "Stratège", title: "Synthèse, options et plan d'action", color: "yellow" },
  { skill: "redaction-rapport-pdf", name: "Rédacteur", title: "Rapport PDF sur demande", color: "silver" },
];

function readSkill(dir) {
  const raw = readFileSync(join(root, "skills", dir, "SKILL.md"), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Frontmatter manquant : ${dir}`);
  const description = (m[1].match(/^description:\s*(.+)$/m) || [])[1] || "";
  return { description: description.trim(), body: m[2].trim() };
}

const rules = readFileSync(join(root, "docs", "regles-salon.md"), "utf8").trim();

const roster = members.map((x) => `- ${x.name} : ${x.title}`).join("\n");

const preamble = (self) =>
  `Tu fais partie d'Atelier Z, une équipe d'agents dans un salon de réunion avec l'utilisateur. Réponds en français du Québec. ` +
  `Tu es « ${self.name} ». Équipe du salon :\n${roster}\n\n` +
  `Respecte les règles du salon (silence par défaut, source obligatoire, validation humaine avant toute action risquée). ` +
  `Quand tu signales un problème, donne toujours l'action et le bénéfice. Montants en dollars canadiens (CAD).\n\n`;

const team = {
  format: "openmaus.team",
  version: 1,
  team: {
    name: "Atelier Z",
    description: "Équipe d'agents spécialisés qui prépare, discute et livre des recommandations avec plan d'action (PDF sur demande).",
    members: members.map((x) => {
      const s = readSkill(x.skill);
      return {
        key: x.skill,
        name: x.name,
        title: x.title,
        description: s.description.slice(0, 4000),
        soul: preamble(x) + s.body,
        appearance: { color: x.color },
      };
    }),
    room: {
      name: "Atelier de recherche",
      bulletin: rules,
      defaultResponder: { kind: "member", member: "chef-atelier" },
    },
  },
};

mkdirSync(join(root, "team"), { recursive: true });
const out = join(root, "team", "atelier-z.team.json");
writeFileSync(out, JSON.stringify(team, null, 2) + "\n");
console.log(`OK : ${team.team.members.length} bots, salon « ${team.team.room.name} » -> ${out}`);
