# 0008 — Intégration de Better Auth : code à 6 chiffres, organisations, contexte de session

Statut : proposé · Date : 2026-10-08 · Décideur : Tech Lead (architecture, délégation « Qui décide quoi » ; le choix de Better Auth est une décision de Samuel, Q4) · Définitif sans veto de Samuel avant le 2026-10-10

## Contexte
Q4 tranchée par Samuel : Better Auth. Cadrage D8 et écran 4 : email et code à 6 chiffres, sans mot de passe ; organisations et rôles natifs ; rôles `propriétaire` et `conseiller` (§ 6.8). PO-3 : organisation personnelle créée à la première connexion, invisible au MVP.

## Décision
**Version** : `better-auth` 1.7.7 (vérifiée le 2026-10-08 ; compatible `drizzle-orm` ^0.45.2, `drizzle-kit` ≥ 0.31.4, Next.js 16), adaptateur Drizzle, connexion par le rôle `vadrouille_auth` (décision 0007).

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
| | invitations | hors MVP (espace agence) |
| `nextCookies` | — | cookies posés depuis les actions serveur |

**Limitation des envois et des vérifications**
- Limiteur intégré de Better Auth activé dans tous les environnements, stockage `database` dans `rate_limits` (jamais en mémoire ni dans un stockage propre à Vercel). Règles : envoi de code, 3 par 10 minutes et par adresse IP ; vérification, 10 par 10 minutes et par adresse IP.
- **Adresse IP de confiance, par environnement** (`advanced.ipAddress.ipAddressHeaders`, variable `TRUSTED_IP_HEADER` validée par `src/server/env.ts`) : voir le tableau.

| Environnement | En-tête lu | Autres en-têtes (`X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `CF-Connecting-IP`…) |
|---|---|---|
| Local et CI | le même en-tête `x-vercel-forwarded-for`, posé seulement par les tests pour simuler une adresse ; sans lui, compartiment commun | ignorés |
| Staging et production (Vercel) | `x-vercel-forwarded-for` seulement, posé par la plateforme Vercel (à confirmer par B3 dans la documentation Vercel et par un essai sur staging avec un en-tête forgé ; sinon la décision est amendée avant B3) | ignorés |

Le réglage par défaut de Better Auth lit `x-forwarded-for`, que le client peut forger : il est remplacé. Sans en-tête de confiance, Better Auth 1.7.7 place la requête dans un compartiment commun par chemin (`no-trusted-ip`) : l'échec est fermé (limite partagée stricte), jamais une absence de limite. Le même en-tête et la même règle servent au limiteur des actions sans compte (handover § 7).

- **Suivi d'IP** : `advanced.ipAddress.disableIpTracking` **n'est pas activé**. Vérifié dans le code de Better Auth 1.7.7 (`@better-auth/core`, `utils/ip` ; `api/rate-limiter`) : cette option fait renvoyer `null` à `getIP` et le limiteur ne s'applique plus. La collecte minimale (cadrage § 9) est obtenue autrement : un crochet `databaseHooks.session.create.before` vide `ipAddress` et `userAgent` avant l'écriture de la session. B3 vérifie sur 1.7.7 que le crochet suffit ; sinon, les colonnes sont conservées le temps de la session, inscrites à l'inventaire des données personnelles et signalées à Samuel (Q27).
- **Par adresse email**, contrôlé par notre code avant l'appel à Better Auth, dans `rate_limits` sous une clé HMAC (jamais l'adresse en clair) : 5 envois par heure et 10 vérifications par heure. L'adresse est **normalisée** pour la clé du limiteur : espaces retirés, minuscules, Unicode NFC, partie locale tronquée au premier `+`. La normalisation ne sert qu'au limiteur ; l'identité du compte est l'adresse en minuscules.
- **Réponse identique** : l'envoi de code renvoie la même réponse (statut, corps, en-têtes) que l'adresse soit connue ou non ; l'envoi effectif est asynchrone pour que la durée de réponse ne dépende pas de l'existence du compte. Un refus du limiteur renvoie `rate_limited` dans les deux cas.

**Session** : cookie `httpOnly`, `secure`, `sameSite=lax` ; durée 7 jours, prolongée au plus une fois par jour (valeurs par défaut de Better Auth). Adresse IP et agent utilisateur non conservés dans la session (crochet ci-dessus ; collecte minimale, cadrage § 9).

**Organisation personnelle** : crochet `databaseHooks.user.create.after` qui crée, dans la même transaction, l'organisation (`kind = personal`) et l'adhésion `owner` ; crochet de création de session qui pose `activeOrganizationId` sur cette organisation.

**Noms de tables** : configuration de schéma de Better Auth pour obtenir `users`, `sessions`, `accounts`, `verifications`, `rate_limits`, `organizations`, `memberships`, `invitations` (une seule table par notion, pas de doublon avec les tables du cadrage § 6.8). À vérifier sur la version figée lors de B3 ; à défaut, les noms par défaut de Better Auth sont gardés et le handover est amendé.

**Contexte de session** : `getRequestContext()` (`src/server`) lit la session Better Auth, vérifie l'adhésion à `activeOrganizationId` et renvoie `{ organizationId, userId, role }`, qui devient l'`AdapterContext` (évolution : ajout de `userId` et `role`) et la valeur de `app.organization_id` pour la RLS (décision 0007). Aucune action n'accepte une organisation venue du client.

**Secret** : `BETTER_AUTH_SECRET` d'au moins 32 octets aléatoires, distinct par environnement ; `src/server/env.ts` refuse le démarrage sinon (longueur contrôlée). Aucune valeur dans le dépôt.

**Emails** : transport SMTP par `nodemailer` 10.0.16. En local et en CI, Mailpit (image `axllent/mailpit:v1.31.4`, sans compte) capte les messages ; les tests de bout en bout lisent le code dans son API. Le fournisseur réel relève de Samuel (Q25).

**Administration** : aucune interface d'administration au MVP. Le jour où elle existe, elle exige les greffons `admin` et `twoFactor` (double authentification obligatoire pour tout rôle administrateur, cadrage § 9).

## Conséquences
- Tests de B3 : `auth: code à 6 chiffres valable 10 minutes, 3 essais`, `auth: limitation des envois` (avec des en-têtes `X-Forwarded-For` et `X-Real-IP` forgés et changeants à chaque requête : la limite tient ; avec des variantes de casse et d'alias `+` d'une même adresse : la limite par email tient), `auth: réponse identique pour une adresse connue ou inconnue`, `auth: sans en-tête de confiance, la limite reste appliquée`, `auth: organisation personnelle créée à la première connexion`, `auth: le contexte vient de la session, jamais du client`.
- L'adaptateur `auth` du front (handover front § 17, point 3) suit le contrat `AuthAdapter` ; l'adaptateur simulé de F8 et l'adaptateur Better Auth passent la même suite de tests.
