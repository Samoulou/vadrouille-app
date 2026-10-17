# 0008 — Intégration de Better Auth : aucune route exposée, code à 6 chiffres, organisations, contexte de session

Statut : proposé · Date : 2026-10-08, reprise le 2026-10-11 dans B0a (découpage de #27, Q43) avec la correction du point 5 de la seconde revue Sécurité, complétée le 2026-10-11 (correction 2 de #114 : limiteur dans nos actions, regroupement IPv6, purges techniques, ordre de `verifyCode` pour une organisation en suppression) · Décideur : Tech Lead (architecture, délégation « Qui décide quoi » ; le choix de Better Auth est une décision de Samuel, Q4) · Définitif sans veto de Samuel avant le 2026-10-13 ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio »

**Amendée par 0077** (§ 5.3, ticket #415) : « B3 garde sa signature » (contexte de session) se lit « B3 garde ce qu'elle renvoie » ; `getRequestContext()` devient asynchrone en B3c (B3-TL-4).

## Contexte
Q4 tranchée par Samuel : Better Auth. Cadrage D8 et écran 4 : email et code à 6 chiffres, sans mot de passe ; organisations et rôles natifs ; rôles `propriétaire` et `conseiller` (§ 6.8). PO-3 : organisation personnelle créée à la première connexion, invisible au MVP. Décision 0017 § 3 : l'écran 4 appelle les actions serveur `requestCode` et `verifyCode` (`src/server/actions/compte.ts`) par `AuthAdapter`.

La seconde revue Sécurité de #27 (point 5) relève qu'exposer `/api/auth/[...all]` avec le rôle `vadrouille_auth` ouvre toutes les opérations de la bibliothèque (suppression d'organisation, changement de rôle ou retrait de membre, changement d'email, suppression d'utilisateur…), qui contourneraient `purge_organization_data` et l'invariant « un propriétaire », et que les droits de `vadrouille_auth` ne sont pas décrits table par table.

## Décision
**Version** : `better-auth` 1.7.7 (vérifiée le 2026-10-08 ; compatible `drizzle-orm` ^0.45.2, `drizzle-kit` ≥ 0.31.4, Next.js 16), adaptateur Drizzle, connexion par le rôle `vadrouille_auth`, dont les droits sont fixés table par table par la décision 0007.

**Aucune route exposée.** Le gestionnaire HTTP de Better Auth (`toNextJsHandler`, route `/api/auth/[...all]`) n'est **pas monté** ; aucune route de l'application ne transmet une requête à Better Auth. Toute requête vers `/api/auth/*` reçoit 404. La bibliothèque n'est utilisée que côté serveur, par l'objet `auth.api`, depuis `src/server/auth` (et sa configuration dans `src/tenancy`), avec cette **liste blanche** d'opérations :
| Opération de Better Auth | Appelée par |
|---|---|
| envoi d'un code (`emailOTP`, type connexion) | action `requestCode` |
| connexion par code (`emailOTP`) | action `verifyCode` |
| lecture de la session | `getRequestContext()` |
| déconnexion | action `signOut` |
| création de l'utilisateur, de l'organisation personnelle et de l'adhésion `owner` | crochets de base de données lors de la première connexion (ci-dessous) |

Toute autre opération est désactivée dans la configuration quand la bibliothèque le permet (suppression d'utilisateur, changement d'email, création d'organisation par l'utilisateur, suppression et mise à jour d'organisation, invitations, ajout, retrait et changement de rôle d'un membre, sessions multiples), et en tout cas jamais appelée : une règle ESLint n'autorise `auth.api` que dans `src/server/auth` et `src/tenancy`, et n'y autorise que les opérations de la liste. La suppression de compte passe par `deleteAccount` (handover § 12), jamais par la bibliothèque. Les cookies de session sont posés depuis les actions serveur par le greffon `nextCookies`. Si B3 constate qu'une opération de la liste ne peut pas être appelée sans le gestionnaire HTTP, il monte une route qui ne transmet **que** les chemins de cette liste (tout autre chemin : 404, test à l'appui) et amende cette décision.

**Greffons**
| Greffon | Réglage | Valeur |
|---|---|---|
| `emailOTP` | longueur du code | 6 chiffres |
| | validité | 10 minutes |
| | essais par code | 3, puis le code est invalidé |
| | stockage du code | haché |
| | inscription | créée à la première vérification réussie (pas de mot de passe) |
| `organization` | rôles | `owner` (= propriétaire), `member` (= conseiller) ; `admin` non attribué au MVP |
| | création par l'utilisateur | désactivée au MVP (PO-3 : seule l'organisation personnelle existe) |
| | invitations, changement de rôle, retrait de membre, suppression d'organisation | désactivés au MVP |
| `nextCookies` | — | cookies posés depuis les actions serveur |

**Invariant « un propriétaire »** : toute organisation existante **qui n'est pas en suppression** (`deletion_requested_at` nul) a exactement une adhésion `owner` ; une organisation en suppression n'en a plus aucune (handover § 12), vérifiée en base par un déclencheur contraint différé, et `vadrouille_auth` n'a jamais `UPDATE` sur `memberships` (décision 0007). Test `organisations: exactement un propriétaire`.

**Limitation des envois et des vérifications**
- **Conception par défaut : notre limiteur, dans nos actions** (correction 2 de #114, Sécurité S3). Le limiteur intégré de Better Auth est branché sur son routeur HTTP, que nous ne montons pas ; son stockage personnalisé (`rateLimit.customStorage`) ne s'exécuterait probablement pas lors d'un appel direct à `auth.api`. Les actions `requestCode` et `verifyCode` appliquent donc elles-mêmes la limitation **avant** l'appel à `auth.api`, sur la table `action_rate_limits` (rôle `vadrouille_limiter`, décision 0007), avec les mêmes compteurs que les actions sans compte. Clés : HMAC-SHA-256 avec `RATE_LIMIT_HMAC_SECRET` sur un message à **préfixe de domaine par usage** (`rl/v1/<action>/ip/<adresse IPv4 ou préfixe IPv6 /64>`, `rl/v1/<action>/email/<email normalisé>`) ; le secret ne sert à rien d'autre. Aucune adresse IP ni email en clair en base. Chaque écriture supprime, par lot borné, les fenêtres expirées de toutes les clés (donnée technique sans valeur après la fenêtre ; ce n'est pas une durée de conservation, Q27). Règles de départ : envoi de code, 3 par 10 minutes et par adresse IP ; vérification, 10 par 10 minutes et par adresse IP. Les seuils réels relèvent de Q86 (Tech Lead, Sécurité). **B3 vérifie sur 1.7.7** si le limiteur intégré s'applique aux appels `auth.api` et note le résultat ici : s'il s'applique, il peut rester comme second verrou (table `rate_limits`, clés HMAC par `customStorage`, même purge), jamais comme seul verrou ; sinon, `rate_limits` n'est pas créée. Test `auth: aucune adresse IP ni email en clair dans les limiteurs`. *(Amendé par 0050 et 0051 : arrêt de l'incrément à la première clé au-dessus de son seuil, clé avec la fenêtre ; voir la note sous le tableau de l'adresse IP de confiance.)*
- **Regroupement IPv6** : une adresse IPv6 est comptée par son préfixe /64 ; une IPv4 intégrée à une IPv6 est ramenée à l'IPv4. Test `limitation: les adresses d'un même préfixe IPv6 /64 partagent un compteur`.
- **Adresse IP de confiance, par environnement** (`advanced.ipAddress.ipAddressHeaders`, variable `TRUSTED_IP_HEADER` validée par ~~`src/server/env.ts`~~ `src/server/env/index.ts` (0050, B3-TL-1)) : voir le tableau.

| Environnement | En-tête lu | Autres en-têtes (`X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `CF-Connecting-IP`…) |
|---|---|---|
| Local et CI | le même en-tête `x-vercel-forwarded-for`, posé seulement par les tests pour simuler une adresse ; sans lui, compartiment commun | ignorés |
| Staging et production (Vercel) | `x-vercel-forwarded-for` seulement, posé par la plateforme Vercel (à confirmer par B3 dans la documentation Vercel et par un essai sur staging avec un en-tête forgé ; sinon la décision est amendée avant B3) | ignorés |

> **Amendé par les décisions 0050 et 0051 (2026-10-14)** : en **local**, aucun en-tête n'est lu (`TRUSTED_IP_HEADER` refusée au démarrage ; compartiment commun ; les tests du limiteur injectent leur configuration) ; en **CI**, `TRUSTED_IP_HEADER` n'est admise que sur un serveur autonome lié à la boucle locale (`HOSTNAME` à `127.0.0.1`, `::1` ou `localhost`, 0051 point 2.3), et seuls les tests posent l'en-tête ; partout, seule la valeur `x-vercel-forwarded-for` est admise, et hors Vercel elle est refusée. Le limiteur (puce « Conception par défaut ») arrête l'incrément à la première clé au-dessus de son seuil (0051 point 6.2.2, accepté par 0050) ; clé `rl/v1/<action>/<fenêtre>/…` (0050, B3-TL-6). `src/server/env.ts` se lit `src/server/env/index.ts` (0050, B3-TL-1). B3b écrit l'amendement complet de cette décision (critère B14).

Le réglage par défaut de Better Auth lit `x-forwarded-for`, que le client peut forger : il est remplacé. Sans en-tête de confiance, Better Auth 1.7.7 place la requête dans un compartiment commun par chemin (`no-trusted-ip`) : l'échec est fermé (limite partagée stricte), jamais une absence de limite. Notre limiteur applique la même règle : sans en-tête de confiance, la requête tombe dans un compartiment commun strict par action. Le même en-tête et la même règle servent au limiteur des actions sans compte (handover § 7).

- **Suivi d'IP** : `advanced.ipAddress.disableIpTracking` **n'est pas activé**. Vérifié dans le code de Better Auth 1.7.7 (`@better-auth/core`, `utils/ip` ; `api/rate-limiter`) : cette option fait renvoyer `null` à `getIP` et le limiteur ne s'applique plus. La collecte minimale (cadrage § 9) est obtenue autrement : un crochet `databaseHooks.session.create.before` vide `ipAddress` et `userAgent` avant l'écriture de la session. B3 vérifie sur 1.7.7 que le crochet suffit ; sinon, Q47 (Samuel).
- **Par adresse email**, contrôlé par notre code avant l'appel à Better Auth, dans `action_rate_limits` sous une clé HMAC (jamais l'adresse en clair) : 5 envois par heure et 10 vérifications par heure. L'adresse est **normalisée** pour la clé du limiteur : espaces retirés, minuscules, Unicode NFC, partie locale tronquée au premier `+`. La normalisation ne sert qu'au limiteur ; l'identité du compte est l'adresse en minuscules. **Risque noté** : retirer l'alias `+` ailleurs que dans la clé du limiteur fusionnerait des identités (`a+x@…` et `a@…` sont deux boîtes distinctes chez certains fournisseurs) ; la forme normalisée n'est donc jamais utilisée pour créer, chercher ou rattacher un compte. Test `auth: deux adresses qui ne diffèrent que par l'alias + sont deux comptes distincts`. Effet de bord accepté : ces deux adresses partagent le compteur du limiteur, et la suppression de compte de l'une retire aussi ce compteur commun. Limite connue : un tiers peut épuiser la limite d'une adresse et retarder la connexion de la personne d'une heure au plus ; acceptée au MVP, suivie avec Q86.
- **Réponse identique** : l'envoi de code renvoie la même réponse que l'adresse soit connue ou non, dans le même temps (décision 0017 § 4) ; un refus du limiteur renvoie `rate_limited` dans les deux cas.

**Protection des requêtes** : sans route Better Auth, les seules entrées sont nos actions serveur, protégées par le contrôle d'origine de Next.js ; `BETTER_AUTH_URL` fixe l'origine attendue de la bibliothèque. **Critère bloquant de B3** : B3 vérifie si Better Auth 1.7.7 stocke les jetons de session hachés et note le résultat ici. S'ils sont stockés en clair, B3 ne fusionne pas tant que le Tech Lead n'a pas décidé une parade (amendement de cette décision) et qu'elle n'est pas testée (`auth: aucun jeton de session en clair dans sessions`).

**Session** : cookie `httpOnly`, `secure`, `sameSite=lax` ; durée 7 jours, prolongée au plus une fois par jour (valeurs par défaut de Better Auth). Adresse IP et agent utilisateur non conservés dans la session (crochet ci-dessus ; collecte minimale, cadrage § 9).

**Purges techniques** : `requestCode` et `verifyCode` suppriment, par lot borné, les lignes de `verifications` expirées ou consommées (l'email y est en clair dans `identifier`) et les lignes de `sessions` dont `expires_at` est passé ; si Better Auth 1.7.7 le fait déjà, B3 le constate ici et garde le test. Ce ne sont pas des durées de conservation (Q27). Test `auth: les vérifications et sessions expirées sont purgées`.

**Organisation en suppression et `verifyCode`** : ordre (a) notre limiteur ; (b) vérification du code par Better Auth ; (c) le crochet `databaseHooks.session.create.before` refuse la création de la session si l'organisation personnelle est en suppression (aucun cookie ; B3 vérifie sur 1.7.7 qu'un refus du crochet n'ouvre aucune session) ; (d) `verifyCode` reprend l'étape 2 de la suppression (`src/server/account/delete.ts`) ; (e) réponse `unauthenticated`. **Réauthentification récente** : `exportAccount` et `deleteAccount` exigent une session ouverte par une vérification de code depuis moins de 10 minutes (handover § 12).

**Organisation personnelle** : crochet `databaseHooks.user.create.after` qui crée, dans la même transaction, l'organisation (`kind = personal`) et l'adhésion `owner` ; crochet de création de session qui pose `activeOrganizationId` sur cette organisation.

**Noms de tables** : configuration de schéma de Better Auth pour obtenir `users`, `sessions`, `accounts`, `verifications`, `rate_limits`, `organizations`, `memberships`, `invitations` (`rate_limits` seulement si le limiteur intégré est gardé comme second verrou ; une seule table par notion, pas de doublon avec les tables du cadrage § 6.8). À vérifier sur la version figée lors de B3 ; à défaut, les noms par défaut de Better Auth sont gardés et le handover est amendé.

**Contexte de session** : `getRequestContext()` (`src/server`) lit la session Better Auth, vérifie l'adhésion à `activeOrganizationId`, refuse (`unauthenticated`) une organisation en suppression (`deletion_requested_at` posé, décision 0007, handover § 12) et renvoie `{ organizationId, userId, role }`, qui devient l'`AdapterContext` (évolution : ajout de `userId` et `role`) et la valeur de `app.organization_id` pour la RLS (décision 0007). Aucune action n'accepte une organisation venue du client. En phase 0, la fonction de même nom dans `src/adapters` renvoie le contexte simulé (décision 0013 § 3.6) ; B3 garde sa signature.

**Secret** : `BETTER_AUTH_SECRET` d'au moins 32 octets aléatoires, distinct par environnement ; ~~`src/server/env.ts`~~ `src/server/env/index.ts` (0050, B3-TL-1) refuse le démarrage sinon (longueur contrôlée). Aucune valeur dans le dépôt.

**Emails** : transport SMTP par `nodemailer` 10.0.16. En local et en CI, Mailpit (image `axllent/mailpit:v1.31.4`, sans compte) capte les messages ; les tests de bout en bout lisent le code dans son API. Le fournisseur réel relève de Samuel (Q25).

**Administration** : aucune interface d'administration au MVP. Le jour où elle existe, elle exige les greffons `admin` et `twoFactor` (double authentification obligatoire pour tout rôle administrateur, cadrage § 9).

## Conséquences
- Tests de B3 : `auth: aucune route /api/auth n'est exposée` (un échantillon de chemins de la bibliothèque, dont suppression d'utilisateur, changement d'email, suppression d'organisation, changement de rôle, renvoie 404), `auth: seules les opérations de la liste blanche sont appelées` (règle ESLint et son test), `auth: code à 6 chiffres valable 10 minutes, 3 essais`, `auth: limitation des envois` (avec des en-têtes `X-Forwarded-For` et `X-Real-IP` forgés et changeants à chaque requête : la limite tient ; avec des variantes de casse et d'alias `+` d'une même adresse : la limite par email tient), `auth: réponse identique pour une adresse connue ou inconnue`, `auth: sans en-tête de confiance, la limite reste appliquée`, `auth: organisation personnelle créée à la première connexion`, `auth: le contexte vient de la session, jamais du client`, `organisations: exactement un propriétaire`, `auth: aucune adresse IP ni email en clair dans les limiteurs`, `limitation: les adresses d'un même préfixe IPv6 /64 partagent un compteur`, `auth: les vérifications et sessions expirées sont purgées`, `auth: deux adresses qui ne diffèrent que par l'alias + sont deux comptes distincts`, et, s'il le faut, `auth: aucun jeton de session en clair dans sessions`.
- L'adaptateur `auth` du front (handover front § 17, point 3) suit le contrat `AuthAdapter` (décision 0017) ; l'adaptateur simulé de F8 et l'adaptateur Better Auth passent la même suite de tests.
