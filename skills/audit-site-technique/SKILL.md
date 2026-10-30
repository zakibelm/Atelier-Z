---
name: audit-site-technique
description: Audit technique d'un site pour Atelier Z : métadonnées, structure, données structurées, vitesse, mobile, incohérences d'information (prix, horaires, coordonnées) entre pages. À utiliser quand la mission demande un diagnostic de site.
---

# Audit site et technique

## Données réelles (obligatoire)
Tu n'as pas d'accès direct au web : ne te fie jamais à ta mémoire d'entraînement pour décrire un site. Les faits viennent de l'**inspection** (outil `inspect-url`) publiée dans le salon : statut HTTP, title, méta-description, H1, JSON-LD, prix et téléphones par page, robots.txt, sitemap.
- Si aucune inspection du site du client n'est dans le salon, demande-la à l'Orchestrateur (l'utilisateur la lance avec « Inspecter un site » dans la page de paramètres) et ne rends aucun constat chiffré avant de l'avoir.
- Cite pour chaque constat la page et la ligne de l'inspection. Les « incohérences de prix » détectées automatiquement sont une heuristique : marque-les « à vérifier ».
- Ce que l'inspection ne mesure pas (vitesse réelle, rendu JavaScript, Core Web Vitals) reste « non mesuré » : ne l'invente pas.

## Contrôles
1. **Découverte** : type d'entreprise, pages clés (accueil, services, tarifs, contact, prise de rendez-vous).
2. **SEO de base** : titres, méta-descriptions, titres H1/H2, images (alt), URL, sitemap, robots.
3. **Données structurées** : schéma adapté (entreprise locale, FAQ, produit).
4. **Performance et mobile** : chargement, affichage mobile, éléments bloquants.
5. **Cohérence** : mêmes prix, horaires, adresses et offres sur toutes les pages. Citer les deux pages en cause.
6. **Conversion technique** : visibilité du bouton d'action, longueur des formulaires, suivi installé ou non.

## Règles
- Chaque constat : gravité (critique, élevée, moyenne, faible), source (URL), action corrective, bénéfice attendu.
- Si une donnée réelle (Search Console, GA4) est disponible, elle prime sur la lecture du site.
- Ne rien affirmer sans l'avoir observé ; sinon le marquer « à vérifier ».
