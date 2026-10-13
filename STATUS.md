# État du studio — 2026-10-13 (48e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 48e cycle est le cycle planifié de 14:07 CEST.

## Messages de Samuel traités (projet)
- #studio : aucun nouveau message depuis le 47e cycle.

## Fait
- Fusionnée : **spec P0-suite-2 (#223)** après sa correction 1 (`placeId` retiré de l'état des étapes, choix délégués devenus propositions D19 à D24 au Tech Lead et à la Sécurité, exigence 6 et Q287 rendues à Samuel, positions réécrites à chaque exécution, aucun résultat dérivé de Google stocké).
- **B1 (#188)** : quatrième tentative strictement bornée, décidée avec le Tech Lead (Q327) : normalisation des chemins alias dans `ligne/no-p0-server-modules`. La description de la PR, écrasée par erreur par celle de P0c1, est réparée (« Closes #184 » au lieu de « Closes #215 »). En revue.
- **P0c1 (#217)**, correction 2 (la dernière) : doubles « original » normalisés, `Reflect`, `Proxy` et `Object` qualifiés refusés, `node:vm` retiré de `sw-route.test.ts`, lignes 0040 D6 bornées en nombre ; 484 tests du régime. En revue.
- **F7a (#227, ticket #224)** : ouverte (écran 14 « Remplacer », `ChangeSet`, toast partagé), puis correction 1 : le mot « aperçu » retiré de l'interface, contour du choix invalide, boutons hors ligne, état du programme en mémoire stable, garde contre le double clic. En revue.
- **Spec B5 (#229, ticket #228)** : moteur sans IA, découpé en B5a, B5b et B5c (à valider par le Tech Lead, Q333). En revue.
- Tickets fermés, déjà livrés : #141 (F10b, #212), #163 (T18, #199), #195 (P0a1 bis, #216).

## En cours
- En revue : #188, #217, #227, #229.

## Bloqué
- **Fusion de P0c1 (#217)** : verdicts de la Sécurité (Q326) et du Tech Lead (Q336).
- **P0c2** : réponse de Samuel à P0c-Q2 (texte de la routine de revue R2).
- **Exécutions réelles de P0** : P0c1, P0c2, #221 et #222, puis réponses de Samuel à Q324, Q328, Q329 avant P0r2.

## Prochain cycle
1. Suivre les revues de #188 (si la 4e tentative échoue : découpage de B1, Q327), #217, #227 et #229.
2. F10c (#142), après la fusion de F7a (#227), pour ne pas toucher `fr.json` en même temps.
3. Specs de #221 et #222 (rôle `product-owner`), après la fusion de #217.
4. B5a, après la fusion de la spec B5 (#229) et les réponses du Tech Lead (Q333).

## Décisions attendues de Samuel
- **Actions** :
  - plafond de quota de Maps JavaScript API (Q263) ;
  - **#188 (B1)** : une fois la nouvelle revue approuvée, retirer puis reposer `owner-approved` (la PR a reçu de nouveaux commits).
- **Nouvelles** (recommandations dans les questions) :
  - Q324 : où garder les positions des lieux ; **bloque P0r2** (recommandé : le cache de coordonnées déjà autorisé) ;
  - Q328 : ce que couvrent les 3 USD par exécution (recommandé : modèles et recherche web) ;
  - Q329 : comment compter l'enveloppe jusqu'à G0 (recommandé : tout, dès le premier appel réel) ;
  - Q330 : unité du quota Routes, à lire dans la console Google ;
  - Q332 : règle R1 pour un lieu ajouté par la personne (recommandé : vérifier seulement qu'il existe et n'est pas fermé).
- **Déjà posées** : Q319, Q321 (élargie à `DATA_ADAPTER`), Q322, Q323, Q325, Q317, Q296, Q297, Q294, Q288, P0c-Q2.
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
  - avant le 2026-10-15 : décisions B2-PO de la spec B2 (#198), décisions B5-PO-1 à 15 de la spec B5 (#229, une fois fusionnée) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q327 (CEO et Tech Lead, tranchée) : quatrième tentative bornée pour B1.
- Q328 à Q330 (Samuel) et Q331 (Sécurité) : spec P0-suite-2.
- Q332 (Samuel) et Q333 (Tech Lead) : spec B5.
- Q334 (Product owner et UX/UI) et Q335 (Tech Lead) : F7a.
- Q336 (Tech Lead) : P0c1.
- Mises à jour : Q319, Q321, Q323, Q324, Q325 (spec fusionnée), Q326 (`node:vm` retiré), Q236 (plage de lignes corrigée).

## Part d'usage estimée
- Entre les 47e et 48e cycles : code de F7a (1,1 M de jetons), troisième tentative de B1 (0,12 M), alignement de P0c1 sur 0040 (0,09 M).
- 48e cycle : 6 sous-agents, 3 au plus en même temps :
  - consultation du Tech Lead sur B1 (0,07 M) ;
  - quatrième tentative de B1 (0,09 M) ;
  - correction 1 de la spec P0-suite-2 (0,19 M) ;
  - correction 2 de P0c1 (0,23 M) ;
  - correction 1 de F7a (0,18 M) ;
  - spec B5 (0,29 M).
- S'y ajoute le travail du CEO (environ 0,15 M).
- Total : environ 1,2 M de jetons pour le cycle (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
