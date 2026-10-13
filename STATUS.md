# État du studio — 2026-10-13 (49e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 49e cycle a été lancé à la demande de Samuel (15:49 CEST) ; le cycle planifié de 17:07 CEST l'a prolongé au lieu d'en ouvrir un autre.

## Messages de Samuel traités (projet)
- Fil du projet, 15:25 CEST : « je suis votre reco, cache de coordonnées » → Q324 tranchée (option a), Q287 close.
- Fil du projet, 15:49 CEST : « lance un cycle, j'ai des tokens dispo » → 49e cycle lancé.
- #studio : aucun nouveau message depuis le 48e cycle.

## Fait
- Fusionnées : **spec B5 (#229)** après sa correction 1 ; **décision 0041 (#232)**, découpage de B5 en B5a, B5b et B5c, séquentiel, après sa correction 1 (veto de Samuel possible jusqu'au 2026-10-15) ; **correctif de `main` (#235, ticket #234)**.
- **`main` était rouge** depuis la fusion de F7a (#227) après P0c1 (#217) : le test de confinement refusait 4 accès calculés de `revision.ts`. Toutes les PR de code échouaient. Corrigé par #235 (`deepEqual` réécrit, sans ligne ajoutée aux listes). Question au Tech Lead pour éviter que ça recommence (Q342).
- **Spec P0c-suite-release (#233, ticket #222)** : ouverte, corrigée une fois, fusionnée ; son code (rôle `release`) est ouvert en revue : PR #238 (variables d'environnement de `git` épinglées dans la porte du Tech Lead, deux tests ajoutés).
- **Spec P0c-suite-ia (#231, ticket #221)** : ouverte, corrigée une fois, fusionnée. La décision 0042 qui consigne les réponses du Tech Lead et de la Sécurité (Q339) est fusionnée (#237).
- Ticket #228 (spec B5) rouvert : 0041 le garde ouvert jusqu'à B5c (la fusion automatique l'avait fermé).
- **F10c (#236, ticket #142)** : écran de partage et vue partagée en lecture seule, correction 2 (la dernière) poussée (3f4affc) : tests de C38, mineurs de revue, cible de 44 px du lien d'évitement. Tech Lead, Sécurité et UX/UI approuvent ce head ; fusion automatique quand la CI sera au vert. Reste au Tech Lead : écrire l'amendement de C38 dans `docs/decisions/`.

## En cours
- En revue : #238 (code de #222), #236 (F10c, approuvée), #188 (B1, approuvée, attend Samuel).

## Bloqué
- **B1 (#188)** : approuvée par le Tech Lead et la Sécurité, CI verte ; Samuel doit retirer puis reposer `owner-approved` pour que la fusion automatique parte.
- **B5a** : fin de la fenêtre de veto de 0041 (2026-10-15) et décisions du Tech Lead sur B5-TL-1 à B5-TL-4 (Q333), Q337.
- **PR de code de #221** : prête (0042 fusionnée), mais elle touche les mêmes listes du régime (`capacites.ts`, `process.ts`) que la PR de code de #222 ; elle part après sa fusion.
- **PR de code de #222** : Q341 ; Q340 si Samuel veut `owner-approved`.
- **Exécutions réelles de P0 (P0r2)** : #221 et #222, puis Q328 et Q329 de Samuel.

## Prochain cycle
1. Suivre la CI de #236, la revue de #238 et #188.
2. Après la fusion de la PR de code de #222 : lancer le code de #221 (rôle `ia`).
3. Après le 2026-10-15 et Q333 : ouvrir les tickets B5a, B5b, B5c et lancer B5a.
4. Ensuite, dans l'ordre de `docs/roadmap.md` (lignes 13 et 14) : specs de B3 (compte) et B4 (paiement simulé) par le rôle `product-owner`, si une place se libère.

## Décisions attendues de Samuel
- **Actions** :
  - **#188 (B1)** : retirer puis reposer `owner-approved` (la revue est approuvée, CI verte) ;
  - plafond de quota de Maps JavaScript API (Q263).
- **Nouvelle** : Q340 (recommandé : non, et répondre « non » à Q274).
- **Déjà posées** (recommandations dans les questions) : Q328, Q329 (budget de P0, bloquent P0r2), Q330, Q332, Q319, Q321, Q322, Q323, Q325, Q317, Q296, Q297, Q294, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décision 0041 (découpage de B5, dérogation limitée à « une tâche = une PR ») ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et son amendement (#211), 0037, 0040, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q337 et Q338 (Tech Lead) : spec B5.
- Q339 (Tech Lead, rédaction CEO) : spec P0c-suite-ia.
- Q340 (Samuel) et Q341 (Tech Lead et Sécurité) : spec P0c-suite-release.
- Q342 (Tech Lead) : éviter un `main` rouge après fusion.
- Mises à jour : Q324 tranchée, Q287, Q326 et Q336 closes, Q333 (découpage écrit dans 0041).

## Part d'usage estimée
- 49e cycle : 8 sous-agents, 3 au plus en même temps :
  - correction 1 de la spec B5 (0,13 M de jetons) ;
  - spec P0c-suite-ia (0,15 M) et sa correction 1 (0,10 M) ;
  - spec P0c-suite-release (0,15 M) et sa correction 1 (0,10 M) ;
  - code de F10c (0,38 M), puis sa correction 2 (0,13 M) ;
  - code de #222 (0,11 M) ;
  - correctif de `main` (0,07 M).
- S'y ajoute le travail du CEO (environ 0,25 M), dont les décisions 0041 et 0042.
- Total : environ 1,5 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
