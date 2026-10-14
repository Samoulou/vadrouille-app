# 0002 — Hébergement sur Vercel, portabilité préservée

Statut : accepté · Date : 2026-10-07 · Décideur : Samuel

## Contexte
Alternative étudiée : Coolify (plateforme de déploiement libre, auto-hébergée sur un serveur loué). Moins chère à fort trafic et compatible avec un hébergement en Suisse, mais l'entretien du serveur revient à l'équipe, et les routines du studio n'ont pas de connecteur pour la piloter.

## Décision
- Vercel pour le staging et la production : aucune exploitation de serveur, préversion par PR, connecteur utilisé par les routines, workflows durables natifs.
- Portabilité préservée dès le socle :
  1. Next.js standard (`output: "standalone"`), aucune API réservée à Vercel dans le code métier ;
  2. aucun stockage propre à Vercel (KV, Edge Config) : Postgres pour les données, stockage objet compatible S3 si besoin ;
  3. un `Dockerfile` maintenu et construit à chaque PR par la CI.

## Quand revoir cette décision
- La facture Vercel dépasse le coût d'un serveur géré équivalent de façon durable.
- Un client (agence) exige un hébergement en Suisse.
- Des tâches de fond dépassent ce que les workflows Vercel permettent.

## Conséquences
Basculer vers Coolify ou un autre hébergeur reste un chantier d'une journée environ : variables d'environnement, image Docker, stockage de l'état des workflows à fournir (à vérifier au moment de la bascule).

## Amendement du 2026-10-14 — région des fonctions
Décision de Samuel, 2026-10-14 14:13 UTC (carte de décision du fil du projet) : « Francfort ». Les fonctions serveur de Vercel tournent en `fra1` (Francfort) au lieu de `iad1` (région par défaut de Vercel, relevée par la Sécurité sur la préversion `p0-reel`) : au plus près de la base Neon de Francfort (Q24) et traitement des données en UE. Le surcoût de calcul (environ 40 % sur la formule Pro, tarifs régionaux de Vercel) est accepté.
- Forme : `vercel.json` à la racine, `"regions": ["fra1"]` ([documentation de Vercel](https://vercel.com/docs/functions/configuring-functions/region), lue le 2026-10-14 : le fichier l'emporte sur le réglage du projet ; une seule région est permise sur toutes les formules). Aucun `preferredRegion` ni `functions` par route : toutes les fonctions suivent la région du projet. Le middleware de routage de Vercel reste déployé partout (comportement de la plateforme).
- Aucun réglage du compte ni du tableau de bord, aucun KV ni Edge Config ; le fichier ne porte que la région (`tests/unit/vercel-config.test.ts`). La portabilité est intacte : hors de Vercel, le fichier est ignoré.
- Contexte : décision 0058 (PR #320), section région ; ticket #321.
