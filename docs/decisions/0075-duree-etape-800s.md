# 0075 — Durée d'une étape de `p0Run` portée à 800 s, part gardée aux étapes suivantes

Statut : proposée par ia-recherche dans la PR du ticket 407 ; le Tech Lead la valide à la revue (choix technique, 0063 point 4 la laissait « à prendre »). Le fait d'entrée (formule du compte) vient de Samuel.

Date : 2026-10-16 · Rédacteur : ia-recherche · Source : diagnostic de l'essai 4 (exécution comptée du 2026-10-16, `edimbourg-1.json`, arrêtée `pipeline_failed`) ; formule Vercel du compte : **Pro depuis le 2026-10-13** (Samuel) · Renvois : 0063 (point 4), 0073, 0002

## Contexte

- 0063 (point 4) fixait l'échéance d'une étape à `début + min(300 s, dureeMs − écoulé) − 30 s`. 300 s était la plus basse des formules, car la formule du compte n'était pas connue.
- Un appel de modèle réserve 124 s (120 s de requête, 2 × 2 s de port). L'étape de recherche n'avait donc que **146 s** pour lancer ses appels de modèle. À l'essai 4, l'agent en voulait davantage : le refus de l'échéance (`cap_reached`) est remonté et a arrêté l'exécution. Le ticket 407 corrige ce point à part : l'agent se termine maintenant proprement à l'échéance.
- La route des étapes reçoit du SDK `maxDuration: "max"` (`@workflow/next` 5.0.2, fichier généré `.well-known/workflow/v1/config.json`). La plateforme résout cette valeur selon la formule, au déploiement : **800 s en Pro** avec Fluid Compute, 300 s en Hobby (documentation Vercel « Configuring Maximum Duration », relevée le 2026-10-15 ; commentaire de `@workflow/core` 5.0.2, `INLINE_OWNERSHIP_LEASE_SECONDS`).
- Aucune configuration du dépôt n'est donc à changer pour la plateforme : `vercel.json` reste limité au schéma et à la région (0002, test `tests/unit/vercel-config.test.ts`). Seule la constante du code qui suppose 300 s doit suivre.

## Décision

1. **`LIMITE_FONCTION_MS` passe de 300 000 à 800 000** (`src/workflows/p0-run.ts`).
2. **Part gardée aux étapes suivantes** (`RESERVE_ETAPES_SUIVANTES_MS`). Avec 800 s par étape, une étape pourrait consommer presque toute la durée de l'exécution (`dureeMs`, 900 s, inchangée, 0073) et priver les suivantes. L'échéance devient :
   `début + min(800 s, dureeMs − écoulé − part gardée) − 30 s`.
   La part gardée vaut 450 s pour la recherche (150 s pour l'ancrage, 300 s pour l'étape finale), 300 s pour l'ancrage, 0 pour l'étape finale.
3. **Conséquences, exécution démarrée à 0 s écoulée** :
   - recherche : échéance à 420 s ; la fenêtre des appels de modèle va jusqu'à **296 s**, contre 146 s avant ;
   - ancrage : au plus `900 − écoulé − 300 − 30` ;
   - étape finale : tout ce qui reste moins 30 s, au plus 770 s.
4. **Fusibles par exécution inchangés** : `dureeMs` 900 000 en essai comme en exécution comptée. La durée relue en base borne toujours chaque étape, et la somme des étapes reste sous `dureeMs`. Les plafonds de coût, de recherches, de pages et de Google ne bougent pas.

## Vérification en mode simulé (`edimbourg-1.json`, 6 jours)

Test `tests/unit/workflows/p0-run-finale.test.ts`, « edimbourg-1.json sous les échéances » : `p0Run` de bout en bout sur les doubles. L'horloge avance de la latence de chaque appel, et la durée écoulée est relue à chaque étape. Résultats (instants depuis le lancement) :

| Latences (modèle, recherche web, page, Places, Routes) | Recherche finie | Ancrage fini | Programme écrit | Lieux trouvés | Fin sur échéance |
|---|---|---|---|---|---|
| 20 s, 8 s, 2 s, 0,5 s, 1,5 s | 182 s | 202 s | 269 s | 35 | non |
| 45 s, 15 s, 5 s, 1 s, 3 s | 300 s | 337 s | 481 s | 35 | oui |
| 100 s, 30 s, 9 s, 3 s, 8 s | 390 s | 465 s | 785 s | 23 | oui |

Les trois exécutions écrivent leur programme. Avec les constantes d'avant 0075, la deuxième se serait arrêtée comme l'essai 4.

Non modélisé : le délai de la file entre deux étapes (quelques secondes).

Risque restant : si la recherche consomme toute sa part (420 s), l'ancrage n'a plus qu'environ 145 s pour ses requêtes Text Search en série (une par candidat, jusqu'à 40, plus un logement). Chaque requête réserve 14 s avant l'échéance. Au-delà de 3 s par requête en moyenne, une réservation serait refusée et l'exécution s'arrêterait (`pipeline_failed`). La latence courante de Places (moins d'une seconde) laisse une large marge.

## Ce qui reste hors du dépôt

- **Fluid Compute** doit être actif sur le projet Vercel (réglage du tableau de bord : Settings, Functions). Sans lui, la formule Pro plafonne une fonction à 300 s, et une étape pourrait être coupée par la plateforme avant son échéance. Fluid Compute est actif par défaut sur les projets créés depuis 2025, et le projet date d'octobre 2026, mais le réglage n'a pas été relevé (l'API lue ne l'expose pas). **À confirmer par Samuel**, sans modification du dépôt.
- `maxDuration: "max"` est résolu au déploiement : la préversion `p0-reel` doit être redéployée après le passage en Pro. Le déploiement de l'essai 4 (`be329fe`, 2026-10-16) est postérieur au passage en Pro.
- Report sur `p0-reel` : Release, après fusion sur `main`.

## Abandonné

- Ajouter `"fluid": true` ou une durée par fonction à `vercel.json` : contraire à 0002 et à son test (le fichier ne porte que la région), et inutile si le réglage du projet est déjà actif.
- Garder 300 s et réduire le délai réservé par appel de modèle (piste b du diagnostic) : ce point reste ouvert pour le Tech Lead, indépendamment de cette décision.
