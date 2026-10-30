# Atelier Z

Salle de travail où une équipe d'agents IA spécialisés prépare, discute et livre des recommandations avec un plan d'action, exportable en PDF.

**Statut : conception.** Ce dépôt contient la spécification de départ (rôles, modes, règles du salon). Aucun code n'est encore déployé.

## Idée

Un seul interlocuteur humain (l'utilisateur) parle à une équipe de bots. Le premier passage suit une séquence de départ. Ensuite, le salon fonctionne comme un forum de réunion : chaque agent intervient quand c'est son domaine, l'utilisateur peut interrompre ou interpeller un agent (`@nom`), et le travail se lance en séquence ou en parallèle selon ce qui est décidé.

## Modes de travail

Le chef d'atelier choisit le mode selon la tâche, ou l'utilisateur l'impose. Les modes peuvent s'imbriquer.

| Mode | Principe | Usage |
|---|---|---|
| Solo | Un seul agent | Tâche courte, coût minimal |
| Séquentiel | A → B → C | Étapes dépendantes |
| Parallèle | Plusieurs agents en même temps | Recherche large, angles indépendants |
| Débat | Proposition, contestation, arbitrage du chef | Constats critiques, choix de stratégie |

## Équipe de départ

Voir [docs/roles.md](docs/roles.md). Chaque rôle a son skill dans [skills/](skills/) :

| Rôle | Skill |
|---|---|
| Orchestrateur expert | [orchestrateur](skills/orchestrateur/SKILL.md) |
| Chef d'équipe | [chef-atelier](skills/chef-atelier/SKILL.md) |
| Cadrage | [cadrage](skills/cadrage/SKILL.md) |
| Chercheur site et technique | [audit-site-technique](skills/audit-site-technique/SKILL.md) |
| Chercheur contenu et message | [audit-contenu-message](skills/audit-contenu-message/SKILL.md) |
| Chercheur concurrents | [analyse-concurrents](skills/analyse-concurrents/SKILL.md) |
| Chercheur audience et GEO | [analyse-audience-geo](skills/analyse-audience-geo/SKILL.md) |
| Vérificateur | [verification-sources](skills/verification-sources/SKILL.md) |
| Stratège | [synthese-strategique](skills/synthese-strategique/SKILL.md) |
| Rédacteur | [redaction-rapport-pdf](skills/redaction-rapport-pdf/SKILL.md) |

Les skills sont des fichiers d'instructions vivants : après chaque retour de l'utilisateur, l'agent concerné met son skill à jour.

## Règles du salon

Voir [docs/regles-salon.md](docs/regles-salon.md).

## Livrable

À la demande (« génère le rapport »), le rédacteur compile les décisions et le plan d'action (gains rapides, moyen terme, stratégique) en PDF. Rien n'est envoyé à un client sans validation humaine.

## Installation

Prérequis : Node 24+ et une clé OpenRouter (`export OMB_OPENROUTER_API_KEY=...`, jamais écrite dans le dépôt).

```bash
git clone https://github.com/zakibelm/Atelier-Z && cd Atelier-Z
bash scripts/install.sh
```

Le script installe OpenMausBot, démarre le serveur, génère l'équipe à partir des skills (`tools/build-team.mjs` → `team/atelier-z.team.json`) et crée le salon « Atelier de recherche » avec les 10 bots (`tools/setup-atelier.mjs`). Les règles du salon deviennent le bulletin du salon ; le chef d'atelier est le répondant par défaut, et `@nom` interpelle un agent précis.

Chaque bot reçoit son propre modèle via OpenRouter, défini dans [config/models.json](config/models.json) (`node tools/apply-models.mjs` pour réappliquer). Le fournisseur est un seul champ du fichier : changer de fournisseur ne demande aucune modification de code. Les attributions de départ sont à valider par un test réel sur les mêmes missions, avant de les figer.

Pour modifier un rôle : éditer son `skills/<nom>/SKILL.md`, puis relancer `node tools/build-team.mjs`.

État du test (2026-10-30) : installation, création du salon et attribution des modèles vérifiées (10 bots, salon configuré). Aucun échange réel avec les agents n'a encore été testé : il manquait une clé de modèle dans l'environnement de test. À valider sur le VPS avec la clé OpenRouter.

## Infrastructure envisagée

- Salle de discussion : OpenMausBot (open source, Apache-2.0, auto-hébergeable) à tester sur le VPS, avec les CLI d'agents (Claude, Codex).
- Alternative si l'effet forum ne tient pas : fil de messages partagé (Supabase) + orchestration n8n.
- Exécutants interchangeables derrière une couche d'abstraction (aucune intégration codée en dur).

## Prochaines étapes

1. Valider les rôles et les règles du salon.
2. Installer OpenMausBot sur le VPS et créer le salon « Atelier de recherche ».
3. Test réel sur un cas client, avec mesure du coût et du taux de constats vérifiés.
4. Décider : garder OpenMausBot, ou construire la salle sur Supabase et n8n.
