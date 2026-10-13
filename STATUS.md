# État du studio — 2026-10-13 (47e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 47e cycle est le cycle planifié de 11:07 CEST.

## Messages de Samuel traités (projet)
- #studio : aucun nouveau message depuis le 46e cycle.

## Fait
- Fusionnées :
  - **B2 (#219)**, code des évolutions des contrats, après sa correction 1 : une seule source pour le jour de la semaine (`weekdayOf`, `requireWeekday` dans `src/contracts/values.ts`), 8 mineurs traités, 34 références visuelles régénérées par la CI ;
  - **décision 0039 (#214)** après sa correction 1 (clés de la vue partagée alignées sur B2, amendement A5) : Q144, Q146, Q284 et Q306 tranchées ;
  - **P0a1 bis (#216, ticket #195)** après sa correction 1 : `import.meta.env` refusé partout ;
  - **F10b (#212)** après la fusion de `main` qui suivait 0039 ;
  - statut du 46e cycle (#218) ; note de version (#225).
- **B1 (#188)** : correction 2 (garde `no-restricted-imports` sur `@/ai`, `@/research`, `@/grounding`, test de liste fermée), puis troisième tentative décidée avec le Tech Lead (Q318).
- **P0c1 (#217)**, correction 1 : alias de `vi`, fabriques de `vi.mock`, noms secrets, fermeture typée, formes exactes de la ligne A1 (0040 D1) ; lignes ajoutées pour les fichiers de F10b et B2 venus de `main` (Q326). En revue.
- **Décision 0040 (#220)** : le Tech Lead accepte les écarts de P0c1 (A1 transitoire), amende 0038. En correction 1.
- **Spec P0-suite-2 (#223, ticket #173)** : Q268 à Q270 reportées ; 7 nouvelles questions (Q319 à Q325). Changements demandés par le Tech Lead (5 bloquants, dont `placeId` dans l'état des étapes et des choix délégués).
- Tickets créés : #221 (`ia` : retrait de l'écart A1, A6, accès de A7, avant P0r2), #222 (`release` : étalement de `techlead-gate.mjs`, avant P0r2), #224 (F7a).

## En cours
- **F7a (#224)** : écran 14 « Remplacer », `ChangeSet`, toast partagé, en construction.
- **B1 (#188)** : troisième tentative.
- **Décision 0040 (#220)** : correction 1.
- En revue : #217.

## Bloqué
- **Fusion de P0c1 (#217)** : décision 0040 (#220) d'abord, puis verdicts du Tech Lead et de la Sécurité (Q326).
- **P0c2** : réponse de Samuel à P0c-Q2 (texte de la routine de revue R2).
- **Exécutions réelles de P0** : P0c1, P0c2, spec P0-suite-2 (#223), puis #221 et #222 avant P0r2.

## Prochain cycle
1. Correction 1 de la spec P0-suite-2 (#223), rôle `product-owner`.
2. Suivre #188, #217, #220 et F7a ; ordre : #220 avant #217.
3. F10c (#142), après F7a pour ne pas toucher `fr.json` en même temps.
4. Specs de #221 et #222 (rôle `product-owner`), après la fusion de #217 et #220.

## Décisions attendues de Samuel
- **Actions** :
  - plafond de quota de Maps JavaScript API (Q263) ;
  - **#188 (B1)** : une fois la nouvelle revue approuvée, retirer puis reposer `owner-approved` (la PR a reçu de nouveaux commits).
- **Nouvelles** (spec P0-suite-2, en correction ; recommandations dans #223) :
  - Q319 : base du prototype dans un projet Neon distinct (recommandé : oui) ;
  - Q321 : qui pose les mots de passe et secrets de P0 ;
  - Q322 (après la Sécurité) : pas de relecteur obligatoire sur la purge quotidienne ;
  - Q323 : récits et incontournables de Zakynthos ;
  - Q324 : clore Q287 ;
  - Q325 : limite de crédit OpenRouter et plafonds Google ;
  - Q317 : garde des tests de `src/ai` et `src/research` par liste d'autorisation de modules.
- **Déjà posées** : Q296 (texte de la routine de revue R2, recommandation a), Q297 (règle `owner-approved` dans `CLAUDE.md`), Q294, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et son amendement (#211), 0037, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-15 : décisions B2-PO de la spec B2 (#198) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q313 (Product owner), Q314 (UX/UI), Q315 (ia), Q316 (Tech Lead) : suites de B2.
- Q317 (Samuel) : garde des tests de `src/ai` et `src/research`.
- Q318 (CEO et Tech Lead, tranchée) : troisième tentative pour B1.
- Q319 à Q325 : spec P0-suite-2 (Samuel, Tech Lead, Sécurité).
- Q326 (Tech Lead et Sécurité) : verdicts sur P0c1 après sa correction 1.
- Q309 à Q311 : tranchées par la décision 0040 à sa fusion.

## Part d'usage estimée
- Entre les 46e et 47e cycles : code de B2 (0,65 M de jetons, reporté du 46e cycle) et sa correction 1 (0,16 M).
- 47e cycle : 9 sous-agents, 3 au plus en même temps :
  - correction 1 de 0039 (0,11 M) ;
  - correction 2 de B1 (0,11 M) ;
  - correction 1 de P0a1 bis (0,10 M) ;
  - spec P0-suite-2 (0,22 M) ;
  - décision 0040 (0,15 M) ;
  - correction 1 de P0c1 (0,31 M) ;
  - F7a, correction 1 de 0040, troisième tentative de B1 (en cours).
- S'y ajoute le travail du CEO (environ 0,15 M).
- Total : environ 1,9 M de jetons hors travaux en cours (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
