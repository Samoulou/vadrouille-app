# 0163 — Vercel sur l'offre gratuite : seules `main` et `p0-reel` sont construites

Statut : **proposée par l'agent release, définitive à la fusion (0093)**. Elle applique une décision de Samuel (offre gratuite, argent : réservé à Samuel, « Qui décide quoi » de `docs/CONTEXT.md`) ; la forme technique (`ignoreCommand`) relève de l'outillage et passe par la revue du Tech Lead. À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment.

Date : 2026-11-09 · Rédacteur : agent release · Ticket : #1050 · Amende, sans la réécrire : 0002 (hébergement Vercel, « préversion par PR ») ; pointeurs ajoutés dans 0138 § 8 et 0140 (« Questions nouvelles », point 1).

**Ce que cette décision n'engage pas.** Aucun réglage du compte ni du projet Vercel (tableau de bord, protection, variables), aucune dépense, aucun changement de `.github/`. Rien de ce qui revient à Samuel n'est tranché : le passage à une offre payante reste à lui.

## Constat

1. **Samuel ne paie pas Vercel pour l'instant** (ticket #1050, 2026-11-09 05:42 UTC) : le compte reste sur l'offre gratuite (Hobby) jusqu'à nouvel ordre. La formule du compte, « non notée dans le dépôt » (`docs/handovers/comptes-externes.md`, § 1 et « Questions nouvelles »), est donc connue : Hobby.
2. **Quota de déploiements.** L'offre gratuite admet 100 déploiements par jour au plus. Le 2026-11-01, Vercel a refusé un déploiement avec le code `api-deployments-free-per-day`.
3. **Constructions inutiles.** Chaque poussée sur une branche `claude/…` déclenchait une construction de préversion. Ces préversions ne servent à rien dans le circuit du studio : la vérification d'une PR (`verify`, `docker`, `db`) tourne dans GitHub Actions (`.github/workflows/ci.yml`), et les contrôles obligatoires de `main` sont `verify`, `docker` et `gate`, tous de GitHub Actions (règle du dépôt, relevée par `gh api repos/Samoulou/vadrouille-app/rules/branches/main` le 2026-11-09). Aucun contrôle de Vercel n'y figure.
4. **Autres limites de l'offre gratuite**, constatées par Samuel :
   - journaux d'exécution conservés **1 heure** seulement ;
   - **pas de protection des préversions** : une préversion construite est publique ;
   - **usage commercial interdit** (déjà noté dans `docs/handovers/comptes-externes.md`, § 2, compte 6, et § 4, point 6).

## Décision

1. `vercel.json` porte `"ignoreCommand": "sh scripts/vercel/ignore-build.sh"` en plus de `"regions": ["fra1"]` (0002, amendement du 2026-10-14, inchangé).
2. `scripts/vercel/ignore-build.sh` lit `VERCEL_GIT_COMMIT_REF` et suit la convention de Vercel (sortie 0 = construction ignorée, sortie 1 = construction lancée ; [documentation `vercel.json`, `ignoreCommand`](https://vercel.com/docs/project-configuration/vercel-json), lue le 2026-11-09) :
   - `main` (adresse de démonstration, environnement « Production » de Vercel) et `p0-reel` (essais réels, 0055 § 5) : construites ;
   - toute autre valeur, comparée exactement (casse et espaces compris), et une variable absente ou vide (déploiement sans Git) : ignorées. Échec fermé du côté du quota.
3. `vercel.json` l'emporte sur le réglage « Ignored Build Step » du projet : aucun réglage du tableau de bord n'est nécessaire ni modifié. Hors de Vercel, le fichier est ignoré : la portabilité de 0002 est intacte.
4. Tests : `tests/unit/vercel-config.test.ts` (clés admises de `vercel.json`, commande exacte) et `tests/unit/vercel-ignore-build.test.ts` (sorties du script).

## Ce qui change

- **Constructions limitées.** Plus de préversion par PR : la phrase « préversion par PR » de 0002 ne vaut plus tant que le compte reste gratuit. Une PR se juge sur la CI de GitHub Actions et, pour l'interface, sur les captures de la CI (`test:visual`). Le statut « Vercel » d'une PR `claude/…` apparaît comme construction ignorée ; il n'est pas obligatoire.
- **Journaux 1 h.** Un incident de `main` ou de `p0-reel` doit être relevé dans l'heure (`get_runtime_logs`, `get_runtime_errors`), sinon ses journaux sont perdus. Les notes de version et les vérifications de staging de l'agent release le mentionnent quand un journal manque.
- **Préversions publiques.** Sans protection, la préversion de `p0-reel` est publique. Son code d'accès doit à lui seul bloquer tout appel payant : vérification confiée à la Sécurité, **ticket #1049**. Selon le ticket #1049 (rédigé par Samuel), le déploiement de `p0-reel` est aujourd'hui hors ligne ; il n'est pas remis en ligne avant le verdict de #1049. Point d'attention : avec cette décision, toute mise à jour de `p0-reel` relance une construction, donc une préversion publique. Aujourd'hui, `p0-reel` n'avance que par une PR de tête `main` fusionnée par Samuel (dernière : #837, `8a928a7`, 2026-10-29) ; la mise à jour automatique de 0093 point 6 (tâche C) n'est pas livrée, et le jour où elle l'est, elle redéploierait `p0-reel` sans geste de Samuel (question au Tech Lead et à la Sécurité, ci-dessous). Les conditions qui supposaient la protection des déploiements (0138 § 8, préversion `mvp-essai` ; 0140, question 1 à Samuel) ne sont plus remplies tant que le compte reste gratuit.
- **Branche `mvp-essai`** (0138, 0140) : elle n'existe pas aujourd'hui ; si elle est créée, elle ne sera **pas** construite par Vercel tant que cette décision n'est pas amendée (voir « Quand revoir »).

## Ce qui reste à Samuel

1. **Passer à une offre payante (Pro) avant le lancement public** : l'offre gratuite interdit l'usage commercial (`docs/handovers/comptes-externes.md`, § 4, point 6). Question à poser à Samuel avant toute bêta payante ou ouverture publique.
2. Décider si la protection des préversions (offre payante) redevient une condition de l'essai `mvp-essai` (0138 § 8).

## Quand revoir

- Le compte passe à une offre payante (le quota cesse d'être la contrainte ; la protection des préversions revient).
- Une autre branche doit être servie par Vercel (par exemple `mvp-essai`) : amendement de cette décision, ajout de la branche au script et à son test.
- Vercel change la convention de sortie de `ignoreCommand` ou le nom de `VERCEL_GIT_COMMIT_REF`.
