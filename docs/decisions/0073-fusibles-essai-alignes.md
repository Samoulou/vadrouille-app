# 0073 — Fusibles de l'essai alignés sur ceux de l'exécution comptée

Statut : décidée par Samuel (argent et phases G0, réservés à Samuel, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion. La mise en œuvre est rédigée par ia-recherche.

Date : 2026-10-16 · Décideur : Samuel · Rédacteur : ia-recherche · Source : carte de décision du fil projet « Routine cycle du studio », réponse de Samuel du 2026-10-16 à 14:34 UTC · Renvois : 0063 (points 8 et 9), 0071, 0072 (point 4)

## Contexte

Jusqu'ici, l'essai d'intégration (`prototype/config/essai.json`) avait ses propres plafonds par exécution, environ un dixième de ceux de l'exécution comptée (0063, points 8 et 9) : 0,30 USD de modèles, 6 recherches web, 15 pages, 12 candidats, 17 Text Search, 14 Place Details, 3 requêtes de matrice Routes, 120 éléments, 5 min. Avec ces plafonds, le contrôle au lancement de 0072 (point 4, `brief_hors_plafonds`) n'admettait en essai que le brief court : les trois briefs de six jours ne tenaient ni dans le plan Routes ni dans le budget de fiches. Depuis 0071, Samuel lance autant d'essais qu'il le veut et garde la main sur ses tests.

Question posée sur la carte : « Mettre les mêmes fusibles en essai qu'en exécution comptée ? »

Réponse de Samuel, copiée telle quelle (option choisie, puis son texte) :

> « Oui, les aligner »
>
> « Tous les briefs passent en essai ; seul un voyage qui coûterait plus de 3 USD d'IA ou 500 trajets est arrêté. »

## Décision

1. **Plafonds par exécution de l'essai = ceux de `mode-reel.json`** : `coutUsd` 3, `recherchesWeb` 40, `pagesLues` 100, `candidatsTrouves` 85, `placesTextSearch` 90, `placesDetails` 90, `routesRequetes` 30, `routesElements` 500, `dureeMs` 900 000 (15 min). `fiches` et `coutsEstimesMicros` étaient déjà égaux et le restent. `essai.json` est désormais identique à `mode-reel.json`.
2. **Bornes du code** : `BORNES_ESSAI` (`src/prototype/config.ts`) prend les mêmes valeurs ; un test vérifie que `essai.json` égale `mode-reel.json` et que chaque borne de l'essai égale le plafond commité du mode réel.
3. **Fusible de l'agent de recherche** : dans `prototype/config/recherche-essai.json`, `toursMax` passe de 3 à **6**, la valeur de `recherche.json`. Il borne le nombre d'appels de modèle de la recherche (`1 + toursMax`, 0072 point 2), quelles que soient les réponses du modèle : c'est un fusible.
4. **Profil de recherche de l'essai inchangé** : `ciblesParCreneau` (6, 5, 1), `totalCandidats` (12) et `tailleLotNotation` (9) décrivent ce que l'essai cherche, pas un arrêt ; ils restent ceux de l'essai, comme les modèles (`modeles.json`, communs aux deux modes).
5. **Le contrôle au lancement de 0072 (point 4) reste** : `briefTientDansLeMode` admet maintenant les quatre briefs en essai ; il refuserait encore un brief qui ne tiendrait pas dans les plafonds (test avec les anciens plafonds de l'essai).

## Ce qui change

- Tous les briefs commités passent en essai. Seul un voyage qui dépasserait un plafond par exécution est arrêté (3 USD de modèles, 500 éléments Routes, et les autres plafonds du mode réel).
- Réserve Google d'un essai au prix plein (Q329) : 90 × 0,020 + 500 × 0,005 = **4,30 USD**, comme une exécution comptée (0,88 USD auparavant).

## Ce qui reste

- **Aucune limite de nombre** : ni jour de quota, ni décompte, ni enveloppe ne refusent un essai (0071, inchangée). Les plafonds alignés ici sont **par exécution**.
- L'essai **ne compte toujours pas pour G0** ; les autres différences entre les modes (mode écrit en base, rapport, décompte affiché, profil de recherche) sont inchangées.
- Valeurs antérieures de l'essai : 0063, points 8 et 9 (historique, remplacées par cette décision).

## Quand revoir

Quand Samuel le demande, ou si un essai doit de nouveau coûter moins qu'une exécution comptée.
