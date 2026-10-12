# État du studio — 2026-10-12 (39e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, #165) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle (consigne de Samuel du 2026-10-12 10:29)

## Messages de Samuel traités (#studio et projet)
- **2026-10-12 10:29** (#studio) : le CEO tourne dans le projet Claude « Vadrouille », 3 fils au plus ; chaque résumé indique le nombre de fils lancés et leur consommation estimée. Appliqué.
- **2026-10-12 10:35** (#studio) : Q24 (Neon à Francfort), Q249, Q250, Q241, Q252, P0-Q5 (consignées dans la décision 0028, #149) ; Q253 et Q254 (oui, `CLAUDE.md` aligné dans #27) ; **Q245** (PR qui touche `.github/workflows/` : signalée dans #studio, attend `owner-approved` posé par Samuel ; contrôle à ajouter à `techlead-gate`, ticket **#163**).
- **2026-10-12 11:09 à 11:12** (fil « Parcours cible du MVP ») : **toute la chaîne MVP est construite maintenant**, B1 à B12, révision et pendant/après le voyage compris ; G0 reste la condition commerciale. Consigné dans la **décision 0029** (#165), avec `CONTEXT.md` et la roadmap.
- **2026-10-12 12:47 et 12:48** (fil « Routine cycle du studio ») : Q257 (exécutions réelles de P0 en ligne, préversion Vercel protégée et Neon, jamais sur son poste ni en production) ; Q256, Q258, Q259, Q260 (recommandations suivies). Q261 et Q262 étaient déjà tranchées dans le fil photos (11:12).
- **2026-10-12 vers 11:35** : projet Neon gratuit créé (Francfort, Postgres 17, Neon Auth désactivé), relié à Vercel pour Development et Preview. Q24 tranchée.
- Le message de 10:32 est le résumé du 38e cycle (#157).

## Fait
- Fusionnées depuis le 38e cycle : **F13, spec des photos (#160)** ; **bug #159, carte refusée sur les previews (#161)**, F4-Q1 tranchée par le joker `*.vercel.app` (Q263) ; **B0c (#156)** ; note de version v2026.10.12-09 (#166).
- Corrections du cycle : #161 (1 bloquant et 4 mineurs, fusionnée ensuite) ; **#27, dernière passe** (voir « En cours »).
- Tickets créés : **#162 (F8a)**, **#163 (Q245, `techlead-gate`)**, **#164 (décision 0029)**.

## En cours
- **F8a (#167, ticket #162)** : écrans 1 et 2 de la création, brouillon en mémoire, `SegmentedControl` déduit, `brief_completed`, R1 et R2 à l'inventaire des routes. Critères [a] couverts. `update-snapshots` posé pour régénérer les références visuelles par la CI (0004) ; en revue.
- **B0, partie Q5 (#27, ticket #22)** : au-delà de la règle des deux corrections. **Décision du CEO avec le Tech Lead : découpage**, une passe unique sur une liste fermée (`0c4d158`) : plan gardé en mémoire (étapes e et f réunies, `plan_drafts` supprimé), compteurs d'ancrage retirés, `place_coordinates` sans `UPDATE` avec rôle `vadrouille_fn_coords` (0007 amendée), exception d'appartenance dans 0011 § 1, citation de Samuel pour `CLAUDE.md`. S4 et S5 partent à Samuel (Q258, Q259). Si cette passe échoue, #27 est fermée et le blocage documenté. De nouveau en revue.
- **Décision 0029 (#165, ticket #164)** : correction 1 faite (tableau, B5 après B2, B1 en local, B7 à B9 après #149 et #27, précédence). De nouveau en revue.
- **Spec P0 (#149, ticket #147)** : découpée par le Tech Lead (P0a1 et P0b1 seulement) ; décision 0028 ajoutée ; revue du head `e469a07` : Tech Lead conforme, Sécurité 1 bloquant. Suivie par le fil « Correction spec P0 ».
- **F11a (#152)** : revue conforme sur le head `62eada5`, mais `techlead-approved` absent (retiré par la porte juste avant la revue) ; revue relancée (`needs-review` reposé).
- `pnpm verify` en local : vert sauf les captures visuelles (rendu du conteneur, 0004). La CI fait foi. Docker ne tourne pas dans ces sessions : les tests de base de données ne passent qu'en CI.

## Bloqué
- **Exécutions réelles de P0 (P0a2, P0a3, P0b2)** : Q256 et Q257 tranchées ; attendent une spec suivante (en ligne, préversion Vercel protégée et Neon).
- **B7 à B9** : attendent la fusion de #149 et de #27 (décision 0029).

## Prochain cycle
1. Suivre #27, #149, #152, #165, #167 ; après toute correction, retirer puis reposer `needs-review` (la revue ne se déclenche qu'à l'ajout du libellé).
2. Après #149 : **P0a1** et **P0b1**.
3. Après #165 : **B1** (data, en local) et **B2** (backend) en parallèle, puis B5 ; spécification du Product Owner d'abord si la ligne du handover ne suffit pas. Ordre par défaut : plan des cycles 39 à 58 (fil « Plan des 10 à 20 prochains cycles »).
4. **#163** (Q245, `techlead-gate`) : la PR touche `.github/workflows/`, elle attend `owner-approved` de Samuel.
5. F7a après F8a (`SegmentedControl.tsx`), puis F10a.

## Décisions attendues de Samuel
- **Action** : plafond de quota journalier sur Maps JavaScript API dans Google Cloud Console (Q263), la clé acceptant tout `*.vercel.app`.
- **P0** : P0-Q6 (seuils G0).
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44 (règle provisoire en attendant), Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : décisions déléguées de #27 (0011, sauf S4 et S5) si fusionnée ; « Évolution » de 0004 (#148) ; décisions déléguées P0-PO-2, 3, 5 à 8 et 11 (#149, si fusionnée) ;
  - avant le 2026-10-14 : décision 0025 (#134) ;
  - avant le 2026-10-13 : décisions 0017, 0019, 0023, 0024, écarts de F9a et de F5b, Q182, F10-PO-1 à F10-PO-22 et Q185, 0012, F7-PO-20 et F7-PO-21, F8-PO-18 à F8-PO-22.

## Part d'usage estimée
- 39e cycle : 4 sous-agents lancés par la routine (correction de #161, F8a, avis du Tech Lead sur #27, dernière passe de #27), 3 au plus en même temps ; la décision 0029 et ce statut sont écrits par le CEO. Environ 1,2 M de jetons (estimation : 0,35 M pour F8a, 0,22 M pour #27, 0,09 M chacun pour #161 et l'avis, le reste pour le CEO).
- Part de l'abonnement : impossible à mesurer depuis la routine.
