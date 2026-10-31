# Plan du MVP, étapes 1 à 9

Rédaction : Product Owner · Date : 2026-10-28 · `main` relu : `9073fc6` (après #824) · Tickets et PR relus par `gh api` le 2026-10-28 vers 20:00 UTC.

**Feu vert de Samuel** (2026-10-28 19:45 UTC, fil « Lister ce qui manque pour le MVP ») : « ok bah go hein, tu vas me développer, par le biais des routines TOUS jusqu'à l'étape 9, on parlera de la mise en ligne publique à la fin ». Ce message vaut aussi son jugement du prototype inversé, que la décision 0115 § 5.5 attendait avant de reporter l'inversion dans la chaîne du MVP (précision du CEO, 2026-10-28).

**Ordre retenu par le CEO** (décision d'ordre, « Qui décide quoi ») : 1 report de l'inversion ; 4 plusieurs villes ; 5 retouches et « À faire avant de partir » (B11) ; 6 pendant le voyage ; 7 e-mail « aperçu prêt » ; 8 après le voyage (B12) ; 9 export et suppression. Pour les étapes 2 (connexion par e-mail et code) et 3 (paiement de test), le studio code d'abord les adaptateurs, puis demande **une seule action** à Samuel. Ce plan garde cet ordre. Un seul prérequis technique le contraint : l'étape 7 attend l'adaptateur d'envoi de l'étape 2 (§ 7). Il ne change pas l'ordre des étapes, seulement la place de deux tâches (§ 10).

Ce document propose. Il ne tranche rien de ce qui revient à Samuel (comptes, argent, juridique, production), au Tech Lead (architecture) ni à la Sécurité (secrets, données). Chaque point à trancher dit **qui décide**. Les questions pour Samuel sont listées dans la description de la PR qui ajoute ce plan ; le CEO les reporte dans `QUESTIONS.md`.

Convention : une tâche = une spécification = une branche `claude/<id>-<slug>` = une PR, livrable en un cycle de 2 heures. Les identifiants `M<étape><lettre>` sont ceux de ce plan. Le CEO ouvre un ticket par tâche, comme d'habitude.

---

## 0. Ce que « brancher sur la vraie app » veut dire, au vu du code

### 0.1 Deux chemins existent aujourd'hui, côte à côte

| | Site d'essai (`p0-reel`) | Vraie app (`DATA_ADAPTER=api`) |
|---|---|---|
| Adaptateur | `prototype` (`src/adapters/prototype*.ts`), liste blanche `prototypeAdapterAllowed` (préversion seulement) | `api` (`src/adapters/api-instance.ts`, `api-creation-instance.ts`), garde `assertApiAdapter` (`src/adapters/api-guard.ts`) |
| Qui est connecté | Personne. Un **code d'accès** partagé pose le cookie `__Host-p0_acces` (`src/server/p0/acces.ts`). Tous les voyages sont dans l'organisation fictive `org_prototype` (`PROTOTYPE_ORG_ID`, `PROTOTYPE_USER_ID`, `src/adapters/context.ts`) | Une **session better-auth** (B3b, B3c, `src/adapters/better-auth.ts`). Organisation personnelle créée à la première connexion. Le contexte (`organizationId`, `userId`, `role`) vient de la session, et la RLS l'applique (`withOrg`) |
| Base | Schéma `prototype` : `runs`, `run_briefs`, `programmes` (JSON `{schema, trip, proposals, terminus}`), `trajets`, `forfaits`, `purges`, etc. Rôle `vadrouille_prototype` | Schéma principal : `trips`, `briefs`, `stays`, `trip_versions` (`TripSnapshot`, ajout seulement), `generation_runs`, `proposals`, `deck_closures`, `checkouts`, `entitlements`, `usage_ledger`, `checklist_items`, `share_links`. Rôle `vadrouille_app`, RLS par organisation |
| Programme | **Chaîne inversée** (0115 à 0117) : `p0Run` (`src/workflows/p0-run.ts`), l'IA écrit le programme (`src/ai/rediger-programme.ts`, prompt `programme` v4), le code vérifie chaque lieu sur Google (`src/grounding`) et ajoute les trajets (`src/server/p0/assemblage.ts`, `assemblerProgrammeIa`) ; révision après le tri (`p0Revision`, 0126) ; site officiel (0121, 0122) ; photos du tri (0128) ; ville par autocomplétion (0129) | **Ancienne chaîne** (B7 à B9, gelée par 0115 § 5.5) : `src/workflows/apercu.ts` (étapes `a`, `l`, `b` recherche web, `c` ancrage, `d` notation, `e` planification par le moteur B5), `complet.ts` (B9d), `recalcul.ts` (B10b) |
| Garde des appels payants | Garde du mode réel (`src/server/p0/garde.ts`) : préversion de `p0-reel`, `P0_REAL_RUNS`, jeton, cookie, forfait, fusible de 2 USD d'IA (0093) | Barrière B9-TL-8 (`src/server/generation/barriere.ts`), **fermée** : `PLAFONDS_USAGE = null` (`src/server/config/usage.ts`), `BRANCHE_APPELS_REELS = null` (`src/server/config/generation.ts`) |
| Déblocage | Déblocage simulé, clé dérivée du code d'accès (0124, `src/server/essai/deblocage.ts`) | B4a fusionnée (#582) : paiement simulé en base, `entitlements`. **B4b non faite** : les écrans de `/voyages/[id]/debloquer` ne sont pas branchés sur `api` |
| Où ça tourne | Préversion Vercel de la branche `p0-reel` | `local` et `ci` seulement : `betterAuthAllowed` refuse `staging` et `production` (0077 § 5.1, B3-TL-2), et Samuel a refusé qu'une préversion lise la base avant G0 (Q417) |
| Purge | Programmes et briefs du prototype supprimés à 29 jours (`p0-purge.yml`, 0046) | Aucune purge des voyages (ce sont les données de la personne). Seules les coordonnées de `place_coordinates` expirent à 30 jours (0011, 0027) : la purge `coords-purge` est **en échec** et son activation attend Samuel (#527, Q438) |
| E-mails | — | SMTP vers Mailpit en `local` et `ci` (B3b-envoi, 0098). Aucun fournisseur réel |

### 0.2 Le sens retenu pour l'étape 1

« Brancher le parcours d'essai sur la vraie app », c'est **faire tourner la chaîne inversée derrière l'adaptateur `api`** : mêmes écrans, mêmes contrats (`src/contracts`), mais les voyages appartiennent à l'organisation de la personne connectée, ils sont écrits dans le schéma principal sous la RLS, et le cycle de vie est celui du MVP (aperçu, tri, déblocage, voyage complet). Concrètement :

1. **Génération.** Les étapes `b` à `e` de l'ancienne chaîne (recherche, ancrage, notation, planification) sont remplacées, pour l'adaptateur `api`, par l'étape « programme » de `p0Run` : rédaction par l'IA, lecture tolérante (0111), vérification Google, trajets, assemblage. Le résultat est écrit en `trip_versions` (`TripSnapshot`), `stays` et `proposals`, et non plus dans `prototype.programmes`. Les modules de `src/ai` et `src/grounding` sont repris tels quels. Ce qui vit aujourd'hui dans `src/server/p0` (assemblage, passage vers la couche IA, sites) est soit importé, soit déplacé : c'est au **Tech Lead** de trancher (questions T1 à T3 de `specs/M1a-chaine-inversee-api.md`).
2. **Rien du chemin d'essai n'entre dans la vraie app.** Pas de schéma `prototype`, pas de code d'accès, pas de garde du mode réel, pas d'organisation `org_prototype`. La garde des appels payants est la barrière B9-TL-8, qui s'ouvrira avec des plafonds que Samuel aura validés (question 6 de la PR).
3. **Le site d'essai reste en place** jusqu'à ce que Samuel juge la vraie app déployée. Ensuite, le CEO décide de son retrait (0115 § 5.5 ; `specs/E2E-essai-bout-en-bout.md`, « Principe » : « l'adaptateur d'essai disparaîtra »).
4. **L'ancienne chaîne n'est pas supprimée** dans l'étape 1. Elle reste sélectionnable par une constante serveur (forme : Tech Lead), et ses tests restent verts. Pour la retirer, il faudra une décision écrite du Tech Lead, après le jugement de Samuel (CLAUDE.md : aucun test supprimé sans décision).
5. **Données Google.** Les règles de 0011 s'appliquent dans le schéma principal : seul `placeId` est stocké, les coordonnées passent par `store_place_coordinates` (30 jours). L'exception de 0092 (temps de trajet conservés) **ne vaut que pour le prototype**. Pour le MVP, il faut une nouvelle décision de Samuel, que 0093 § 3 annonçait (question 4 de la PR). En attendant, la vraie app relit les durées à l'affichage, par le relecteur de B8b (0074, 0079 ; double simulé en CI).
6. **Migrations.** Le studio écrit les migrations (rôle `data` : RLS, droits, test d'isolation, fichier `.down.sql`). En `local` et en `ci`, elles s'appliquent toutes seules. Sur la base Neon, elles ne s'appliquent que par `db-migrate.yml` : une PR de workflow ajoute la ligne `<tag> <sha256>` à `MIGRATIONS_APPROUVEES` (verdict Sécurité G1 à G6, `owner-approved` posé par Samuel, 0035), puis **Samuel lance `db-migrate`** sur `main`. La règle 7 de 0093 (pas d'`owner-approved`) ne vaut que pour la base d'essai : elle ne s'applique pas ici.
7. **Déploiement.** Pour que Samuel touche la vraie app, il faut une préversion qui lise et écrive le schéma principal avec de vraies sessions. Aujourd'hui, trois verrous l'interdisent : Q417 (Samuel), 0077 § 5.1 et 0086 § 2.1 (Tech Lead et Sécurité). Il faut aussi un envoi réel des codes (étape 2). Ce plan propose une branche de préversion dédiée, `mvp-essai`, créée depuis `main` par Release comme `p0-reel` (questions 1 et 2 de la PR). Les verrous ne se lèvent que pour elle (tâche M1h).

### 0.3 Ce qui avance sans l'e-mail réel (sans attendre Resend)

Presque tout. Better-auth fonctionne déjà en `local` et en `ci` avec Mailpit (B3b-envoi, #548), et le bout en bout simulé de `api` existe (0110, `tests/e2e/generation-api.api.spec.ts`, `lecture-api.api.spec.ts`). Les tâches M1a à M1g, B4b, M2a, M4, M5 et une bonne part de M6, M8 et M9 se codent et se testent dans ce cadre, sans aucun appel payant (barrière fermée, doubles de `src/ai/modeles.simule.ts`, `src/grounding/places.simule.ts`, `routes.simule.ts`).

Seuls deux usages attendent l'étape 2 : **l'essai de Samuel sur la préversion** (il lui faut un vrai code dans sa boîte) et les **e-mails** des étapes 6 et 7.

**Pas de connexion de secours sur la préversion.** La connexion simulée (`mock`, code connu de tous, 0017 § 11.2) ne donne pas de vraie organisation : l'adaptateur `api` exige `AUTH_ADAPTER=better-auth` (0086 § 2.1). Pour faire tourner `api` avec une connexion simulée, il faudrait une nouvelle garde et un nouveau verdict de la Sécurité, pour un code jetable. Créer un compte Resend et poser sa clé prend une dizaine de minutes à Samuel. Recommandation du Product Owner : pas de connexion de secours ; on demande la clé Resend au moment exact où la préversion est prête (§ 2, action S1). Le Tech Lead et la Sécurité restent libres de proposer autre chose (question T8 de la spécification M1a).

---

## 1. Étape 1 — Le parcours d'essai dans la vraie app

### (a) Ce qui existe
- **Spécifications** : `specs/P0-programme-par-ia.md` (amendements 1 à 4), `specs/E2E-essai-bout-en-bout.md` (lots 1 à 5), `specs/B9-generation.md` (B9b à B9e), `specs/B10-propositions-preferences.md`, `specs/B6-api-lecture.md`, `specs/B4-paiement-simule.md`, `specs/B3-compte-connexion.md`, `specs/F13-photos-propositions.md`.
- **Décisions** : 0115 (inversion), 0116 (Tech Lead), 0117 (Sécurité), 0121 et 0122 (site officiel), 0124 à 0126 (essai : déblocage, brief saisi, révision), 0128 (photos du tri), 0129 et 0131 (ville par autocomplétion), 0130 (raisonnement borné), 0092 et 0093 (temps de trajet, zéro appel après l'analyse), 0081, 0087, 0105, 0108, 0110 (chaîne du MVP), 0112, 0119, 0120 (tri et recalcul), 0097 (B4a), 0077 et 0086 (gardes `better-auth` et `api`).
- **Code fusionné** : toute la chaîne inversée sur le prototype (`p0Run`, `p0Revision`). Côté `api` : B3a, B3b, B3c (connexion, Mailpit), B6a et B6b (lecture), B9b à B9e (création, aperçu, voyage complet, bout en bout simulé), B10a et B10b (tri enregistré, recalcul), B4a (paiement simulé en base). Écrans : création guidée (#814), « Mes voyages » (#811), « Aujourd'hui », Séjour, Journée, fiche avec « Site officiel » (#809, #824).
- **Tickets ouverts liés** : #583 (B9e réel sur préversion, attend Q538), #826 (Google 429 : lire un voyage sans Google, `in-progress`), #822 (mineurs du site officiel, `in-progress`), #664 et #654 (moteur : réserve et créneau imposé, ancienne chaîne), #527 (purge des coordonnées, Q438), #687 et #692 (bout en bout sur le site d'essai, `in-progress`). #827 (partage par lien signé sur le site d'essai, 0135) est fusionnée (2026-10-28).

### (b) Ce qui manque
1. La chaîne inversée derrière `api` : création, avancement, écriture en `trip_versions`, `stays` et `proposals`.
2. La révision après « Pas pour moi » (0126) sur `api`. Aujourd'hui, B10b recalcule avec le moteur sur une réserve que la chaîne inversée n'a pas (0115 § 5.3).
3. Le déblocage sur `api` dans les écrans (B4b).
4. Le voyage complet après le déblocage, selon la réponse de Samuel sur le coût avant paiement (question 5 de la PR).
5. Les photos du tri (0128), la ville par autocomplétion (0129) et le site officiel (0121, 0122) sur `api`. L'autocomplétion compte aujourd'hui ses appels dans `prototype.forfaits` : il lui faut un compteur hors du schéma `prototype`, donc une migration.
6. « Remplacer une étape » (écran 14, F7) sur `api` : il n'existe que sur `mock`. Sur le site d'essai, le programme change par la révision. Ce point recoupe B11 (étape 5) ; on ne livre en étape 1 que le remplacement par une proposition déjà vérifiée (§ 1 (c), M1g).
7. La préversion `mvp-essai` et la levée des trois verrous pour elle seule (Q417, 0077 § 5.1, 0086 § 2.1), les plafonds réels (`PLAFONDS_USAGE`, `BRANCHE_APPELS_REELS`) et la purge des coordonnées (Q438).

### (c) Tâches

| ID | Tâche | Rôle | Prérequis | Fichiers principaux |
|---|---|---|---|---|
| M1-TL | Décision du Tech Lead : réponses T1 à T8 de `specs/M1a-chaine-inversee-api.md` (emplacement du code, forme du workflow, correspondance avec `TripSnapshot`, `stays` et `proposals`, constante de choix de chaîne, migration éventuelle, sort de l'ancienne chaîne) | tech-lead | ce plan et la spécification M1a fusionnés | `docs/decisions/` |
| M1-S | Verdict de la Sécurité : S1 à S5 de la spécification M1a (0117 appliquée au MVP, journal en liste fermée, rôles d'écriture, sites officiels sous 0122) | securite | M1-TL (même cycle, fusion après M1-TL) | `docs/decisions/` |
| M1-D | Migration, **seulement si M1-TL l'exige** (par exemple l'étape « programme » dans `generation_runs_step_check`, ou les codes d'arrêt de la chaîne inversée dans `generation_runs_stop_reason_check`), avec test d'isolation et `.down.sql` | data | M1-TL | `db/schema`, `db/migrations`, `tests/db` |
| **M1a** | **La chaîne inversée écrit le programme dans la vraie app** (composition simulée, `local` et `ci`) : spécification prête, `specs/M1a-chaine-inversee-api.md` | backend | M1-TL, M1-S, M1-D s'il existe | `src/server/generation`, `src/workflows`, `src/server/creation` |
| M1b | « Pas pour moi » change le programme sur `api` : la révision de 0126 (une seule par voyage, Q613) portée sur un recalcul `batch` de B10b (`deck_closures`), à la place du moteur | backend | M1a | `src/server/generation`, `src/workflows/recalcul.ts` |
| B4b | Branchement des écrans du déblocage sur `api` avec le paiement simulé (`specs/B4-paiement-simule.md`, B4b ; amendement de 0020 § 2.3, B4-TL-14) | backend | B4a (fusionnée) | `src/adapters/payment-guard.ts`, `src/app/voyages/[id]/debloquer`, `src/server/payment` |
| M1c | Voyage complet après le déblocage dans la chaîne inversée (B9d réécrite) : vérification des lieux restants, selon la réponse de Samuel à la question 5 | backend | M1a, B4b ; question 5 de la PR | `src/workflows/complet.ts`, `src/server/generation` |
| M1e | Photos du tri sur `api` (0128 : `placeId` du voyage de l'organisation, jamais stockées). **Fusionnée** (#882, décision 0143) : livrée derrière la barrière fermée, **sans client des photos branché** (`CLIENT_PAR_DEFAUT` à `null`, 0143 § 4 point 1) ; le branchement du client passe à M1h (0143 § 4 point 2) | frontend avec backend | M1a | `src/server/actions/photo-essai.ts` (généralisé), `src/features/presentation` |
| M1f | Ville par autocomplétion sur `api` (0129, 0131) : compteurs hors du schéma `prototype`, migration `data` dans la même tâche si M1-TL le permet, sinon M1f-D d'abord | data puis backend | M1-D ; Q626 (élargir les 62 villes de B9-PO-18 : Product Owner, tranché par M1f) | `src/server/actions/villes-essai.ts`, `db/migrations` |
| M1g | Remplacer une étape (écran 14) sur `api`, par une autre proposition déjà vérifiée du voyage : nouvelle version (`TripPatch`), annulation 5 s | backend avec frontend | M1a | `src/server/actions`, `src/server/versions` |
| M1h | Préversion `mvp-essai` : gardes `api` et `better-auth` ouvertes pour cette seule branche (amendements de 0077 § 5.1 et 0086 § 2.1 par le Tech Lead et la Sécurité), valeurs de `PLAFONDS_USAGE` et `BRANCHE_APPELS_REELS` validées par Samuel, liste des variables à poser. **Photos du tri sur `api`** (0143 § 4 points 2, 4 et 5 ; Q685) : branchement du client Places Photos, décompte du coût hors de `prototype.forfaits`, plafond par organisation et par jour, crochet d'accès, place du limiteur (mineur 11), nouvelle revue Sécurité ; critère : la photo de la première proposition s'affiche avec son crédit, barrière ouverte (0143 § 4 point 3) | tech-lead, securite, backend | M1a à M1c, M1e (fusionnée), M2a ; questions 1, 2 et 6 de la PR ; **avant toute ouverture à un public, réponse explicite de Samuel au flux hors UE des photos (F13-Q4, Q696), consignée dans la décision de M1h** (0143 § 4 point 3) | `src/adapters/api-guard.ts`, `auth-guard.ts`, `src/server/config` |
| M1i | Migrations du MVP vers Neon : PR de workflow (`MIGRATIONS_APPROUVEES`), puis action S3 de Samuel | data | M1-D, M1f, toute migration de l'étape ; verdict Sécurité G1 à G6 | `.github/workflows/db-migrate.yml` |

**Actions de Samuel pour l'étape 1**, au moment exact où elles bloquent : voir § 11, actions S1 à S4 (une seule séance, quand M1h est prête).

---

## 2. Étape 2 — Vraie connexion par e-mail et code

### (a) Ce qui existe
`specs/B3-compte-connexion.md` (B3a, B3b, B3c fusionnées : #295, #446, #452), `specs/B3b-envoi-email.md` (#437, #548 : SMTP vers Mailpit), décisions 0050 et 0051 (limiteur), 0077 (garde `better-auth`), 0098 (`EMAIL_TRANSPORT=smtp` et `SMTP_URL` interdits sur Vercel). Q25 tranchée (**Resend**), Q354 tranchée (**100 e-mails de connexion par jour au plus**, toutes adresses confondues). Q401 (deux variables Vercel) : Samuel les posera lui-même.

### (b) Ce qui manque
Un transport d'envoi réel, Resend, qui tourne sur Vercel. Le plafond global de 100 envois par jour (Q354). La garde `better-auth` ouverte sur la préversion `mvp-essai` (M1h). Les variables de la préversion.

Point à savoir : sans domaine vérifié chez Resend, l'expéditeur de test (`onboarding@resend.dev`) n'envoie **qu'à l'adresse du compte Resend**. Samuel peut donc se connecter lui-même, mais pas d'autres testeurs, tant qu'aucun domaine n'est acheté et vérifié (Q1 : un achat de domaine est une dépense ; question 7 de la PR).

### (c) Tâches
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| M2-spec | Spécification B3d « envoi réel par Resend » : transport (API HTTPS de Resend ou SMTP de Resend, au choix de la Sécurité, 0098), plafond global de 100 envois par jour, journal sans adresse ni code, comportement au plafond (« Réessaie demain »), expéditeur | product-owner | — |
| M2-S | Décision de la Sécurité : transport réel sur Vercel (amende 0098), nom et confinement de la clé (`RESEND_API_KEY`, côté serveur seulement), région, sous-traitant (Q25) | securite | M2-spec |
| M2a | Adaptateur d'envoi Resend et plafond global, testés sur un double HTTP (aucun envoi réel par le studio) | backend | M2-S |
| M2b | Ouverture de `better-auth` sur la préversion `mvp-essai` : fait partie de M1h | — | — |

**Action de Samuel** : S1 (§ 11), quand M2a et M1h sont fusionnées. Avant, rien ne lui est demandé.

---

## 3. Étape 3 — Paiement de test TWINT ou carte, avec reçu

### (a) Ce qui existe
`specs/B4-paiement-simule.md` (B4a fusionnée #582 ; B4b et B4c décrites), décision 0097 (B4-TL-1 à B4-TL-13), `src/server/payment` (prestataire simulé, webhook signé, suite du voyage complet). L'adaptateur `stripe` lève « non implémenté » (`src/adapters/index.ts`). Q26 (compte Stripe de test) et Q353 (qui pose les secrets de test, qui déclare le webhook) sont ouvertes. Q127 (mentions avant paiement) est ouverte et ne bloque que le paiement réel.

### (b) Ce qui manque
B4b (écrans sur `api`), B4c (adaptateur Stripe en mode test, Checkout `card` et `twint`, webhook signé), le reçu (celui de Stripe Checkout, lien vers le reçu sur l'écran de retour), le compte de test et ses clés.

### (c) Tâches
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| B4b | Voir l'étape 1 (le déblocage du parcours en a besoin) | backend | B4a |
| B4c-TL | Préalables de B4c : version du paquet `stripe` (amendement de 0006), webhook, vérification de signature, refus des clés `sk_live` (déjà exigé par `src/server/env/`) | tech-lead, securite | B4b |
| B4c | Adaptateur `stripe` en mode test, codé et testé sur des événements signés de test (fixtures), sans compte | backend | B4c-TL |
| B4d | Reçu : lien vers le reçu Stripe sur l'écran de retour et dans « Mes voyages » ; avec le simulé, un reçu maison marqué « simulé » | backend avec frontend | B4c |
| B4e | Reçu de Stripe (ticket #887 ; décision 0144, § 7) : **migration d'abord** (colonne `checkouts.stripe_receipt_url`, 0144 § 5.3 point 1, tâche `data`), puis écriture depuis le webhook et rendu sur `R9-recu` (tâche `back`) ; essai réel après Q26, Q353 et l'ouverture des gardes de `mvp-essai` (0144 § 7) | data puis backend | 0144 fusionnée (#890) ; #884 (B4d) fusionnée ; une seule tâche `db/migrations` par cycle, après la **fusion** de #866 (M1i), pas seulement son ouverture (0144 § 7) |

**Action de Samuel** : S5 (§ 11), quand B4c est fusionnée.

---

## 4. Étape 4 — Plusieurs villes dans un même voyage

### (a) Ce qui existe
Le contrat et la base gèrent plusieurs séjours (`stays`, `draft.otherCities`, `src/server/creation/brouillon.ts`). L'ancienne chaîne accepte plusieurs villes **d'un même fuseau** (B9-PO-18 : un fuseau par voyage, `Trip.timeZone`). La chaîne inversée les refuse (`src/server/p0/depuis-formulaire.ts`, champ `draft.otherCities`).

### (b) Ce qui manque
Un prompt `programme` qui écrit un programme sur plusieurs villes, avec la journée de transfert ; la vérification Google par ville ; l'assemblage par séjour ; les trajets entre villes (un train n'est pas un trajet Routes à pied : règle à fixer). Les voyages à plusieurs fuseaux (Lisbonne puis Madrid, par exemple) demandent un fuseau par séjour, donc un changement de contrat.

### (c) Tâches
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| M4-spec | Spécification « plusieurs villes » : journée de transfert, nombre de villes maximal (proposition : 3), même fuseau dans un premier lot, coût | product-owner | M1a fusionnée |
| M4-TL | Décision du Tech Lead : trajet entre villes (durée saisie ou estimée, jamais une donnée Google stockée), forfait par ville | tech-lead | M4-spec |
| M4-suite | Spécification « M4-suite » (découpage de la spécification M4, décision du CEO Q697, PR #876) : règles de planification de la journée du changement de ville (ancien § 3.4 : départ estimé, intervalle du changement de ville, chevauchement, marges, arrivée proche, engagement pendant le trajet, repas, long changement de ville, bandeaux et leurs textes) et carte d'ensemble à plusieurs villes numérotée (avec une décision UX/UI) | product-owner (revue Tech Lead et UX/UI) | M4-TL fusionnée (T9, T11, T12) |
| M4a | Prompt `programme` v5 multi-villes et jeu d'évaluation (sorties simulées) | ia-recherche | M4-TL |
| M4b | Vérification et assemblage par séjour ; refus de `draft.otherCities` levé pour la chaîne inversée | backend | M4a |
| M4c | Écrans : Séjour à plusieurs villes, journée de transfert (UX/UI pour l'écran non maquetté) | frontend | M4b |
| M4d | Plusieurs fuseaux par voyage (contrat `Stay.timeZone`, amendement de B9-PO-18) | tech-lead puis backend | M4b ; lot séparé, après le premier essai de Samuel |

**Découpage M4 / M4-suite** (décision du CEO avec le Tech Lead, Q697 ; description de la PR #876) : deux sujets sortent de la spécification M4 vers M4-suite, les règles de planification de la journée du changement de ville et la carte d'ensemble numérotée à plusieurs villes. Ce plan ne recopie aucune valeur de ces règles : elles sont celles de la spécification M4 **une fois fusionnée (#876)**, avec la précédence M4-TL, puis M4-suite, puis la spécification. M4-suite ne bloque pas M4a à M4c.

---

## 5. Étape 5 — Retouches du programme et « À faire avant de partir »

### (a) Ce qui existe
Le contrat porte `Stop.locked`, `TripPatch`, `PatchResult`, `ChecklistItem` et `ChecklistMoment` (B2). `trip_versions` est en ajout seulement. Le moteur conserve une étape verrouillée (B5). La table `checklist_items` existe. L'action `toggleChecklistItem` (`src/server/actions/sejour.ts`) et `src/server/voyages/a-faire.ts` existent. Les écrans F7 (remplacer, ajouter, déplacer) et la liste existent sur `mock`. « Signaler une erreur » attend le contrat `StopReport` de B11 (roadmap, ligne 12). **B11 n'a pas de spécification.**

### (b) Ce qui manque
La spécification B11 ; les actions de révision sur `api` (verrouiller, revenir à une version, signaler, ajouter un lieu à soi) ; la liste « À faire avant de partir » écrite par la chaîne inversée (réservations, billets : les `tip` et `toReserve` du programme) et cochable sur `api`.

### (c) Tâches
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| M5-spec | Spécification B11 (retouches) adaptée à la chaîne inversée : verrou, versions, signalement, lieu à soi, liste | product-owner | M1a |
| M5-TL | Décision du Tech Lead : contrat `StopReport`, recherche d'un lieu à soi (Text Search par nom → `placeId`, nom jamais prérempli par le nom Google), versions | tech-lead, securite | M5-spec |
| M5-C | PR de contrat (0147 § 14) : `ChangeSchema` étendu et `changements()` complété, `not_unlocked`, `StopReportSchema`, `Stop.addedBy`, `ChecklistItem.kind`, schémas de la recherche de lieu et du retour à une version ; aucun cas d'usage | backend avec frontend | M5-TL |
| M5-D | Migration `0022` (0147 § 2 et § 6.4 point 3) : `feedback` durcie, colonne `lieux` des compteurs d'autocomplétion ; seule tâche `db/migrations` de M5. **Fusionnée** (PR #899, 2026-10-29 19:08 UTC) ; sa ligne de `MIGRATIONS_APPROUVEES` passe par une PR de workflow séparée, après la fusion de #866 (Q713) | data | M5-TL |
| M5e | « À faire avant de partir » écrit à la génération et cochable sur `api` (0147 § 7) | backend avec frontend | M5-C, M1g (fusionnée, #877) ; M1a (fait) — Q684, 0147 § 14 |
| M5a | Verrouiller une étape (sur `api`), conservée par la révision et par le remplacement | backend avec frontend | M5-C, M5e, M1b (fait) — 0147 § 14 |
| M5b | Revenir à une version précédente : nouvelle version identique (B5, `versions: annuler crée une version identique`) ; écran « Versions » (UX/UI) | backend puis frontend | M5-C, M5a — 0147 § 14 |
| M5c | Signaler une erreur (fiche, écran 13) : enregistrement fermé (codes, jamais de texte Google) | backend avec frontend | M5-C, M5-D — 0147 § 14 |
| M5d-1 | Ajouter un lieu à soi, partie serveur (recherche Text Search, compteurs, limiteur, aperçu et application, adaptateurs `mock` et `api`) | backend (relecture Sécurité) | M5-C, M5-D, M5a, M1f (fusionnée, #885) — 0147 § 14 |
| M5d-2 | Ajouter un lieu à soi, écran « Ajouter un lieu » (F7c, jamais livré ; Q708) | frontend (UX/UI pour le rendu) | M5d-1 — 0147 § 14 |

**Découpage et ordre de M5** (décision 0147 § 14, qui prime sur les lignes ci-dessus pour le contenu détaillé et les fichiers) : M5-C et M5-D en parallèle, puis M5e, puis M5a, puis M5b et M5c (M5c jamais dans le même cycle que M5a : `StopSheet.tsx`), puis M5d-1, puis M5d-2. L'ancienne ligne M5d est coupée en M5d-1 et M5d-2. **Exception à « une tâche = une spécification »** (`CLAUDE.md`), accordée par le CEO le 2026-10-29 (0147 § 14 ; Q704), comme pour M1a (0136 § 12) : ces huit tâches partagent `specs/M5-retouches.md` et 0147, chacune sur sa branche et dans sa PR.

---

## 6. Étape 6 — Pendant le voyage

### (a) Ce qui existe
`specs/F10-pendant-le-voyage.md` (écran « Aujourd'hui » et partage simulé), décision 0039 (F10-TL-7 à F10-TL-14). La table `share_links` et la fonction `resolve_share_link` existent (B1). La PR #827 (ticket #825, décision 0135, fusionnée le 2026-10-28) ouvre le partage par **lien signé sans stockage** sur le site d'essai ; la révocation y est renvoyée à B12. « Aujourd'hui » lit les jours par n'importe quel `TripAdapter`.

### (b) Ce qui manque
Le partage sur `api`, avec `share_links` (jeton haché, révocable, expiration à la fin du voyage + 30 jours, handover B12). L'ajout au calendrier : un fichier `.ics` du programme, sans compte externe. Les rappels : la spécification doit trancher le canal (proposition : e-mail la veille de chaque jour, sur accord, une fois l'étape 2 en place ; sinon un rappel dans l'app seulement).

### (c) Tâches
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| M6-spec | Spécification « pendant le voyage » sur `api` : partage, calendrier, rappels | product-owner | M1a ; #827 fusionnée ou fermée |
| M6a | Lien privé sur `api` (`share_links`, révocation, vues partagées en liste blanche) | backend | M6-spec ; décision du Tech Lead qui situe 0135 par rapport à `share_links` |
| M6b | Ajouter au calendrier (`.ics`, une entrée par étape, aucune donnée Google hors du nom maison) | backend avec frontend | M6-spec |
| M6c | Rappels (workflow durable avec `sleep`, jamais un service propre à Vercel, 0002) | backend | M6-spec, M2a ; question 8 de la PR (plafond des e-mails) |

---

## 7. Étape 7 — E-mail « ton aperçu est prêt »

### (a) Ce qui existe
Le statut `ready` de `generation_runs` et l'écran 5 qui interroge l'avancement. Le handover (`docs/handovers/comptes-externes.md`, ligne 3) cite l'e-mail « propositions prêtes ».

### (b) Ce qui manque
L'envoi à la fin de l'aperçu (texte dans `src/i18n/fr.json`, lien vers la présentation), seulement si la personne a quitté l'écran 5 (proposition), et sa place dans le plafond d'envois (question 8 de la PR).

### (c) Tâches
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| M7a | E-mail « aperçu prêt » : envoi idempotent à la fin du workflow, testé sur Mailpit | backend | **M2a** (contrainte technique : sans transport réel, l'e-mail ne part que vers Mailpit), M1a |

Cette tâche peut être codée et testée sur Mailpit dès M1a. Elle ne sert sur la préversion qu'après l'action S1.

---

## 8. Étape 8 — Après le voyage

### (a) Ce qui existe
Les tables `feedback`, `preference_signals`, `preferences` (B1). `specs/F11-mes-voyages-apres-etats.md` (écran 16 « Retenir mes goûts »). Q150 : consentement explicite et révocable décidé par Samuel ; les **durées de conservation** attendent la revue juridique (Q5). **B12 n'a pas de spécification** pour l'après-voyage.

### (b) Ce qui manque
La spécification B12 (après) ; l'avis rapide sur `api` ; « adresse découverte » (la personne note un lieu trouvé sur place : lieu à soi de M5d, marqué « découvert ») ; la mémoire des goûts entre voyages, sur accord, réutilisée par le prompt `programme` d'un voyage suivant (préférences maison seulement, jamais une donnée Google).

### (c) Tâches
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| M8-spec | Spécification B12 (après le voyage) | product-owner | M5d |
| M8a | Avis rapide (écran de fin de voyage, `feedback`) | backend avec frontend | M8-spec |
| M8b | Adresse découverte | backend avec frontend | M8-spec, M5d |
| M8c | Mémoire des goûts sur accord, révocable, transmise au prompt du voyage suivant | backend, ia-recherche | M8-spec ; textes et durées validés par Samuel (Q150, action S6) avant l'essai par d'autres testeurs |

---

## 9. Étape 9 — Exporter ou supprimer ses données

### (a) Ce qui existe
`purge_organization_data` (B1) ; le handover B11 décrit `deleteAccount` (suppression des données métier et d'authentification, reprise sans doublon, réauthentification récente) ; Q48 (`billing`, `usage_ledger`) ; Q610 (pas de suppression à la demande d'un brief d'essai) ; Q5, Q27 et Q150 (juridique).

### (b) Ce qui manque
L'export (fichier JSON lisible de ses voyages, briefs, préférences et avis) ; la suppression du compte (avec la réauthentification par code, donc après l'étape 2 pour l'essai déployé) ; les textes et les durées, validés par Samuel.

### (c) Tâches
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| M9-spec | Spécification export et suppression | product-owner | M8-spec |
| M9a | Exporter mes données | backend | M9-spec |
| M9b | Supprimer mon compte (reprise, réauthentification, `billing` et `usage_ledger` selon Q48) | backend, data | M9-spec ; Q48 |
| M9c | Écrans et textes (compte, confirmation) | frontend | M9a, M9b ; **validation juridique de Samuel** (action S6) avant toute ouverture à d'autres testeurs |

---

## 10. Ordre proposé sur les prochains cycles

Cycles toutes les 2 heures (`7 */2 * * *` UTC) : le 216e cycle part le 2026-10-28 à 20:07 UTC, le 217e à 22:07 UTC, le 218e le 2026-10-29 à 00:07 UTC, et ainsi de suite. Au plus 4 fils en parallèle. Chaque fil garde **ses** dossiers ; **une seule tâche par cycle touche `db/migrations`** (le journal `db/migrations/meta/_journal.json` ne supporte pas deux PR en parallèle).

| Fil | Dossiers réservés |
|---|---|
| A — génération | `src/workflows`, `src/server/generation`, `src/server/creation`, `src/ai`, `src/grounding` |
| B — connexion et e-mails | `src/server/auth`, `src/server/mail`, `src/server/email.ts`, `src/adapters/auth-guard.ts` |
| C — paiement | `src/server/payment`, `src/adapters/payment-guard.ts`, `src/app/voyages/[id]/debloquer` |
| D — données et écrans | `db/`, `tests/db`, `src/server/actions` (hors paiement), `src/features`, `src/app` (hors débloquer) |

Les spécifications et les décisions (`specs/`, `docs/decisions/`) ne bloquent aucun fil de code.

| Cycle | Fil A | Fil B | Fil C | Fil D |
|---|---|---|---|---|
| 216 | M1-TL puis M1-S (décisions) | M2-spec (Product Owner) | B4b | — (#822 et #826 en cours sur ces dossiers) |
| 217 | M1a | M2-S | B4c-TL | M1-D (si M1-TL l'exige ; sinon M1f-D) |
| 218 | M1b | M2a | B4c | M1e |
| 219 | M1c (après la question 5) | M7a (Mailpit) | B4d | M1f |
| 220 | M4-spec, M5-spec (Product Owner) | M1h (gardes de `mvp-essai`, Tech Lead et Sécurité) | — | M1g |
| 221 | M4-TL, M5-TL | **Action S1 à S4 de Samuel** (essai de la vraie app) | **Action S5 de Samuel** (Stripe) | M1i (migrations vers Neon) |
| 222 | M4a | — | essai de paiement de test | M5e |
| 223 | M4b | M6-spec | — | M5a |
| 224 | M4c | M6a | — | M5b |
| 225 | M8-spec | M6b | — | M5c |
| 226 | M9-spec | M6c | — | M5d |
| 227 | M8c | — | — | M8a |
| 228 | M9a | — | — | M8b |
| 229 | M9b | — | — | M9c (après l'action S6) |
| 230 | M4d (plusieurs fuseaux) | — | — | corrections des essais |

Lecture du tableau :
- Les retours de Samuel sur ses essais (cycles 221 et suivants) passent avant la suite : le CEO réserve un fil aux corrections dès qu'un essai en remonte.
- M7a (étape 7) passe au cycle 219, avant les étapes 4 à 6 : elle ne touche que le fil B, qui est libre, et l'e-mail sert à l'essai de Samuel. Elle n'est utile sur la préversion qu'après S1. C'est le seul écart à l'ordre des étapes, et il ne retarde aucune étape plus prioritaire.
- Si une décision (M1-TL, M1-S) demande une PR de plus, tout le fil A glisse d'un cycle ; les autres fils continuent.
- **Note du CEO (2026-10-29)** : les lignes M5 des cycles 222 à 226 (M5e, M5a, M5b, M5c, M5d) précèdent le découpage de 0147 § 14 ; l'ordre de M5 qui fait foi est celui du § 5 (c) : M5-C et M5-D d'abord, M5d coupée en M5d-1 et M5d-2. De même, M4-suite (§ 4 (c), Q697) n'y figure pas, ni les deux tâches `db/migrations` ajoutées depuis : B4e (§ 3 (c), 0144 § 7 ; après la fusion de #866) et M5-D (§ 5 (c), fusionnée par la PR #899 le 2026-10-29 à 19:08 UTC ; sa ligne de `MIGRATIONS_APPROUVEES` passe par une PR de workflow séparée après #866, Q713). Le tableau n'est pas réécrit.
- Les tâches du site d'essai encore ouvertes (#822, #826, #692, #687 ; #827 est fusionnée depuis le 2026-10-28) se terminent sur leur branche. Le CEO n'en ouvre pas de nouvelles sur le prototype, sauf correction demandée par Samuel (0115 § 5.5 : aucune nouvelle tâche de qualité sur l'ancienne chaîne non plus).

---

## 11. Actions de Samuel, au moment où elles bloquent

Chaque action est une seule chose à faire. Le CEO l'envoie au moment indiqué, avec les noms exacts, et jamais avant.

| # | Quand le CEO la demande | Action | Ce qu'elle débloque |
|---|---|---|---|
| S1 | M2a et M1h fusionnées (cycle 221 prévu) | Sur resend.com : créer le compte (offre gratuite), puis « API Keys », « Create API Key », et coller la clé dans Vercel, variable `RESEND_API_KEY` (nom définitif : M2-S), environnement Preview, branche `mvp-essai` seulement | La connexion par code sur la préversion (étape 2) et les e-mails des étapes 6 et 7 |
| S2 | Même moment | Dans Vercel, Preview, branche `mvp-essai` : poser les variables de la liste que M1h aura écrite (adaptateurs, `BETTER_AUTH_SECRET`, `TRUSTED_IP_HEADER=x-vercel-forwarded-for`, `RATE_LIMIT_HMAC_SECRET` : Q401) | Le démarrage de la vraie app sur la préversion |
| S3 | M1i fusionnée | Poser `owner-approved` sur la PR de workflow des migrations, puis lancer `db-migrate` sur `main` (bouton « Run workflow », champ `sha_attendu` donné par le CEO) | Les tables et colonnes de l'étape 1 sur Neon |
| S4 | Avant le premier essai déployé | Répondre à Q438 (purge des coordonnées du MVP faite par le studio, recommandation : oui) | Le respect des 30 jours de `place_coordinates` pour les vrais voyages (#527) |
| S5 | B4c fusionnée (cycle 221 prévu) | Sur stripe.com : ouvrir un compte suisse en **mode test**, activer TWINT dans « Payment methods », copier `sk_test_…` dans Vercel (Preview, `mvp-essai`), puis créer le point de terminaison du webhook avec l'adresse donnée par le CEO et copier son secret `whsec_…` (Q26, Q353) | Le paiement de test par TWINT et carte (étape 3) |
| S6 | M8c et M9c prêtes, avant tout testeur hors de Samuel | Valider (ou faire valider) les textes de « Retenir mes goûts », d'export et de suppression, et les durées de conservation (Q5, Q27, Q150) | L'ouverture des étapes 8 et 9 à d'autres personnes (pas le code) |
| S7 | Fin de l'étape 9 | Mise en ligne publique : domaine, production, plafonds Google (étape 10, à discuter) | — |

Aucun réglage de la production n'est demandé avant S7 (Q285 : production laissée telle quelle).

---

## 12. Questions par destinataire

- **Samuel** : questions 1 à 8 de la description de la PR (préversion qui lit la base, branche, récit vers le fournisseur de modèles, temps de trajet, coût avant paiement, plafonds, domaine d'envoi, plafond des e-mails).
- **Tech Lead** : T1 à T8 de `specs/M1a-chaine-inversee-api.md` (décision M1-TL) ; plus tard M4-TL, M5-TL, B4c-TL, et le sort de 0135 face à `share_links` (M6a).
- **Sécurité** : S1 à S5 de `specs/M1a-chaine-inversee-api.md` (verdict M1-S) ; M2-S ; ouverture des gardes de `mvp-essai` (M1h).
- **CEO** : l'ordre du § 10, le retrait du site d'essai après le jugement de Samuel, la création de la branche `mvp-essai` par Release sur l'accord de Samuel.
