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
