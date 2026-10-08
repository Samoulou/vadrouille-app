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
| 5 | F3 | Composants de la ligne du jour | frontend | F1, F2 | Spécifiée — prête |
| 6 | B0 | Handover back-end (contrats serveur, schéma, workflows) | product-owner, tech-lead | F1 | Spécifiée (#17, #18, #20) — handover en revue (#27) |
| 7 | F4 | Carte Google Maps | frontend | F3 | Spécification en revue (#25) ; attend F3 |
| 8 | F5 à F12 | Suite du handover front-end | frontend | voir handover | Autorisés sur données simulées |

En phase 0 (périmètre élargi par Samuel le 2026-10-08), le CEO peut engager tout le front F1 à F12 sur données simulées et le handover back-end. Restent interdits avant G0 : comptes et services payants, clés de production, mise en production.
