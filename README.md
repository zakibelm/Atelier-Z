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

Voir [docs/roles.md](docs/roles.md).

## Règles du salon

Voir [docs/regles-salon.md](docs/regles-salon.md).

## Livrable

À la demande (« génère le rapport »), le rédacteur compile les décisions et le plan d'action (gains rapides, moyen terme, stratégique) en PDF. Rien n'est envoyé à un client sans validation humaine.

## Infrastructure envisagée

- Salle de discussion : OpenMausBot (open source, Apache-2.0, auto-hébergeable) à tester sur le VPS, avec les CLI d'agents (Claude, Codex).
- Alternative si l'effet forum ne tient pas : fil de messages partagé (Supabase) + orchestration n8n.
- Exécutants interchangeables derrière une couche d'abstraction (aucune intégration codée en dur).

## Prochaines étapes

1. Valider les rôles et les règles du salon.
2. Installer OpenMausBot sur le VPS et créer le salon « Atelier de recherche ».
3. Test réel sur un cas client, avec mesure du coût et du taux de constats vérifiés.
4. Décider : garder OpenMausBot, ou construire la salle sur Supabase et n8n.
