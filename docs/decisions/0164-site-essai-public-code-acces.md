# 0164 — Avis de la Sécurité : site d'essai public, sans protection Vercel ; le code d'accès suffit-il à bloquer tout appel payant ?

Statut : **avis de l'agent securite, relu par le Tech Lead à la fusion**. Ce n'est **pas** une décision déléguée : la Sécurité n'a pas de domaine délégué dans « Qui décide quoi » (`docs/CONTEXT.md`, l. 33-45), et 0093 ne s'applique donc pas. Le document porte un numéro de décision, comme l'avis du § 2 de 0157. Ce qu'il propose se répartit ainsi :
- **Tech Lead** : l'outillage et l'architecture (T1, T2, correctifs E1 à E3).
- **Samuel** : le redéploiement de `p0-reel`, l'exposition publique (compte externe) et la reprise des risques acceptés (S1 à S4).
- **CEO** : l'ordre des tickets.

Numérotation : 0164 était réservé pour ce ticket. 0163 est porté par la PR #1052 (ticket 1050, ouverte), qui n'est pas encore fusionnée.

Date : 2026-11-09 · Auteur : Sécurité (avis) · Ticket : #1049 · Lecture faite sur `0188767`, puis relue sur `main` au commit `f9adc17` (après #1044 et #1054). Les fichiers cités en `fichier:ligne` sont inchangés entre les deux commits. #1054 touche la génération de `api` (`src/server/generation/`, `src/server/composition/generation.ts`), qui reste derrière la barrière B9-TL-8 (`src/server/generation/etapes-complet.ts:127-128`, `src/server/generation/dependances.ts:109`, `:119`) · Décisions liées : 0002, 0034, 0055 (S-1, S-2), 0062 § 6, 0063 points 4 et 8, 0065, 0069, 0077 § 5.1, 0081 B9-TL-8, 0086 § 2.1, 0093, 0123, 0125, 0126, 0128, 0129, 0135, 0139, 0141, 0157.

**Ce que cet avis n'engage pas.** Aucun redéploiement, aucun réglage Vercel, Google, OpenRouter ou Neon, aucune valeur de secret lue, aucun code modifié, aucun test touché. Les réglages et les acceptations de risque listés plus bas restent à Samuel.

## Recommandation

**Recommandation de la Sécurité : `p0-reel` peut être redéployé, sous trois réserves.**
- **S1** : Samuel reprend l'acceptation de 0055 S-2. Elle avait été donnée « derrière la protection Vercel ».
- **S4** : Samuel dit si ce site public vaut « mise en public » au sens de 0034. Si oui, la passe de sécurité de 0034 précède le redéploiement.
- **E2** : le relevé de la route de flux sans cookie est fait **avant** que la garde du mode réel soit ouverte (voir plus bas).

La décision de redéployer revient à Samuel.

Constat, dans le code de `main` (`f9adc17`) :
- **Entrées utilisateur.** Chaque entrée qui peut mener à un appel payant côté serveur passe par la garde du mode réel (`ouvertureP0`) **et** par le cookie `__Host-p0_acces`, que seule la saisie du code pose. C'est vrai pour les actions serveur, les pages et la lecture des voyages, et le contrôle est fait avant toute lecture de clé, toute réservation et tout appel. Appels concernés : modèle via OpenRouter, Google Places, Routes, photos.
- **Vue partagée `/p/…`.** Elle ne demande pas de cookie, mais n'appelle aucun fournisseur payant côté serveur.
- **Étapes de workflow** (`p0Run`, `p0Revision`, route `/.well-known/workflow/v1/flow`). Elles ne lisent **aucun cookie**. Elles sont **bornées** par la garde du mode réel et par une exécution réservée en cours, donc par son forfait. Une exécution ne se réserve qu'avec le cookie. Que la route soit inaccessible sans cookie n'est **pas prouvé** : le seul relevé (0069) a été fait avec le cookie de la protection Vercel (E2).
- **Protection Vercel.** Pour les entrées utilisateur, elle était une barrière de plus et non la barrière du coût. Pour la route de flux, elle masquait le cas « sans cookie », qui reste à relever.

**Condition E2, avant d'ouvrir la garde.** Procédure proposée, à décider par Samuel :
1. Premier redéploiement de `p0-reel` avec `P0_REAL_RUNS` différent de `enabled`. La garde est alors fermée (`src/server/env/p0.ts:92`) et aucun appel payant n'est possible.
2. Relevé E2 sans cookie sur ce déploiement.
3. Seulement ensuite, redéploiement avec `P0_REAL_RUNS=enabled`.

Un relevé en échec arrête l'étape 3.

Autre réserve, hors code d'accès : le seul appel Google payant qui ne dépend pas du code est le chargement de la carte dans le navigateur (Maps JavaScript API, clé publique `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). Ce n'est pas nouveau : la clé est déjà publique sur la production de `main` depuis le 2026-10-12. Mais aucun plafond n'est consigné pour elle (écart E4, question S2).

`main`, déployée en cible production et publique : les gardes `api` et `better-auth` y sont **fermées**, et la barrière de sortie refuse toute construction d'un client réel (§ 2).

## 1. Site d'essai (`p0-reel`) : points vérifiés

### 1.1 Garde du mode réel et code d'accès

| Point | Où | Constat |
|---|---|---|
| Conditions (1) à (7) | `src/server/env/p0.ts:81-100` | Barrière de sortie (l. 81), environnement `staging` seulement (l. 89), `CI` absente (l. 90), `VERCEL_GIT_COMMIT_REF === "p0-reel"` exactement (l. 91), `P0_REAL_RUNS === "enabled"` (l. 92), base posée (l. 93), code décodé par `decodeSecret` (l. 95-99). Aucune clé de service n'est lue. |
| Déploiement de production | `src/server/p0/acces.ts:156-157` | `isProductionDeployment` ferme en plus des conditions de `lireEnvP0`. |
| Force du code | `src/server/env/index.ts:260`, `:317-328` | 32 octets au moins ; les codes triviaux sont refusés (répétitions, suites). |
| Comparaison | `src/server/p0/acces.ts:65-68`, `:202-206` | Temps constant (`timingSafeEqual` sur des empreintes HMAC) ; saisie de plus de 256 caractères refusée sans calcul. |
| Essais | `src/server/p0/acces.ts:213-246` | 5 essais par heure glissante (refus à 5, l. 229). Chaque essai, accepté ou refusé, est compté par l'insertion de la l. 235 (`SQL_ESSAI`, l. 199). Le tout se fait sous verrou consultatif, échec fermé si la base ne répond pas (l. 240-242). Avec un code de 32 octets ou plus, deviner le code en 5 essais par heure n'est pas réaliste. |
| Cookie | `src/server/p0/acces.ts:38-39`, `:48-54`, `:86-106` | `HttpOnly`, `Secure`, `SameSite=Strict`, préfixe `__Host-`, échéance de 12 h intégrée au MAC, vérification en temps constant. |
| Action de saisie | `src/server/actions/p0-acces.ts:20-29` | Seule voie qui pose le cookie, et seulement après `saisirCodeAcces` accepté. |
| Page de saisie | `src/app/prototype/executions/page.tsx:23`, `next.config.ts:37` | Garde fermée : 404. Pages `/prototype/` en `private, no-store`, jamais indexées (0055 S-2 point 5). |

### 1.2 Chaque entrée qui peut coûter de l'argent

| Entrée (appelable par n'importe qui) | Où | Barrière avant tout appel payant |
|---|---|---|
| Lancement depuis `/prototype/executions` | `src/server/actions/p0-lancement.ts:24-25` → `src/server/p0/lancement.ts:128-150` | `ouvrirGardeLancement` (`src/server/p0/garde.ts:67-80`) : garde (l. 68), cookie (l. 71), puis seulement ensuite la réservation (l. 74). |
| Lancement depuis l'app (`createTrip`) | `src/server/actions/creation.ts:107`, `:161-179` → `src/server/p0/creation-essai.ts:153-156` → `lancement.ts:176-232` | Même garde (`lancement.ts:180`), cookie lu dans la requête (`creation-essai.ts:150`). |
| « Réessayer » (`relancerVoyageEssai`) | `creation.ts:297-313` → `creation-essai.ts:157-159` → `lancement.ts:248-294` | Même garde (`lancement.ts:251`). La lecture du brief arrêté n'a lieu qu'après la garde. |
| Révision après le tri (`reviserVoyageEssai`) | `src/server/actions/revision-essai.ts:16-24` → `creation-essai.ts:160-162` → `lancement.ts:342-410` | Même garde (`lancement.ts:346`). |
| Structuration du récit, suggestion de logement | `creation.ts:52-53`, `:75-77` | Fermées sur le site d'essai (`no_option`) avant même la lecture de l'entrée. |
| Recherche de ville (Places Autocomplete et fiche) | `src/server/actions/villes-essai.ts:16-46` → `src/server/composition/villes.ts:81-95` → `src/server/villes/recherche.ts:165-167`, `:206-208` | `ouvertureP0`, puis cookie valide, **avant** de construire le client (qui lit la clé) et de réserver. Cadence par empreinte du cookie (0129 § 3). |
| Photos du tri (Place Photos) | `src/server/actions/photo-essai.ts:22-30` → `src/adapters/index.ts:401-415` → `src/server/p0/photos.ts:113-150` | `ouvrirGardeRelecture` (`garde.ts:148-161`, cookie l. 152) avant de lire le lieu, de réserver (40 par heure) et de construire le client. |
| Relecture Routes à l'affichage d'un voyage | `src/server/p0/relecture.ts:159-200` | `ouvrirGardeRelecture` (l. 188), puis purge récente et forfait. Sans cookie : aucune connexion, aucun appel. |
| Lecture des programmes réels | `src/server/p0/lecture-programmes.ts:23-27` | Garde et cookie avant d'ouvrir le pool (pas d'appel payant, mais aucune donnée sans code). |
| Vue partagée `/p/…` d'un voyage d'essai | `src/server/essai/partage.ts:60-69`, `src/adapters/prototype-instance.ts:259-262` | Pas de cookie (le visiteur n'a pas le code), mais lecture seule après vérification de la signature, avec un relecteur Routes **toujours refusé** : aucun appel serveur payant. |
| Proxy | `src/proxy.ts:32-38`, `:58` | Ne s'applique qu'à `/p/` ; sur le site d'essai, il laisse passer sans compter (`apiShareAvailable()` faux). Il ne protège et n'ouvre aucun appel payant. |
| Étapes de `p0Run` et `p0Revision` (route `/.well-known/workflow/v1/flow`) | `src/workflows/p0-run.ts:584-593`, `:1017` ; `src/server/p0/garde.ts:103-120` | `verifierGardeEtape` à l'entrée de chaque étape : garde **et** exécution réservée `en_cours`, du jour, dans la durée maximale. Un message rejoué ne repasse pas une phase déjà écrite (`src/adapters/prototype-travail.ts:254`, `phase_deja_passee`). La dépense est bornée par le forfait de l'exécution. Sur Vercel, la fonction ne peut être invoquée que par la file (0063 point 8, « Consumer function security »). |
| Routes de développement et webhooks | `src/app/dev/api/prototype/relectures/route.ts:12-14`, `src/app/dev/api/simulation/route.ts:42-43`, `src/app/api/v1/webhooks/*` | 404 hors pages de développement ; aucun appel à OpenRouter ni à Google. |

**Seconde barrière, indépendante :** toute lecture d'une clé passe par la barrière de sortie (`src/server/env/ai.ts:17-22`, `src/server/env/grounding.ts:17-22` → `src/server/env/egress.ts:257`, `:289`). Les seuls constructeurs de clients réels sont `src/ai/openrouter-client.ts:190`, `src/grounding/places-client.ts:339` et `src/grounding/routes-client.ts:160`. Tous les appelants de ces constructeurs sont listés ci-dessus ou au § 2.

### 1.3 Chemins `api` sur une préversion (site d'essai compris)

Sur une préversion Vercel, ils sont fermés trois fois, de façon indépendante :
- garde de l'adaptateur `api` : `src/adapters/api-guard.ts:18-25`, qui refuse dès que `VERCEL_ENV=preview` (`src/adapters/auth-guard.ts:39-42`) ;
- barrière B9-TL-8 : `src/server/generation/barriere.ts:50-76`, avec `BRANCHE_APPELS_REELS = null` (`src/server/config/generation.ts:113`) et le crochet `accesReelApi` qui rend toujours `false` (`src/server/generation/acces-reel.ts:12-14`) ;
- seuils non validés : `src/server/config/villes.ts:28` et `src/server/config/lieux.ts:34`, tous deux à `false`.

## 2. `main` (cible production, publique)

| Garde | Où | État sur un déploiement `VERCEL_ENV=production` |
|---|---|---|
| `better-auth` | `src/adapters/auth-guard.ts:39-42`, `:58-61` | **Fermée** : `production` n'est ni `local` ni `ci`. |
| Connexion simulée | `src/adapters/auth-guard.ts:23-26`, `:53-56` | **Fermée** en production. |
| `api` | `src/adapters/api-guard.ts:18-25` (0086 § 2.1, B6-TL-7 ; 0077 § 5.1, B3-TL-2) | **Fermée** : lève à l'appel. |
| Barrière B9-TL-8 | `src/server/generation/barriere.ts:54` | `production` : aucune composition, aucun client. |
| Adaptateur `prototype` | `src/dev/flags.ts:49-52` | **Fermé** en production. |
| Mode réel P0 | `src/server/env/p0.ts:89-91`, `src/server/p0/acces.ts:156` | **Fermé** : `environment_refused`, `branch_refused`, `production_deployment`. |
| Barrière de sortie | `src/server/env/egress.ts:289` | `production_refused` : aucune clé lue, aucun client réel construit. |
| Paiement, partage, pages de développement | `src/adapters/payment-guard.ts:52-53`, `src/adapters/share-guard.ts:76-77`, `:90-91`, `src/dev/flags.ts:7-9` | **Fermés** en production. |

Seul appel payant possible sur `main` : la carte Google dans le navigateur, avec la clé publique (écart E4).

## 3. Écarts et correctifs (tickets à ouvrir par le CEO)

Aucun écart relevé dans le code ne permet un appel payant côté serveur par une entrée utilisateur sans le code. La route de flux reste à relever (E2). La forme des correctifs E1 à E3 revient au Tech Lead.

- **E1 — Disponibilité : un inconnu peut bloquer Samuel une heure** (0055 S-2 point 2, risque accepté « derrière la protection Vercel »). Le compteur de 5 essais par heure est global, sans adresse (`src/server/p0/acces.ts:197-199`, `:229`). Désormais, n'importe qui sur Internet peut l'épuiser. Aucun coût, aucune fuite. Piste proposée au Tech Lead : compter aussi par adresse, avec l'en-tête de confiance `x-vercel-forwarded-for` (`src/adapters/share-guard.ts:39`, 0051 point 2.1), en gardant le plafond global comme filet. La forme est à trancher par lui (T1). Deux points à chiffrer :
  - la durée de conservation de `prototype.run_attempts`, fixée par `expires_at` (`db/migrations/0003_prototype.sql:227`, purge l. 504) et non relevée ici ;
  - la donnée personnelle qu'ajouterait une adresse IP, même hachée. En attendant, l'acceptation du risque doit être reprise par Samuel (question S1).
- **E2 — Relevé de la route de flux à refaire, sans cookie** (0063 point 8, 0069 « Risques résiduels »). Le relevé de 0069 a été fait avec le cookie de la protection Vercel. Il ne prouvait rien pour un appelant sans cookie, puisque la protection répondait à sa place. Avec la protection désactivée, ce cas est maintenant le cas réel. Condition **avant le premier lancement réel** qui suit le redéploiement : la Sécurité rejoue les sondes de `tests/e2e/p0-flux.e2e.spec.ts` (bloc « préversion ») sans cookie ni jeton de contournement. Attendu : 401, 403 ou 404 prouvé, selon le critère de 0069 point 3. La barrière de chaque étape (§ 1.2) borne la dépense, mais elle ne remplace pas le relevé. Celui-ci est une **condition préalable à l'ouverture de la garde**, selon la procédure en trois temps de la recommandation. Ticket `[secu]` proposé, plus un ticket `[qa]` pour aligner le bloc versionné (le jeton `E2E_P0_REEL_BYPASS` n'a plus d'objet tant que la protection est désactivée).
- **E3 — Commentaire devenu faux, et journal ouvert à tous** : `src/server/p0/acces.ts:169-172` dit que les préversions sont « derrière la protection Vercel ». Sur une préversion d'une autre branche (garde fermée, `branch_refused`), chaque affichage de `/prototype/executions` écrit `p0.guard_closed` (l. 177-179), et n'importe qui peut maintenant l'inonder. Pas de coût (offre gratuite), mais du bruit dans un journal qui ne garde qu'une heure (§ 4). Petit ticket `[back]` : corriger le commentaire. Le Tech Lead décide si l'affichage cesse de journaliser hors de `p0-reel` (T2). La PR #1052, si elle fusionne, ne fait plus construire que `main` et `p0-reel`, ce qui réduit ce point.
- **E4 — Carte Google dans le navigateur, hors du code d'accès.** La clé `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` est publique par nature. Elle est acceptée par tout `*.vercel.app` (`docs/deploiement/variables-environnement.md` l. 159-169) et aucun plafond de quota n'est consigné pour elle. La vue partagée `/p/` du site d'essai n'est pas limitée en débit (`src/proxy.ts:38`) : chaque visite d'un lien partagé charge la carte (Dynamic Maps). Le coût reste borné par le palier gratuit de Google et par le quota que Samuel posera, mais aucun code ne le borne. Réglage de Samuel (question S2). Ticket `[back]` facultatif : limiter `/p/` aussi sur le site d'essai.
- **E5 — Toutes les préversions sont publiques, avec les clés réelles (état à confirmer par Samuel, S3).** D'après 0034 (état du 2026-10-12, que je n'ai pas revérifié : aucun réglage Vercel n'a été lu), `OPENROUTER_API_KEY`, `GOOGLE_MAPS_SERVER_KEY` et l'identifiant propriétaire Neon sont posés sur **toutes** les préversions, pas seulement sur `p0-reel`. Le code ferme ces chemins hors de `p0-reel` (§ 1.1, condition 4, et § 1.3). Mais une préversion d'une branche `claude/…` non encore revue est désormais joignable par n'importe qui. La branche hérite des gardes de `main`, sauf si sa PR les touche, et c'est justement ce que la revue Sécurité doit attraper. Réglage de Samuel (question S3) : limiter ces variables à la branche `p0-reel` dans Vercel (« Preview » avec une branche précise). C'est le point 2 de la passe de 0034. La PR #1052 (ne construire que `main` et `p0-reel`) réduirait le nombre de préversions exposées, mais pas la portée des variables.

## 4. Ce que changent des journaux gardés une heure

- **Un relevé fondé sur le journal se fait dans l'heure.** Le relevé de 0055 S-1 point 4 (`p0.guard_closed` à l'affichage de la page) et la preuve (c) de 0069 point 3 (décompte des invocations) se lisent dans la fenêtre de rétention, au plus tard une heure après la sonde. Au-delà, le relevé est nul et doit être refait.
- **Une enquête après coup ne peut plus s'appuyer sur Vercel.** `p0.guard_closed`, `p0.ville_refusee`, `essai.photo_unavailable`, `p0.read_unavailable` et `p0.programme_written` disparaissent après une heure. Les traces durables sont en base : `prototype.run_attempts` (résultat de chaque essai de code, sans valeur), `prototype.runs` et `prototype.forfaits` (exécutions réservées, coût compté), et les réservations de la recherche de ville (par empreinte de cookie). La dépense réelle se lit dans les consoles OpenRouter et Google Cloud, qui deviennent la seule alarme fiable.
- **Pas de journal déporté (drain).** Il demanderait une offre payante ou un compte externe : réservé à Samuel. Aucune API propre à Vercel n'est proposée (0002).
- **Les plafonds de coût ne dépendent pas du journal.** Forfait par exécution, fusible de 2 USD par voyage (0093), cadences de la ville et des photos : tout est compté en base, avant l'appel. Une rétention d'une heure ne desserre aucun plafond.

## 5. Risques réexaminés (acceptés jusqu'ici « derrière la protection Vercel »)

- **0055 S-2 point 1** (cookie volé valable 12 h au plus) : la protection Vercel n'y changeait rien pour qui détient le cookie (`HttpOnly`, `SameSite=Strict`, il ne se lit pas par une autre origine). Avis : maintenu, sous réserve de la reprise de l'acceptation par Samuel (question S1).
- **0055 S-2 point 2** (5 essais globaux) : aggravé, voir E1.
- **0062 § 6 et 0065 § 2** (fichier OpenSSL, pas de protection post-quantique) : ces risques portent sur la configuration de la plateforme et sur le trafic sortant, pas sur l'accès au site. La protection des préversions ne les bornait pas. Avis : inchangés.
- **0034 « mise en public »** : avis de la Sécurité, non tranché ici. Une adresse joignable sans authentification ne semble pas être, au sens de 0034, un « premier accès au produit pour une personne extérieure », tant que personne d'extérieur n'est invité. L'interprétation de 0034 revient à Samuel (question S4).

## Questions nouvelles, par destinataire

**Samuel** (argent, comptes externes, acceptation de risque : réservé)
- **S1** — Reprends-tu l'acceptation de 0055 S-2 points 1 et 2 maintenant que `p0-reel` sera joignable par tous ? Conséquence : n'importe qui peut te bloquer la saisie du code pendant une heure, sans coût, jusqu'au correctif E1. Bloque : le redéploiement, réserve de la recommandation.
- **S5** — Acceptes-tu la procédure de la condition E2 : redéploiement garde fermée, relevé, puis ouverture de la garde ? Bloque : l'ouverture de la garde.
- **S2** — Peux-tu poser un quota journalier sur Maps JavaScript API dans Google Cloud Console, et confirmer que les quotas Places et Routes, ainsi que la limite de crédit OpenRouter (0034 point 5), sont toujours en place ? Ce sont les seules bornes de coût hors du code, et les seules alarmes depuis que le journal ne garde qu'une heure. Bloque : rien ; recommandé avant le redéploiement.
- **S3** — Peux-tu confirmer l'état réel de ces variables dans Vercel, par environnement, sans les valeurs ? L'état de 0034 date du 2026-10-12. Et faut-il limiter `OPENROUTER_API_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `P0_RUN_TOKEN`, `P0_DATABASE_URL` et l'identifiant Neon à la seule branche `p0-reel` des préversions ? Bloque : rien ; réduit E5.
- **S4** — Considères-tu qu'un site joignable sans protection est une « mise en public » au sens de 0034 ? Si oui, la passe de sécurité de 0034 (six points) doit être faite avant le redéploiement. Bloque : le redéploiement (réserve de la recommandation) ; si la réponse est oui, la passe de 0034 le précède.

**Tech Lead**
- **T1** — Forme du correctif E1 : faut-il un compteur par adresse, en plus du compteur global ou à sa place ? Avec quelle durée de conservation (`expires_at` actuel à relever), quelle donnée personnelle (adresse IP, même hachée, à justifier) et quel contrat de schéma (`prototype.run_attempts`) ? Bloque : le ticket E1.
- **T2** — E3 : l'affichage de `/prototype/executions` doit-il cesser d'écrire `p0.guard_closed` hors de `p0-reel` ? Bloque : rien.

**CEO**
- **C1** — Ouvrir les tickets E1 (`[back]`/`[secu]`), E2 (`[secu]` et `[qa]`) et E3 (`[back]`), plus E4 si le Tech Lead le juge utile, et reporter S1 à S5 dans `QUESTIONS.md`. Le relevé E2 se programme juste après le redéploiement de `p0-reel` par Samuel.
