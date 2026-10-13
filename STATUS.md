# État du studio — 2026-10-13 (50e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 50e cycle a été lancé à la demande de Samuel (17:53 CEST), juste après le 49e.

## Messages de Samuel traités (projet)
- Fil du projet, 17:53 CEST : « non pour #238, lance un autre cycle, on a encore des tokens » → Q340 tranchée (non), 50e cycle lancé.
- Fil « Avancement IA et choix de destination », 18:33 CEST : « Q328 et 329 je suis tes recos » → Q328 et Q329 tranchées.
- Action faite par Samuel : `owner-approved` retiré puis reposé sur B1 (#188), fusionnée à 18:02 CEST.
- #studio : aucun nouveau message depuis le 49e cycle.

## Fait
- Fusionnées : **F10c (#236)** après sa correction 2 ; **B1 (#188)**, socle base de données ; statut du 49e cycle (#239).
- **`main` rouge après B1** : B1 avait été approuvée sur une base antérieure au régime P0c1 ; 6 tests de confinement échouent (84 capacités, `process.env` entier, fermeture transitive, `package.json`). Ticket #242 ; correctif en avant (rôle `data`), sans toucher `.github/` : **PR #244**, 484 tests de confinement au vert, lignes ajoutées marquées « Verdict Sécurité demandé ». Pas de retour de B1 : il toucherait `.github/workflows/` et attendrait Samuel. Deuxième cas du jour pour Q342.
- **F7b (#245, ticket #240)** : « Déplacer une étape » (feuille « Déplacer {nom} », `useRadioGroup`, `DayBadgeGroup`, contrats `MoveRequest`, `MoveOptions`, `MoveDraft`). En revue ; captures à régénérer par le robot.
- **Spec B3 (#243, ticket #241)** : compte et connexion ; propose B3a, B3b, B3c ; signale que F8b (code de l'adaptateur `auth` simulé et de `/connexion`) n'a pas de ticket et doit précéder B3c. En revue.

## En cours
- En revue : #244 (correctif de `main`, prioritaire), #238 (code de #222), #245 (F7b), #243 (spec B3).

## Bloqué
- **Toutes les PR de code** : CI rouge tant que #244 n'est pas fusionnée.
- **#238** : fusion de #244 d'abord (mêmes listes du régime), puis Q341.
- **PR de code de #221** : après la fusion de #238 (mêmes fichiers).
- **B5a** : fin de la fenêtre de veto de 0041 (2026-10-15), Q333 et Q337.
- **Code de B3** : fusion de #243, puis décision sur le découpage (Q343) ; B3c attend F8b.
- **Exécutions réelles de P0 (P0r2)** : code de #221 et #222 ; Q330.

## Prochain cycle
1. Suivre la revue de #244 et la faire fusionner en premier ; puis #238 fusionne `main`.
2. Corrections éventuelles de #245, #243, #238.
3. Après la fusion de #238 : code de #221 (rôle `ia`).
4. Après la fusion de #243 : décision écrite sur le découpage de B3 (Q343), tickets B3a et F8b (avec l'entrée « Créer un voyage » sur l'accueil), F8b après F7b.
5. Après le 2026-10-15 et Q333 : tickets B5a, B5b, B5c et lancement de B5a.

## Décisions attendues de Samuel
- **Action** : plafond de quota de Maps JavaScript API (Q263).
- **Nouvelle** : Q345 (avec le Tech Lead) : essai d'un en-tête sur une préversion protégée du staging.
- **Déjà posées** (recommandations dans les questions) : Q330, Q332, Q319, Q321, Q322, Q323, Q325, Q317, Q296, Q297, Q294, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO-1 à 13 de la spec B3 (#243, une fois fusionnée) ; décision 0041 (découpage de B5, dérogation limitée à « une tâche = une PR ») ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et son amendement (#211), 0037, 0040, décisions B1-PO-1 à 6 (#185), B1 désormais fusionnée ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q343 (CEO), Q344 (Tech Lead et Sécurité), Q345 (Tech Lead et Samuel), Q346 (UX/UI) : spec B3.
- Q347 et Q348 (Sécurité et Tech Lead) : correctif de `main` après B1.
- Q349 (Tech Lead et UX/UI) et Q350 (Product owner) : F7b.
- Mises à jour : Q340, Q328, Q329 tranchées par Samuel ; Q342 (deuxième cas).

## Part d'usage estimée
- 50e cycle : 3 sous-agents, 3 au plus en même temps :
  - code de F7b (environ 1 M de jetons) ;
  - spec B3 (0,28 M) ;
  - correctif de `main` après B1 (0,29 M).
- S'y ajoute le travail du CEO (environ 0,15 M).
- Total : environ 1,7 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
