# État du studio — 2026-10-14 (66e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 20:41 CEST (carte de décision, fil du cycle) : **« Accepter »** la recherche web de l'essai par Exa (Q427). Reportée sur #326 ; la limite exacte (jusqu'à 3 mots consécutifs du récit) lui a été signalée juste après.
- 2026-10-14, 20:42 CEST (fil du cycle) : « C'est merge » : #330 fusionnée par Samuel (`main` vers `p0-reel`).
- 2026-10-14, 20:42 CEST (projet) : « Lance le prochain cycle » ; 66e cycle lancé à la demande.
- #studio : aucun nouveau message de Samuel.

## Fait
- Fusionnées : **#330** (`main` vers `p0-reel`, par Samuel), statut du 65e cycle (#334).
- **Relevé de la Sécurité** sur la préversion de `p0-reel` (commentaire sur #330) : déploiement prêt, fonctions à `fra1`, préversion protégée, page de saisie fermée (404, `no-store`). **Écart** : la garde TLS reste fermée, cause `OPENSSL_CONF` (l'hypothèse de 0058 est réfutée). `CI`, `VERCEL_GIT_COMMIT_REF` et la condition 6 ne sont pas encore relevables. `P0_RUN_TOKEN` est de type `encrypted`, relisible par un jeton d'API (Q402, seconde partie).
- **Décision 0060** (#336, ticket #333) : port du cache de positions et purge du MVP (expiration 29 jours, workflow `coords-purge.yml`, rôle dédié). En revue.
- **Décision 0062** (#338, ticket #335) : `OPENSSL_CONF` admise en préversion sous conditions ; exception de 0058 § 4 retirée. En revue.
- **Décision 0061** (#339, ticket #337) : réponses du Tech Lead à la revue de #332 (Q419, Q433 à Q436). En revue.
- **Workflow des migrations** (#332) : correction 1 poussée (0b65293) ; le harnais survit à une liste non vide.
- **P0r3c-3** (#326) : après la correction 2, un bloquant Sécurité (écritures sans espace : un long extrait du récit pouvait partir chez Exa). Le Tech Lead a approuvé. Choix du CEO avec le Tech Lead : **troisième tentative bornée**, correction dans le code (fenêtre par caractères) ; si elle échoue, découpage.

## En cours
- **P0r3c-3** (#326) : troisième tentative bornée (ia-recherche).
- En revue : #332, #336, #338, #339.

## Bloqué
- **Premier essai réel** : P0r3c-3 (#326), puis P0r3c-4 ; 0062 puis son code, nouvelle mise à jour de `p0-reel` par Samuel et nouveau relevé ; P0r3d.
- **Workflow des migrations** : revue de la correction 1 ; `owner-approved` de Samuel ; Q387 (a) et (b).
- **Purge `p0-purge`** : en échec toutes les 6 heures tant que ses secrets sont vides (attendu, Q387).
- **B8c** : fusion de 0060. **B6a** : B3b. **B8a** : B7a, B7c, P0r3c-3. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Après 0062 : ticket du code de la garde (§ 7 de 0062), puis lien à Samuel pour remettre `p0-reel` à jour, puis nouveau relevé (§ 8).
2. Après #326 : P0r3c-4 (avec l'amendement de 0055 § 7 pour le flux Exa accepté).
3. Après 0060 : ticket de B8c (data) ; mise à jour de `docs/roadmap.md` (Q431).
4. Revue de #332 puis `owner-approved` de Samuel.

## Décisions attendues de Samuel
- **Nouvelle** : Q438 (extension de Q321 et Q322 à la purge du MVP, 0060) ; rappel Q402, seconde partie (type de `P0_RUN_TOKEN`).
- **Rappel** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307) ; Q387 (a) et (b).
- **Déjà posées** : Q409, Q410, Q401, Q397, Q394, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
- **Prévente** : Q357 et Q362 ; les documents sont fusionnés (#256).
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO de la spec B3 (#243) et B4-PO de la spec B4 (#248) ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - avant le 2026-10-16 : décision 0047 (découpage de `fr.json`, #269) ; décisions B7-PO de la spec B7 (#288) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, 0057, 0058, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q427 tranchée par Samuel (Accepter, 2026-10-14 18:41 UTC).
- Q438 (Samuel), Q439 (Sécurité, 0060), Q440 (data, 0060), Q441 (CEO, lot de la migration de B8c), Q442 (Sécurité, 8 (c) de #332 : amendement de 0057), Q443 (CEO : P0r3c-3, troisième tentative bornée).

## Part d'usage estimée
- 66e cycle (à la demande) : sous-agents terminés : décision 0060, workflow des migrations correction 1, relevé de la Sécurité, décision 0062, décision 0061 ; 3 au plus en même temps.
- En cours, comptés au 67e cycle : P0r3c-3 troisième tentative.
