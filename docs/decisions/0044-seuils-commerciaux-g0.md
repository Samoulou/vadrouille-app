# 0044 — Décision de Samuel : seuils commerciaux de G0 en mesures en ligne

Statut : décision de Samuel (phases G0 à G3, « Qui décide quoi » de `docs/CONTEXT.md`) · Date : 2026-10-13 · Décideur : Samuel · Amende `docs/roadmap.md` (G0) et `docs/produit/cadrage-v5.md` § 5

Numérotation (vérifiée le 2026-10-13) : `main` va de 0001 à 0043 ; aucune branche `claude/…` n'ajoute de fichier `0044`.

## Contexte
La décision 0043 § 4 fait de Vadrouille, pour les particuliers, un produit purement numérique, sans intervention humaine. Les seuils commerciaux de G0 (« 30 prospects contactés, 10 échanges ») supposaient des contacts et des entretiens. La spécification C1 (question 1) proposait de les remplacer par des mesures en ligne.

Le 2026-10-13 à 17:11 UTC, dans le fil de projet « Commercialisation en parallèle du développement », Samuel a répondu « Ok remplace par ca » à la proposition : « 300 visites de la page de prévente et 10 réponses au questionnaire », en gardant « 5 préventes payées dont 3 hors de tes proches ».

## Décision
Le volet commercial de G0 est atteint quand ces trois seuils le sont :
1. **300 visites** de la page de prévente ;
2. **10 réponses** au questionnaire en ligne (`specs/C1-prevente.md`, livrable 3) ;
3. **au moins 5 achats ou préventes payés**, dont au moins 3 hors cercle proche (inchangé).

Les autres conditions de G0 (prototype de recherche exploitable sur Édimbourg, présentation comprise par 4 testeurs sur 5) ne changent pas.

## Conséquences
- `docs/roadmap.md` et le cadrage § 5 sont mis à jour dans la même PR.
- La page de prévente doit compter ses visites (tâche ultérieure, outil de mesure à proposer à Samuel s'il engage un compte externe ou des données personnelles).
- Le CEO reporte la question dans `QUESTIONS.md` comme tranchée.
