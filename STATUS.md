# État du studio — 2026-10-12 (40e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 40e cycle a été lancé à la demande de Samuel (12:52 CEST) et a absorbé le cycle planifié de 14:32 CEST.

## Messages de Samuel traités (#studio et projet)
- **2026-10-12 12:49** (fil « Routine cycle du studio ») : question sur les exécutions en ligne de P0. Réponse : presque tout est en place (clés sur Preview, Neon relié, préversions protégées) ; il reste une spec puis une page de test ; rien à faire pour lui sauf le plafond de Q263.
- **2026-10-12 12:52** (même fil, relayé) : « go lancer un cycle avant d'attendre la routine ». Cycle lancé.
- **2026-10-12 13:49** (fil « Correction spec P0 », deux messages) : identifiant propriétaire Neon laissé sur les préversions (P0-Q19, Q271), et clés OpenRouter et Google gardées aussi sur Production (amende Q250). Risque accepté jusqu'à la mise en public ; **décision 0034 (#182)**.
- **2026-10-12 13:58** (fil du projet) : passage de Vercel au plan Pro **ce soir**. En attendant, le quota gratuit de 100 déploiements par jour est atteint (11:53 UTC) : plus de préversions.
- **2026-10-12 14:11** (fil « Plan des 10 à 20 prochains cycles ») : « je suis tes reco » sur **P0-Q6 / Q236**, la grille G0, reportée sur #173.
- #studio : aucun nouveau message depuis le résumé du 39e cycle (12:09).

## Fait
- Fusionnées : **B0 (#27)** après une 3e passe ciblée décidée avec le Tech Lead ; **spec P0 (#149)** ; **décisions du Tech Lead A2 à A7 (#175, décision 0032)** ; **décision 0029, chaîne MVP (#165)** ; **spec B1 (#185)** ; réponses de Samuel (#169).
- Décisions du CEO :
  - #172 : 3e et dernière tentative sur P0r1 (décision 0031 § 4). Si la revue échoue, la rédaction passe au rôle Sécurité.
  - Ordre de fusion de `playwright.config.ts` : F8a (#167) d'abord, les autres PR fusionnent `main` ensuite.
- Tickets créés : #171 (formatage des nombres indépendant de l'ICU), #173 (P0-suite-2, avec la grille G0 de Samuel), #174 (T19), #178 (P0a1), #181 (décision 0034), #184 (B1). #164 est clos.
- Constat (API Vercel, 13:20 CEST) :
  - Neon vise Development et Preview seulement.
  - `main` est déployée automatiquement sur un domaine de production **public**, mais aucun code n'y lit les clés.
  - La décision 0034 exige une garde `VERCEL_ENV=production` avant toute fusion de code qui les lit.

## En cours
- **F8a (#167)** : correction 1 faite (3 bloquants, mineurs 4 à 17), `verify` vert ; en revue.
- **P0a1 (#179 schéma et configuration, #180 script simulé ; ticket #178)** : `verify` vert ; revue Sécurité demandée ; #180 dépend de #179.
- **Spec P0-suite (#172)** : 3e tentative poussée (`d97c72a`), en revue ; fil « Correction spec P0 ».
- **Décision 0034 (#182)** : correction 1 faite (citations des questions, état vérifié, garde de production, passe de sécurité définie) ; en revue.
- **Spec T18 (#183)** : en revue. Ordre de fusion : #177, puis #183, puis la PR de code.
- **F10a (#186, ticket #140)** : écran Aujourd'hui ; captures régénérées par la CI (libellé reposé) ; en revue.
- **B1 (ticket #184)** : code du socle base de données en cours (data).
- **T20 (#177)** : attend le jeton de Samuel et `owner-approved`.
- Contrainte du jour : pas de préversion Vercel jusqu'au passage en Pro ; les contrôles qui en dépendent sont notés bloqués, sans relance.

## Bloqué
- **Exécutions réelles de P0** : après P0r1 (#172), puis P0-suite-2 (#173) et ses exigences d'entrée 1 à 4.
- **B7 à B9** : B0 et la spec P0 sont fusionnées ; il faut encore B1, B2 et P0r1.

## Prochain cycle
1. Suivre #167, #172, #179, #180, #182, #183, #186 et la PR de B1 ; après toute correction, retirer puis reposer `needs-review`.
2. Après #179 et #180 : **P0b1**. Après #172 : spec **P0-suite-2** (#173) par IA-recherche, avec la grille G0 telle quelle.
3. **B2** (backend, spec d'abord), en parallèle de B1 ; puis B5.
4. F7a après F8a ; #171 après F8a ; F10b après F10a.

## Décisions attendues de Samuel
- **Actions** : passer Vercel en Pro (annoncé pour ce soir) ; plafond de quota de Maps JavaScript API (Q263) ; `owner-approved` et jeton sur #177.
- **Nouvelles** : Q268 à Q270 (réglages et plafonds des exécutions réelles), Q272 à Q275 (T18), Q278 et Q279 (Neon staging, rôles sur Preview), Q280 (briefs de P0a1).
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-14 : décision 0025 ;
  - avant le 2026-10-13 : décisions listées au 39e cycle.

## Part d'usage estimée
- 40e cycle : 11 sous-agents, 3 au plus en même temps :
  - fusion de F8a et sa correction 1 ;
  - avis du Tech Lead sur #27 et dernière passe de #27 ;
  - T19 et sa correction ;
  - P0a1 ;
  - spec T18 ;
  - F10a ;
  - spec B1 et code de B1, en cours.
- S'y ajoutent le fil « Correction spec P0 » et le travail du CEO (décisions 0029 et 0034, ce statut).
- Total : environ 2,4 M de jetons (estimation). Les agents mesurés : 0,26 M pour P0a1, 0,22 M pour la correction de F8a, 0,20 M pour la spec B1, 0,17 M pour F10a, 0,12 M pour la spec T18.
- Part de l'abonnement : impossible à mesurer depuis la routine.
