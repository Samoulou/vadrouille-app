# Roadmap

Pas d'échéance : une phase s'achève quand sa condition de qualité est remplie (cadrage v5, § 7).

## Phases et conditions de passage
| Phase | Condition de passage |
|---|---|
| 0 — Valider | **G0** : 30 prospects contactés, 10 échanges, 5 achats ou préventes dont 3 hors cercle proche ; prototype de recherche jugé exploitable sur Édimbourg ; présentation comprise sans explication par 4 testeurs sur 5 |
| 1 — Construire le cœur | **G1** : parcours complet sur 3 destinations ; R1 à R10 verts ; aperçu en moins de 60 s ; taux de « Pas pour moi » sous 35 % sur le jeu de référence |
| 2 — Bêta payante | **G2** : 8 programmes utilisables sur 10 ; 0 erreur critique ; « Pas pour moi » sous 25 % ; conversion aperçu → paiement mesurée |
| 3 — Décider le modèle | **G3** : libre-service, agences, les deux, pivot ou arrêt |

## Backlog ordonné du studio
| Ordre | ID | Tâche | Rôle | Prérequis | Statut |
|---|---|---|---|---|---|
| 1 | F0 | Socle front (handover § 15) | frontend | — | Fait (#3) |
| 2 | F1 | Contrats Zod et données simulées Édimbourg | frontend | F0 | Fait (#11) |
| 3 | F2 | Composants de base | frontend | F0 | Fait (#19) |
| 4 | P0 | Prototype de l'agent de recherche (script, Édimbourg et Zakynthos, comparaison Claude et Gemini) | ia-recherche | Q9, clé serveur Places/Routes | Attend Q9 et la clé serveur Places/Routes |
| 5 | F3 | Composants de la ligne du jour | frontend | F1, F2 | Fait (#30) |
| 6 | B0 | Handover back-end (contrats serveur, schéma, workflows) | product-owner, tech-lead | F1 | Spécifiée (#17, #18, #20) — handover en revue (#27), bloqué après 2 corrections (Q43) |
| 7 | F4 | Carte Google Maps | frontend | F3 | Fait (spec #25, code #35) |
| 8 | T1 | Décisions déléguées du Tech Lead (Q33, Q36, Q52, Q58, Q60) | tech-lead | — | Fait (#39, ADR 0013) |
| 9 | F6 | Présentation « J'aime / Pas pour moi » | frontend | F1, F2, ADR 0013 | Fait (spec #33, code #44) |
| 10 | F5a, F5b, F5c | Séjour, Journée, Fiche (écrans 11 à 13), une sous-tâche à la fois | frontend | F4, code de F6 (`UndoToast`, `src/analytics`) | F5a fait (#54) ; F5b (#66) bloquée après 2 corrections (Q119) ; F5c après T4 |
| 10 bis | T4 | JavaScript initial de la Journée sous le budget de 200 Ko (Q95) : valeurs des contrats sans Zod côté client, mesure en `zod/mini`, règle de lint, test e2e de budget | frontend | F5b ; avant F5c | Décidée (décision 0016 § 3) ; place exacte fixée par le CEO |
| 10 ter | T7 | Un port Playwright par worktree, `reuseExistingServer: false` (Q107, décision 0017) | frontend | fusion de #65 | Jamais dans le même cycle que F8b (Q113, CEO) |
| 10 quater | T6 | Positions simulées du voyage débloqué d'Édimbourg, pour la carte de la démonstration (Q100, décision 0017) | frontend | fusion de #65 et de F5b (#66) | Jamais dans le même cycle qu'une tâche qui touche `src/mocks` ou `src/adapters` (Q113, CEO) |
| 10 quinquies | T9 | Garde de revue dans `techlead-gate` : échec si `techlead-approved` et `changes-requested` coexistent ou après un nouveau push, logique dans `scripts/ci/` testée (décision 0019, Q117) | backend | fusion de #72 | En tête de la file dès la fusion de #72 (Q125, CEO) |
| 10 sexies | T10 | Marqueurs proches sur la carte : fonction pure `groupMarkers` commune aux deux rendus (décision 0019, Q116) | frontend | F5b, T4, Q123, Q124 | Priorité basse (Q125, CEO) |
| 10 septies | F9 | Débloquer (9) et Programme ajusté (10), paiement simulé : décisions F9-TL (Q132), puis F9a, puis F9b | product-owner, tech-lead, frontend | F6 ; F9b après F7a | Spec fusionnée (#73) ; décisions F9-TL fusionnées (T11, #80, décision 0020) ; F9a en revue (#86) ; F9a jamais dans le même cycle que T4, T6 ou une tâche qui touche `src/contracts` ou `src/adapters` (Q134, CEO) |
| 10 octies | F10 | Pendant le voyage (15), hors-ligne PWA, vue partagée : décisions F10-TL (Q144), puis F10a, F10b, F10c | product-owner, tech-lead, frontend | F5c | Spec (#76) bloquée après 2 corrections (Q163) ; ordre fixé par Q143 (CEO) |
| 10 nonies | F11 | Mes voyages, Après le voyage, états transverses : décisions F11-TL (Q155), puis F11c, F11a, F11b | product-owner, tech-lead, frontend | F11a après F9a et F10a ; F11b après F11a | Spec fusionnée (#81) ; décisions F11-TL fusionnées (T12, #85, décision 0021) ; F11c en revue (#92) ; ordre fixé par Q156 (CEO) |
| 11 | F7 | Suite du handover front-end | frontend | voir handover | Autorisé sur données simulées |
| 11 bis | F12 | Accessibilité, performance, grand écran : F12a (mesure), F12b (Séjour et Journée grand écran), F12c (autres écrans grand écran), F12d (passe finale) | product-owner, frontend | F12a après T4 ; F12b après F5c et F12a ; F12c après F12a ; F12d après F5 à F11 | Spec fusionnée (#91) ; ordre fixé par Q175 (CEO) ; une sous-tâche à la fois |
| 12 | « Signaler une erreur » | Action de la Fiche (écran 13) | frontend | B11 (contrat `StopReport`) | Après B11 (Q66, CEO) |

En phase 0 (périmètre élargi par Samuel le 2026-10-08), le CEO peut engager tout le front F1 à F12 sur données simulées et le handover back-end. Restent interdits avant G0 : comptes et services payants, clés de production, mise en production.
