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

Chaque bot reçoit son propre modèle via OpenRouter. Deux profils : **test** ([config/models.test.json](config/models.test.json), modèles bon marché, utilisé par défaut par l'installation) et **prod** ([config/models.json](config/models.json), modèles de qualité). Pour changer : `node tools/apply-models.mjs --profile prod` (ou `ATELIER_PROFILE=prod bash scripts/install.sh`). Le fournisseur est un seul champ du fichier : changer de fournisseur ne demande aucune modification de code. Les attributions de départ sont à valider par un test réel sur les mêmes missions, avant de les figer.

Pour modifier un rôle : éditer son `skills/<nom>/SKILL.md`, puis relancer `node tools/build-team.mjs`.

État du test (2026-10-30) : installation, création du salon et attribution des modèles vérifiées (10 bots, salon configuré). Aucun échange réel avec les agents n'a encore été testé : il manquait une clé de modèle dans l'environnement de test. À valider sur le VPS avec la clé OpenRouter.

## Page de paramètres

`bash scripts/install.sh` démarre aussi la page de paramètres (`tools/settings-server.mjs`, port 8801, écoute locale seulement). Elle permet de :

- **choisir la source d'IA** : OpenRouter en direct, ou OmniRoute (toute passerelle compatible OpenAI) avec son adresse et sa clé d'accès. Le choix est gardé dans `config/provider.local.json` (non versionné) ;
- **saisir ta clé OpenRouter** : elle est testée puis transmise à OpenMausBot, qui la garde dans son dossier de données. Elle n'est jamais écrite dans le dépôt ni réaffichée ;
- **choisir le modèle d'IA de chaque agent** : liste d'OpenRouter avec les prix par million de jetons, ou liste des modèles exposés par ta passerelle (saisie libre possible, alias acceptés avec OmniRoute). Un profil rapide test / production (OpenRouter) et un bouton « même modèle pour tous » sont aussi proposés ;
- **modifier le skill de chaque agent** : le fichier `skills/<agent>/SKILL.md` est mis à jour et les instructions du bot sont appliquées tout de suite.

Les choix de modèles faits dans la page sont gardés dans `config/models.local.json` (non versionné) et priment sur les profils.

Accès depuis une tablette : démarrer la page avec `ATELIER_SETTINGS_HOST=0.0.0.0 ATELIER_SETTINGS_TOKEN=<jeton long> node tools/settings-server.mjs`, la placer derrière un accès chiffré (tunnel ou domaine en HTTPS) et ne jamais l'exposer en clair sur Internet. Sans jeton, toute requête qui ne vient pas de la machine locale est refusée.

## Outils de mission

Les agents lisent ce que les outils leur donnent, ils ne devinent pas.

- **`inspect-url`** : lit un site en direct (statut HTTP, title, méta-description, H1, images sans alt, JSON-LD, prix et téléphones par page, robots.txt, sitemap) et signale les écarts entre pages. Lecture seule, sobre, avec garde contre les adresses internes. Les données complètes vont dans `missions/<site>-<date>/` (non versionné) ; seul un résumé d'une page est publié dans le salon.
  `node tools/inspect-url.mjs https://exemple.ca --pages 5 --out missions/client --room`
- **`export-report`** : transforme le rapport Markdown du Rédacteur en PDF (titres, listes, tableaux avec gravités en couleur, pagination).
  `node tools/export-report.mjs rapport.md --client "Nom du client" --out rapport.pdf`

Les deux sont aussi dans la page de paramètres (section « Outils de mission ») : « Inspecter un site », « Envoyer au salon » et « Rapport PDF » (dernier rapport du Rédacteur, ou texte collé). Ça marche donc depuis une tablette.

Limites : lecture HTML seule (pas de JavaScript exécuté, pas de vitesse réelle ni de Core Web Vitals), les incohérences de prix sont une heuristique à confirmer, et les polices du PDF couvrent le français mais pas les emojis ni certains symboles (retirés ou remplacés).

## Mode API directe (Vercel + OmniRoute, sans serveur d'agents)

C'est le mode par défaut de la page Vercel quand aucun serveur n'est relié. Un agent est un appel à l'API (compatible OpenAI) d'OmniRoute, avec le texte de son skill comme instructions et le modèle choisi pour lui.

- **Connexion :** adresse et clé d'OmniRoute saisies dans la page, gardées dans le navigateur (jamais sur Vercel). Les appels partent du navigateur : voir [deploy/omniroute-tailscale.md](deploy/omniroute-tailscale.md) pour l'accès privé par Tailscale.
- **Salon :** le fil de discussion est dans le navigateur (export et vidage possibles). Règles appliquées par le code : silence par défaut (sans `@Nom`, seul le Chef d'atelier répond), seuls le Chef et l'Orchestrateur délèguent (une ligne `@Nom : consigne`), les agents délégués travaillent en parallèle, un plafond d'appels et de jetons par message, bouton Arrêter.
- **Agents :** modèle et skill de chacun, modifiables dans la page ; « Revenir au skill d'origine » rétablit le texte du dépôt.
- **Outils :** « Inspecter un site » envoie son résumé au salon ; « Rapport PDF » prend le dernier message du Rédacteur.

Limites : une réponse d'agent est limitée à environ 2 minutes ; les agents n'ont pas d'outils (ils lisent le fil et l'inspection) ; le salon n'est pas partagé entre appareils.

## Déploiement Vercel + VPS (mode serveur)

Vercel ne peut pas héberger le salon : OpenMausBot est un serveur qui reste allumé et garde ses données sur disque. Le partage est donc le suivant.

| Où | Quoi |
|---|---|
| **Vercel** | La page de paramètres et les outils sans état (inspecter un site, PDF d'un texte collé), derrière un jeton. Aucune clé d'IA ni donnée n'y est stockée. |
| **VPS** | OpenMausBot (salon, agents, clé), le serveur de paramètres (`tools/settings-server.mjs`) et le PDF du dernier rapport du salon. |

Variables Vercel (Production) :
- `ATELIER_SETTINGS_TOKEN` : jeton d'accès à la page (16 caractères minimum, de préférence 40 aléatoires). Sans lui, rien ne répond.
- `ATELIER_BACKEND_URL` : adresse **HTTPS** du serveur de paramètres sur le VPS (ex. `https://atelier.exemple.ca`). Facultatif au départ : sans elle, seuls les outils sans état fonctionnent.
- `ATELIER_BACKEND_TOKEN` : jeton du serveur de paramètres du VPS (le même que son `ATELIER_SETTINGS_TOKEN`).

Sur le VPS, derrière un proxy HTTPS (exemple Caddy dans [deploy/Caddyfile.example](deploy/Caddyfile.example)) :
`ATELIER_SETTINGS_TOKEN=<jeton du VPS> node tools/settings-server.mjs` (le serveur reste à l'écoute en local ; seul le proxy est public).

Sécurité : deux jetons distincts (page, puis VPS) ; le jeton ne voyage jamais en HTTP clair ; les routes relayées sont limitées à une liste fixe ; l'inspection refuse les adresses internes. Fais pivoter les jetons si l'un d'eux a circulé dans une conversation.

## Infrastructure envisagée

- Salle de discussion : OpenMausBot (open source, Apache-2.0, auto-hébergeable) à tester sur le VPS, avec les CLI d'agents (Claude, Codex).
- Alternative si l'effet forum ne tient pas : fil de messages partagé (Supabase) + orchestration n8n.
- Exécutants interchangeables derrière une couche d'abstraction (aucune intégration codée en dur).

## Prochaines étapes

1. Valider les rôles et les règles du salon.
2. Installer OpenMausBot sur le VPS et créer le salon « Atelier de recherche ».
3. Test réel sur un cas client, avec mesure du coût et du taux de constats vérifiés.
4. Décider : garder OpenMausBot, ou construire la salle sur Supabase et n8n.
