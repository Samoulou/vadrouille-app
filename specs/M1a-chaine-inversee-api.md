# M1a — La chaîne inversée écrit le programme dans la vraie app (adaptateur `api`, composition simulée)

Rédaction : Product Owner · Date : 2026-10-28 · `main` relu : `9073fc6` · Rôle : backend (relecture ia-recherche) · Revue : Tech Lead, Sécurité · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 1, tâche M1a · Ticket : à ouvrir par le CEO.

**Prérequis, dans cet ordre** :
1. cette spécification et le plan fusionnés ;
2. **décision du Tech Lead** (tâche M1-TL du plan) qui répond aux questions T1 à T8 ci-dessous ;
3. **verdict de la Sécurité** (tâche M1-S) sur S1 à S5 ;
4. la migration M1-D, seulement si la décision du Tech Lead en exige une.

Le code ne commence pas avant les points 2 et 3. Si une réponse change le périmètre, le Tech Lead l'écrit dans sa décision, et elle prime sur cette spécification pour les points qu'elle touche.

## 1. Contexte

- **0115 § 5.5** : la chaîne du MVP (B5, B7 à B9) est gelée tant que Samuel n'a pas jugé le prototype inversé, puis le CEO ordonne le report. Samuel a donné son feu vert le 2026-10-28 à 19:45 UTC (« ok bah go hein, tu vas me développer […] TOUS jusqu'à l'étape 9 ») ; le CEO ordonne le report en premier (précision du 2026-10-28).
- **Ce qui marche sur le site d'essai** : `p0Run` (`src/workflows/p0-run.ts`, `etapeProgramme` puis `ecrireVersion`). Le brief saisi est converti par `src/server/p0/depuis-formulaire.ts`, l'entrée du modèle est construite par `entreeProgrammeDepuisBrief` (`src/server/p0/vers-couche-ia.ts`), le programme est rédigé par `creerRedigerProgramme` (`src/ai/rediger-programme.ts`, prompt `programme` v4), lu par `src/ai/sorties.ts` (lecture tolérante, 0111), vérifié par `src/grounding` (Text Search par nom → `placeId`, fiche), complété des trajets, puis assemblé par `assemblerProgrammeIa` (`src/server/p0/assemblage.ts`, 8 propositions : `NOMBRE_PROPOSITIONS`), avec le site officiel (`src/server/p0/sites.ts`, `sourceDuSite`). Il est écrit dans `prototype.programmes`.
- **Ce qui marche dans la vraie app** : avec `DATA_ADAPTER=api` et `AUTH_ADAPTER=better-auth`, en `local` et en `ci`, la création (`createTrip`, B9b), l'aperçu (`src/workflows/apercu.ts`, étapes `a`, `l`, `b`, `c`, `d`, `e` de `src/server/generation/etapes.ts`, publication par `src/server/generation/publication.ts`), la lecture (B6b) et le bout en bout simulé (0110, `tests/e2e/generation-api.api.spec.ts`). Mais l'aperçu passe par l'**ancienne chaîne** (recherche web, ancrage, notation, moteur).
- **But de M1a** : sur ce chemin `api`, remplacer le contenu de l'aperçu par la chaîne inversée, et écrire le programme dans le schéma principal, sous l'organisation de la personne connectée. Tout se fait en composition **simulée** (doubles de `src/ai/modeles.simule.ts`, `src/grounding/places.simule.ts`, `src/grounding/routes.simule.ts`). La barrière B9-TL-8 reste fermée, et le studio ne fait aucun appel payant.

## 2. Périmètre

1. **Choix de la chaîne** : une constante serveur (nom et emplacement : T4) choisit la chaîne de l'aperçu de `api`. Elle vaut « inversée » par défaut à la fusion. L'ancienne chaîne reste sélectionnable et testée.
2. **Lancement** : `createTrip` sur `api` (action existante, `src/server/actions/creation.ts`) crée le voyage, le brief, les séjours et la ligne `generation_runs` de sorte `preview`, comme aujourd'hui. Le workflow de la chaîne inversée démarre (forme : T2).
3. **Brief vers l'IA** : la saisie de l'écran 1 à 3 (destination, dates et heures, voyageurs, logement, rythme, envies, déplacements, budget des repas, « À éviter », récit) est convertie dans le brief de la chaîne inversée par la **même** conversion que sur le site d'essai (`depuis-formulaire.ts`, ou son déplacement : T1). Rien d'autre n'entre dans le prompt, et jamais une donnée Google.
4. **Étape « programme »** : rédaction, lecture tolérante, vérification de chaque lieu, site officiel, assemblage, avec les mêmes règles que `etapeProgramme`. Un lieu introuvable ou fermé est remplacé ou signalé selon 0116, comme sur le site d'essai.
5. **Écriture**, dans une transaction sous `withOrg` (organisation de la session) :
   - `trip_versions` version 1 : un `TripSnapshot` validé par `TripSnapshotSchema`, `author_kind = 'workflow'` ;
   - `trips.current_version = 1` ;
   - les `placeId` des séjours (`stays.place_id`) si le logement est vérifié ;
   - les 8 propositions de l'aperçu dans `proposals` (ou des cases `noOption` s'il y en a moins, B2) ;
   - les coordonnées par `store_place_coordinates` (30 jours, 0011 § 6).
   Correspondance exacte : T3.
6. **Temps de trajet** : **aucun n'est écrit** (0092 ne vaut que pour le prototype ; 0093 § 3). À la lecture, Séjour et Journée obtiennent les durées par le relecteur de B8b (0074, 0079 ; double `src/mocks/relectures-voyages.ts` en `ci`). Si Samuel autorise leur conservation pour le MVP (question 4 de la PR du plan), une tâche suivante les écrira.
7. **Avancement et erreurs** : `getGenerationStatus` rend `preparing`, puis `ready` ou `failed` avec les codes fermés existants. Une sortie de l'IA illisible clôt l'exécution sur `model_output_invalid` (`CODE_PROGRAMME_ILLISIBLE`), et « Réessayer » (`retryGeneration`) relance.
8. **Plafonds** : la part de la rédaction et celle de la vérification sont réservées dans le forfait de l'aperçu (`src/server/generation/forfait-etape.ts`, `usage_ledger`), avec les valeurs de test de la variante simulée. Répartition : T6.
9. **Une seule ville** dans M1a (décision M1a-PO-3) : un brouillon qui a `otherCities` est refusé au lancement, sur le champ `draft.otherCities`, comme sur le site d'essai, tant que la chaîne inversée est choisie. Plusieurs villes : étape 4 du plan.

## 3. Critères d'acceptation

Chaque critère est vérifié par un test nommé dans la PR. Les tests de base de données tournent en CI (`pnpm test:db`).

1. `chaine-inversee: createTrip sur api écrit la version 1` : en `ci`, `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth`, composition simulée, brief Rome d'une seule ville. L'exécution passe à `ready`. `trip_versions` contient une ligne de version 1, `author_kind = 'workflow'`, dont `snapshot` passe `TripSnapshotSchema`. `trips.current_version = 1`.
2. `chaine-inversee: le programme écrit suit la sortie de l'IA` : sur la sortie simulée de référence du site d'essai (celle de `tests/unit/p0/programme-ia.test.ts`), les jours, les créneaux, les repas de midi et du soir et l'ordre des étapes du `TripSnapshot` sont ceux que `assemblerProgrammeIa` produit pour la même sortie et la même vérification simulée. Même résultat sur les deux chemins, au fichier de destination près.
3. `chaine-inversee: un lieu introuvable n'a pas de placeId` : une étape dont la vérification simulée ne trouve rien n'a pas de `placeId` et reçoit le traitement de 0116 (remplacée ou signalée), identique à celui du site d'essai.
4. `chaine-inversee: aperçu en 8 cases` : `listPreviewSlots` (B6b) rend 8 cases, propositions ou `noOption`. Les lignes de `proposals` appartiennent à l'organisation de la session.
5. `isolation: une organisation ne lit ni ne modifie le voyage inversé d'une autre` : rejoue le test d'isolation de B6 sur un voyage écrit par la chaîne inversée (lecture, `getGenerationStatus`, `retryGeneration` d'une autre organisation : `not_found`, aucune écriture).
6. `chaine-inversee: aucun accès au schéma prototype` : pendant le test 1, aucune requête ne vise le schéma `prototype`, et le graphe d'imports du chemin `api` (depuis `src/adapters/api-creation-instance.ts` et le workflow) n'atteint ni `src/adapters/prototype*.ts`, ni `src/server/p0/garde.ts`, ni `src/server/p0/acces.ts`, ni `src/server/essai`. Le test du graphe d'imports de 0105 § 7 est étendu en ce sens.
7. `chaine-inversee: aucun cookie d'accès` : le chemin `api` ne lit jamais `__Host-p0_acces`. Une requête qui le porte, sans session, est refusée (`unauthenticated`).
8. `chaine-inversee: aucune donnée Google dans l'état, le journal ni le prompt` : les tests à valeurs sentinelles (`tests/unit/p0/sentinelles-google.test.ts`, `tests/unit/ia/prompts-sentinelles.test.ts`) sont rejoués sur le nouveau workflow. L'état sérialisé de chaque étape ne contient que les identifiants prévus par T2.
9. `chaine-inversee: aucun temps de trajet écrit` : après le test 1, ni `trip_versions.snapshot` ni aucune autre table du schéma principal ne contient de durée de trajet (`versions: l'instantané ne contient ni durée de trajet ni date de contrôle`, B2, rejoué). Séjour et Journée affichent les durées du relecteur simulé.
10. `chaine-inversee: relance sans doublon` : une étape redistribuée est refusée par la garde `step_seq`. Un second `createTrip` avec le même `requestId` rend le même voyage, sans seconde exécution ni seconde version.
11. `chaine-inversee: sortie illisible` : une sortie simulée illisible clôt l'exécution sur `model_output_invalid`, sans version écrite. `retryGeneration` relance, et l'exécution suivante écrit la version 1.
12. `chaine-inversee: barrière fermée` : avec `PLAFONDS_USAGE = null`, aucun client réel n'est construit (`src/server/generation/barriere-fermee.test.ts`, rejoué sur le nouveau workflow).
13. `chaine-inversee: une seule ville` : un brouillon avec `otherCities` est refusé (`validation_failed`, champ `draft.otherCities`) sans aucune écriture.
14. `ancienne chaîne: inchangée` : avec la constante sur « ancienne », les tests existants de B9b à B9e et de B10 passent sans modification. Aucun test n'est supprimé ni désactivé.
15. **Bout en bout** (`tests/e2e/generation-api.api.spec.ts`, étendu) : connexion par code lu dans Mailpit, création d'un voyage à Rome, écran 5 jusqu'à « prêt », puis Séjour et Journée 1. La Journée 1 affiche un repas de midi et un repas du soir de la sortie simulée.
16. `pnpm verify` vert (variante du studio : `env -u GOOGLE_MAPS_SERVER_KEY SKIP_DB_TESTS=1 pnpm verify`, les tests de base de données en CI).

## 4. Propositions au Tech Lead (à trancher dans la décision M1-TL, avant le code)

- **T1 — Emplacement du code partagé.** `assemblage.ts`, `vers-couche-ia.ts`, `depuis-formulaire.ts` et `sites.ts` vivent dans `src/server/p0`, que le chemin `api` ne doit pas importer (règle `ligne/creation-imports`, 0101 § 4). *Proposition* : les déplacer dans un module commun (par exemple `src/server/programme/`), importé par `p0Run` et par la vraie app. Le prototype garde ses gardes et son écriture.
- **T2 — Forme du workflow.** *Proposition* : un workflow `generateProgramme` dans `src/workflows/`, qui reprend les étapes `a` (brief, forfait) et `l` (logement) d'`apercu.ts`, puis une étape « programme » qui remplace `b` à `e`. État sérialisé limité à `{ generationRunId, organizationId, rang }`, comme l'aperçu (0087 § 2). Une seule étape de travail, ou deux (rédaction, puis vérification et écriture), selon la durée d'une fonction (0075).
- **T3 — Correspondance avec le schéma principal.** Comment `ProgrammeCompletIa` (jours, créneaux, terminus, propositions, logements) devient `TripSnapshot`, `stays` et `proposals`. *Proposition* : `TripSnapshot` tel quel pour les jours, `proposals` pour les 8 cartes, terminus dans le snapshot. Faut-il une évolution de contrat (par exemple un champ maison absent de `TripSnapshotSchema`) ? Si oui, PR de contrat d'abord.
- **T4 — Constante de choix de chaîne.** Nom, emplacement (proposition : `src/server/config/generation.ts`), et lecture à l'appel, jamais au build.
- **T5 — Migration.** `generation_runs_step_check` n'admet que `a`, `l`, `b`, `c`, `d`, `e`. Faut-il une lettre pour l'étape « programme » et de nouveaux codes dans `generation_runs_stop_reason_check` ? Ou bien l'étape réutilise-t-elle une lettre existante ? Si une migration est nécessaire, elle part en tâche M1-D (rôle data), avant M1a.
- **T6 — Forfait.** Répartition du forfait de l'aperçu entre la rédaction (modèle) et la vérification (Text Search, fiches, Routes de relecture), et sort de `reserve-text-search.ts` dans la chaîne inversée.
- **T7 — Ancienne chaîne.** Elle est gelée et sélectionnable. Qu'en fait-on après le jugement de Samuel sur la vraie app déployée : retrait par une décision écrite, et quels tests suivent ? *Proposition* : retrait dans une tâche à part, après la tâche M1h.
- **T8 — Préversion sans e-mail réel.** Le plan (`docs/plans/mvp-etapes-1-9.md`, § 0.3) recommande de ne pas construire de connexion de secours, et d'attendre la clé Resend (action S1). Le Tech Lead confirme, ou propose autre chose avec la Sécurité.

## 5. Questions à la Sécurité (verdict M1-S, avant le code)

- **S1** — Le verdict 0117 (`zdr: true`, `data_collection: "deny"`, échec fermé, contrôles minimaux de la sortie) s'applique-t-il tel quel à la requête `programme` de la vraie app ? L'envoi réel du récit et du logement de vrais comptes attend en outre la réponse de Samuel (question 3 de la PR du plan). En simulé, rien ne part.
- **S2** — Quels événements de journal la chaîne inversée émet-elle sur le chemin `api` ? Liste fermée (0114). Les compteurs de `p0.programme_written` doivent-ils être repris, ou remplacés par l'événement de l'aperçu de B9 ?
- **S3** — Quel rôle écrit : `vadrouille_app` sous `withOrg`, ou le rôle de la publication de B9c ? Faut-il un nouveau droit ?
- **S4** — Les adresses des sites officiels (0122) entrent dans `Stop.source` du snapshot. Les conditions de 0122 § 2.2 (vérification statut seul, liste de refus) valent-elles telles quelles ?
- **S5** — Les noms de lieux écrits par l'IA, envoyés à Text Search (Q606, acceptée pour le site d'essai) : même verdict pour la vraie app ?

## 6. Décisions du Product Owner (définitives dès la fusion, 0093)

- **M1a-PO-1** — La vraie app reprend **sans changement** les règles de qualité du site d'essai : prompt `programme` v4, révision v2, règles de 0116, 0121, 0126, 0130. Aucune règle nouvelle n'est écrite pour le MVP dans M1a. Toute retouche passera par un essai réel de Samuel, comme le veut 0115 § 2 point 5.
- **M1a-PO-2** — L'aperçu montre les 8 propositions choisies par `assemblerProgrammeIa`, comme sur le site d'essai. Le reste du programme n'est pas montré avant le déblocage (B4a ; écrans : B4b).
- **M1a-PO-3** — Une seule ville dans M1a. Le refus porte sur le champ `draft.otherCities` avec le texte existant du site d'essai.
- **M1a-PO-4** — Les 62 villes de B9-PO-18 restent la règle de la vraie app jusqu'à la tâche M1f (ville par autocomplétion), qui tranchera Q626.

## 7. Hors périmètre

- Tout appel réel, toute préversion, toute variable Vercel (tâche M1h ; actions S1 à S4 de Samuel).
- « Pas pour moi » change le programme (M1b), voyage complet après le déblocage (M1c), écrans du déblocage (B4b), photos du tri (M1e), ville par autocomplétion (M1f), remplacer une étape (M1g).
- La conservation des temps de trajet dans le schéma principal (question 4 de la PR du plan, Samuel).
- Toute modification du site d'essai, du schéma `prototype`, de `p0Run` au-delà du déplacement de modules de T1, et de la garde du mode réel.
- La suppression de l'ancienne chaîne (T7).
- Tout changement d'écran : aucune capture n'est exigée, sauf si le bout en bout montre un écart d'affichage.

## 8. Questions ouvertes

- **Samuel** (dans la description de la PR du plan) : questions 3 (récit et logement de vrais comptes vers le fournisseur de modèles), 4 (temps de trajet du MVP), 5 (coût avant paiement) et 6 (plafonds). Aucune ne bloque M1a, qui reste en simulé.
- **Tech Lead** : T1 à T8. **Sécurité** : S1 à S5.
