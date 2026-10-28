# B3d — Envoi réel des e-mails par Resend

Rôle : backend (M2a), précédé d'une décision de la Sécurité (M2-S) · Rédaction : Product Owner · Ticket : #830 (spécification) ; tickets M2-S et M2a à créer par le CEO · Revue : Tech Lead, Sécurité · Origine : plan `docs/plans/mvp-etapes-1-9.md` (PR #829, en revue), étape 2, ligne M2-spec ; feu vert de Samuel du 2026-10-28 pour les étapes 1 à 9 du MVP · Référence : `specs/B3-compte-connexion.md` (« B3 » : B3b point 2, B3-TL-2, question 8), `specs/B3b-envoi-email.md` (« B3b-envoi » : points 3 à 5, critères E2 à E6, B3b-envoi-PO-1 et PO-2), décisions 0098 (SMTP vers Mailpit), 0077 § 5.1 et § 5.6 (port `CodeMailer`, garde `better-auth`), 0050 et 0051 (limiteur), 0002 (aucun stockage propre à Vercel), 0035 (porte `owner-approved`), 0093 ; `docs/deploiement/variables-environnement.md` ; Q25 (Resend, tranchée), Q354 (100 e-mails de connexion par jour, tranchée), Q401

État du code vérifié sur `origin/main` à `9073fc6` : port `CodeMailer` (`src/server/mail/port.ts`), implémentation désactivée (`disabled.ts`), SMTP vers Mailpit seulement (`smtp.ts`), contrôle d'enveloppe `checkEnvelope` (`enveloppe.ts`), expéditeur `SENDER_ADDRESS = "connexion@exemple.test"` (`src/server/config/email.ts`), gardes de `EMAIL_TRANSPORT` et `SMTP_URL` dans `src/server/env/index.ts` (l. 375-416 : refus sur Vercel quel que soit `VADROUILLE_ENV`, seule valeur admise `smtp`), événements `email.address_refused`, `email.transport_disabled`, `email.envelope_refused` (`src/server/log.ts`), texte d'erreur `connexion.erreurs.*` (`src/i18n/fr/connexion.json`). Aucun plafond global d'envois n'existe.

## Objectif
Permettre un **envoi réel** du code de connexion par Resend, depuis la seule préversion `mvp-essai` (plan, § 0 point 7 et tâche M1h), pour que Samuel reçoive un vrai code dans sa boîte. L'envoi est borné par un **plafond global quotidien** compté en base, ne laisse aucune adresse ni aucun code dans les journaux, et dit clairement à l'écran quand le plafond est atteint. Le même transport et le même plafond serviront ensuite aux e-mails des étapes 6 et 7 (rappels, « aperçu prêt »), qui ne sont pas codés ici.

Le studio **n'envoie jamais rien de réel** : tout se teste en `local` et en `ci` sur un double de Resend. Le premier envoi réel a lieu sur la préversion, après l'action S1 de Samuel (plan, § 11 : création du compte Resend et pose de la clé).

## Ce que B3d ne fait pas
- Aucun compte Resend, aucune clé, aucune variable dans Vercel : action S1 de Samuel (plan, § 11), demandée par le CEO quand M2a et M1h sont fusionnées.
- Aucun domaine d'envoi, ni SPF, ni DKIM : étape 10 (question 7 de la PR #829, Samuel). Tant qu'il n'y a pas de domaine vérifié, Resend n'envoie qu'à l'adresse du compte Resend (voir « Expéditeur »).
- Aucune ouverture de `better-auth` ni de `api` sur la préversion : tâche M1h (amendements de 0077 § 5.1 et 0086 § 2.1 par le Tech Lead et la Sécurité).
- Aucun e-mail autre que le code de connexion : « aperçu prêt » (M7a) et rappels (M6c) ont leur spécification. B3d leur prépare seulement le plafond commun (point 3) et le transport.
- Aucun changement du limiteur par adresse IP et par adresse e-mail (0050, 0051), de la forme canonique (`parseEmailAddress`), du texte de l'e-mail (B3b-envoi-PO-1) ni de Better Auth.
- Aucune mise en production : `better-auth` reste refusé en `staging` et `production` (B3-TL-2), et l'envoi réel est refusé sur le déploiement de production de Vercel (point 2).

## Prérequis
- **M2-S** : décision de la Sécurité écrite dans `docs/decisions/` (amendement de 0098 ou décision nouvelle) qui tranche les questions S1 à S7 ci-dessous, au minimum le **transport** (S1) et le **nom et le confinement de la clé** (S2). Le code de M2a ne commence pas avant.
- Décision du Tech Lead sur le stockage du compteur (question T1), écrite dans M2-S, dans la décision du Tech Lead correspondante ou dans la PR de M2a si le Tech Lead l'y accepte.
- Une seule tâche par cycle touche `db/migrations` (plan, § 10) : si le compteur demande une migration, le CEO place M2a en conséquence.
- B3b-envoi fusionnée (#548) : c'est le cas.

## Transport : deux options, au choix de la Sécurité (M2-S)
Resend offre deux chemins. Les deux tiennent les critères de cette spécification ; ils n'impliquent pas les mêmes changements. Le Product Owner ne choisit pas : c'est la Sécurité qui tranche (0098 § 7), le Tech Lead étant consulté sur les dépendances.

| | **A. API HTTPS de Resend** | **B. SMTP de Resend** |
|---|---|---|
| Appel | `POST https://api.resend.com/emails`, en-tête `Authorization: Bearer <clé>`, corps JSON `{ from, to: [<adresse>], subject, text }` | `smtp.resend.com`, TLS implicite (465) ou STARTTLS exigé (587), utilisateur `resend`, mot de passe = la clé |
| Bibliothèque | `fetch` de Node, aucune dépendance nouvelle ; ou le SDK officiel `resend` (dépendance nouvelle, liste de 0008, scripts d'installation à constater) : choix du Tech Lead (T3) | `nodemailer` 10.0.16, déjà présent ; aucune dépendance nouvelle |
| Effet sur 0098 | 0098 reste intacte pour Mailpit ; une valeur nouvelle de `EMAIL_TRANSPORT` (proposition `resend`) et un module nouveau à capacité réseau (`fetch`) dans `src/server/mail/**` | **Amende** 0098 : hôte hors de la liste fermée (§ 2.3), TLS exigé, authentification et validation de certificat (§ 3.3), options du transport (§ 3.1 et 3.2 : `secure` ou `requireTLS`, `auth`) ; la clé ne doit pas passer dans `SMTP_URL` (0098 § 4 point 7 l'a anticipé) |
| Contrôle d'enveloppe | `checkEnvelope` reste applicable tel quel sur les quatre champs avant de construire le corps JSON ; le corps envoyé est construit **depuis la copie contrôlée** et `to` est un tableau d'un élément | Identique à B3b-envoi (points 4.3 à 4.5) : enveloppe explicite, `maxRecipients: 1` |
| Erreurs | Statut HTTP et nom d'erreur JSON de Resend : le dépassement du quota quotidien de Resend se distingue d'une panne (point 5) | Codes SMTP, moins précis : un quota atteint chez Resend et une panne se confondent probablement (à constater par M2-S) |
| Délais | `AbortSignal.timeout` (10 s au plus, comme 0098 § 3.2) | `connectionTimeout`, `greetingTimeout`, `socketTimeout` (10 s au plus) |
| Double de test | `fetch` **injecté** dans l'implémentation (aucune URL configurable) | Transport `nodemailer` injecté, ou serveur SMTP local de test (TLS de test) : au choix du Tech Lead |
| Points à vérifier par M2-S | redirections refusées (`redirect: "error"`), aucun proxy, application ou non de la barrière de sortie `src/server/env/egress.ts` (S4) | vérification du certificat, absence de repli en clair, ports sortants admis sur Vercel |

Ce qui ne dépend pas du choix : l'URL ou l'hôte de Resend est une **constante** du code, jamais une variable d'environnement (sinon une variable mal posée enverrait la clé ailleurs) ; la clé n'est lue que côté serveur ; le port `CodeMailer` ne change pas (`sendLoginCode({ to, code, expiresInMinutes })`) ; le plafond (point 3) s'applique avant tout appel du transport.

Lecture fonctionnelle du Product Owner, sans valeur de décision : l'option A rend le comportement au plafond plus exact (point 5, cas « quota de Resend »), l'option B réutilise un transport déjà revu. La Sécurité tranche.

## À livrer (M2a, après M2-S)
1. **Implémentation Resend du port `CodeMailer`** (`src/server/mail/`, `import "server-only"`, nom du fichier : Tech Lead), selon l'option retenue par M2-S :
   1. refait le contrôle de `parseEmailAddress` sur l'adresse reçue (comme B3b-envoi point 4.1 ; refus : `email.address_refused`, aucun envoi) ;
   2. construit les données `{ from, to, subject, text }` à partir de `src/i18n/fr` (texte de B3b-envoi-PO-1, inchangé : texte seul, ni lien, ni image, ni pisteur ; aucun suivi d'ouverture ni de clic demandé à Resend) ;
   3. appelle `checkEnvelope` ; refus → `email.envelope_refused`, aucun appel, rien n'est compté ;
   4. **réserve une place** dans le plafond (point 3) ; refus → erreur de plafond (point 4), aucun appel du transport ;
   5. appelle le transport **une fois**, avec les seuls champs contrôlés (option A : corps JSON `{ from, to: [to], subject, text }`, aucun autre champ : ni `html`, `cc`, `bcc`, `reply_to`, `headers`, `attachments`, `tags`, `scheduled_at`) ; délai de 10 s au plus ;
   6. traduit la réponse par le tableau du point 5 ; toute erreur levée ne porte aucune valeur (ni adresse, ni code, ni clé, ni corps de réponse), comme `SmtpEnvoiError`.
2. **Configuration** (`src/server/env/index.ts`, lecture par propriété littérale, dans ce fichier seulement ; règles exactes : M2-S) :
   - `EMAIL_TRANSPORT=resend` (valeur proposée) → implémentation Resend, **seulement** avec `AUTH_ADAPTER=better-auth`, et seulement là où M2-S et M1h l'admettent (proposition : préversion Vercel, `VERCEL_ENV=preview`, branche `mvp-essai` ; la condition sur la branche est posée par M1h) ;
   - refus au démarrage de `resend` en `local`, en `ci`, en `staging`, en `production` et sur `VERCEL_ENV=production` (le déploiement automatique de `main` sur un domaine de production public, constaté en Q250, ne doit jamais envoyer) ;
   - clé (nom proposé `RESEND_API_KEY`, nom définitif : M2-S) requise avec `EMAIL_TRANSPORT=resend`, refusée sans lui ; contrôle de forme sans jamais rendre la valeur (proposition : préfixe `re_`, longueur bornée, caractères ASCII imprimables, à confirmer par M2-S) ; jamais de préfixe `NEXT_PUBLIC_` ; nom ajouté à la liste des noms rédigés de `src/server/log.ts` ;
   - `SMTP_URL` reste refusée avec `resend` (option A) ; avec l'option B, règles de M2-S.
3. **Plafond global quotidien** (module de `src/server/usage/` ou `src/server/mail/`, nom : Tech Lead ; stockage : T1) :
   - compteur **en base** (Postgres, jamais en mémoire du processus, jamais un stockage propre à Vercel : 0002), atomique (aucun dépassement sous des envois simultanés), à l'horloge de la base ;
   - clé du compteur : le **jour UTC** et l'**usage**, rien d'autre (aucune adresse, aucun hachage d'adresse, aucun identifiant d'organisation) ;
   - deux usages, en liste fermée : `connexion` (code de connexion) et `notification` (« aperçu prêt », rappels ; branchés plus tard par M7a et M6c) ;
   - valeurs dans `src/server/config/` (noms : Tech Lead) : plafond total **100** par jour (Q354) ; seuil des notifications **80** : une notification n'est réservée que si le total du jour, tous usages confondus, est inférieur à 80 ; un code de connexion l'est tant que le total est inférieur à 100. Le seuil de 80 et le partage du plafond entre tous les usages sont une **recommandation soumise à Samuel** (question 8 de la PR #829 ; voir B3d-PO-3) ;
   - échec fermé : base indisponible, configuration absente ou invalide → aucun envoi, `provider_error` ;
   - purge des jours échus (proposition : à l'écriture, par lot, comme le limiteur de B3a ; ou une ligne par jour et par usage gardée 7 jours) : choix du Tech Lead ;
   - fonction de réservation exportée pour M7a et M6c, avec l'usage en argument ; aucune autre façon d'appeler le transport.
4. **Plafond atteint, côté connexion** :
   - erreur dédiée levée par l'implémentation (proposition `CodeMailerCapError`, sans valeur), traduite par `src/server/auth` en un code nouveau de `API_ERROR_CODES` (nom proposé `email_cap_reached` ; ajout additif dans `src/contracts/values.ts`, nom définitif : Tech Lead, T4), avec `retryable: false` ;
   - **écran 4** (`SignInForm`, tâche front M2c ci-dessous) : message « Le nombre d'emails du jour est atteint. Réessaie demain. » (texte provisoire, `src/i18n/fr/connexion.json`, clé `erreurs.email_cap_reached`), à la même place et avec la même annonce (`aria-live`) que les autres erreurs de la connexion ; l'adresse saisie reste dans le champ ; aucun compte à rebours, aucune heure affichée ;
   - le même message s'applique quand Resend répond que **son** quota du jour ou du mois est atteint (point 5) ;
   - l'adaptateur `mock` n'est pas concerné (il n'envoie rien).
5. **Correspondance des réponses de Resend** (seul tableau, à côté de `src/server/auth/erreurs.ts` ou dans `src/server/mail/` : Tech Lead). Les noms exacts des erreurs de Resend sont **constatés par M2-S** sur la documentation publique et recopiés dans le tableau ; les lignes ci-dessous fixent le comportement :

   | Réponse | Résultat de `requestCode` | Événement | Compté au plafond |
   |---|---|---|---|
   | Succès (option A : 200 avec un identifiant ; B : `250`) | succès | aucun | oui |
   | Quota quotidien ou mensuel de Resend atteint | `email_cap_reached` | `email.provider_refused`, `reason: "quota"` | oui |
   | Trop de requêtes par seconde chez Resend | `provider_error` (`retryable: true`) | `reason: "rate_limited"` | oui |
   | Clé refusée (401, 403 de clé) | `provider_error` | `reason: "auth"` | oui |
   | Destinataire refusé en mode test (403 « testing emails to your own address ») | `provider_error` | `reason: "recipient_refused"` | oui |
   | Requête refusée (400, 422) | `provider_error` | `reason: "invalid_request"` | oui |
   | 5xx, réponse illisible | `provider_error` | `reason: "server_error"` | oui |
   | Délai dépassé, réseau | `provider_error` | `reason: "timeout"` ou `"network"` | oui |

   Le corps de la réponse de Resend n'est lu que pour le nom d'erreur (liste fermée) et jamais journalisé ; l'identifiant de message rendu par Resend n'est ni journalisé ni stocké. Aucune nouvelle tentative automatique (le bouton « Renvoyer le code » existe déjà).
6. **Journal** (`src/server/log.ts`, liste des événements) : `email.cap_reached` (champ `usage`, liste fermée) et `email.provider_refused` (champ `reason`, liste fermée du point 5), plus, si le Tech Lead le juge utile, `email.sent` (champ `usage` seulement). **Jamais** : adresse, partie d'adresse, hachage d'adresse, code, clé, en-tête `Authorization`, corps de requête ou de réponse, identifiant de message Resend, adresse IP. Les événements existants (`email.address_refused`, `email.envelope_refused`) sont repris tels quels.
7. **Expéditeur** : `SENDER_ADDRESS` devient une valeur choisie par la configuration du transport (nom : Tech Lead) : `connexion@exemple.test` pour Mailpit (inchangé) ; `onboarding@resend.dev` pour Resend tant qu'aucun domaine n'est vérifié (B3d-PO-5). Aucune autre adresse d'expédition, aucun nom d'affichage, aucune adresse de réponse.
8. **Front, tâche M2c** (petite, rôle frontend, après M2a) : texte du point 4 dans `src/i18n/fr/connexion.json`, code ajouté au type `SignInError` de `src/features/compte/SignInForm.tsx`, test du composant. Placement : CEO (question C1) ; M2c peut aussi être livrée dans la PR de M2a si le Tech Lead l'accepte.
9. **Documentation** : `docs/deploiement/variables-environnement.md` (valeur `resend`, clé, où elles sont admises, ce qui est refusé, qui les pose : Samuel, action S1) ; amendement de 0008 si une dépendance entre (option A avec SDK) ; liste des variables de la préversion transmise à M1h.

## Critères d'acceptation
Tous se vérifient en `local` et en `ci`, sur un **double de Resend** (un `fetch` injecté pour l'option A, un transport injecté ou un serveur SMTP de test local pour l'option B). Aucun test n'appelle `api.resend.com` ni `smtp.resend.com` ; aucune clé réelle, aucune adresse réelle (`exemple.test` seulement) dans le dépôt.

- [ ] **R1** `env: gardes de l'envoi réel` (`pnpm test`) : `EMAIL_TRANSPORT=resend` avec la clé et `AUTH_ADAPTER=better-auth` → accepté **seulement** dans le cas admis par M2-S (proposition : `VERCEL=1`, `VERCEL_ENV=preview`) ; refusé en `local`, en `ci`, en `staging`, en `production`, avec `VERCEL_ENV=production`, avec `AUTH_ADAPTER=mock` ; clé absente → `missing` ; clé présente sans `EMAIL_TRANSPORT=resend` → refus ; clé de forme invalide (vide, espaces, hors ASCII, trop longue, sans le préfixe retenu) → refus ; `EMAIL_TRANSPORT=Resend` (casse) → refus ; une valeur sentinelle de la clé n'apparaît dans aucun `message`, `stack`, `util.inspect` d'erreur, journal capturé ni champ du résultat de `parseServerEnv`, pour chaque refus.
- [ ] **R2** `email: requête envoyée à Resend` (`pnpm test`, double) : un envoi valide appelle le double **une fois**, avec exactement l'URL ou l'hôte constant, la méthode, les en-têtes et le corps attendus (option A : `Authorization: Bearer <sentinelle>`, `Content-Type: application/json`, corps `{ from: "onboarding@resend.dev", to: ["a@exemple.test"], subject, text }` et rien d'autre ; `redirect: "error"` ; signal de délai de 10 s au plus) (option B : options exactes de `createTransport` fixées par M2-S, `logger: false`, `debug: false`, enveloppe explicite, `maxRecipients: 1`) ; le texte contient le code à 6 chiffres et aucun lien.
- [ ] **R3** `email: enveloppe refusée, rien n'est envoyé ni compté` : les cas de E4 et E5 de B3b-envoi rejoués sur l'implémentation Resend (adresse `a,b@exemple.test` forcée, `bcc`, clé `envelope`) → `provider_error`, double non appelé, compteur du jour inchangé, `email.envelope_refused` écrit sans valeur.
- [ ] **R4** `email: plafond global de 100 par jour` (`pnpm test:db`) : 100 envois de connexion réussissent ; le 101e lève l'erreur de plafond **sans appeler le double** ; `requestCode` rend `email_cap_reached` ; `email.cap_reached` est écrit avec `usage: "connexion"`.
- [ ] **R5** `email: plafond sans dépassement sous la concurrence` (`pnpm test:db`) : 120 envois lancés en parallèle sur un compteur vide (adresses distinctes, appels directs de l'implémentation du port, sans passer par le limiteur) → le double reçoit **exactement** 100 appels, 20 refus de plafond.
- [ ] **R6** `email: seuil des notifications` (`pnpm test:db`, par la fonction de réservation exportée, faute d'e-mail de notification codé) : avec 79 envois au total, une réservation `notification` passe ; à 80, elle est refusée, et une réservation `connexion` passe encore jusqu'à 100 ; les deux usages comptent dans le même total.
- [ ] **R7** `email: nouveau jour` (`pnpm test:db`) : le compteur du jour atteint, recul de sa date d'un jour par SQL sous un rôle de test (jamais par l'horloge du processus) → l'envoi suivant passe ; les lignes échues sont purgées selon la règle retenue (T1).
- [ ] **R8** `email: échec fermé du plafond` (`pnpm test:db`) : base du compteur indisponible (pool injecté en erreur) ou configuration du plafond absente → aucun appel du double, `provider_error`.
- [ ] **R9** `email: correspondance des réponses de Resend` (`pnpm test`) : chaque ligne du tableau du point 5, jouée par le double, rend le résultat, l'événement et le comptage attendus ; le corps de réponse du double contient une sentinelle (adresse, code) qui n'apparaît dans aucun journal ni message d'erreur.
- [ ] **R10** `journaux: aucun email, code ni clé` (critère B13 de B3 et E6 de B3b-envoi étendus) : sortie standard et d'erreur capturées pendant un envoi réussi sur le double, un refus de plafond, chaque refus du tableau du point 5 et une enveloppe refusée : ni l'adresse, ni le code, ni la clé, ni l'en-tête `Authorization`, ni l'identifiant de message du double n'y figurent ; les seuls champs des événements `email.*` sont ceux du point 6.
- [ ] **R11** `connexion: plafond atteint à l'écran` (M2c, `pnpm test`, composant) : la réponse `email_cap_reached` affiche « Le nombre d'emails du jour est atteint. Réessaie demain. » dans la zone d'erreur annoncée, l'adresse reste saisie ; test d'accessibilité de l'écran 4 inchangé et vert.
- [ ] **R12** `email: aucun envoi réel par le studio` : aucune occurrence de l'URL ou de l'hôte de Resend hors de la constante du module d'envoi et de son test ; aucune variable de clé Resend dans `.env.example`, `playwright.config.ts`, `.github/workflows/` ni les scripts ; le scénario e2e de connexion (E7 de B3b-envoi) reste sur Mailpit.
- [ ] **R13** Confinement (`pnpm lint`) : seul le module d'envoi Resend a la capacité réseau retenue par M2-S (`fetch` ou `nodemailer` vers un hôte distant), dans `src/server/mail/**` ; `import "server-only"` en tête ; le transport est créé à l'envoi, jamais à l'import ; aucune importation depuis `src/features`, `src/components` ni `src/app`.

### Vérifications d'ensemble
- [ ] `pnpm verify` vert ; job `db` vert.
- [ ] Aucun secret, aucune adresse e-mail réelle, aucune adresse IP réelle dans le diff ni dans la description de la PR.
- [ ] Toute modification de `.github/workflows/` passe par la porte `owner-approved` (0035) ; aucune n'est attendue.
- [ ] Aucun fichier de `src/domain`, `src/ai`, `src/research`, `src/grounding`, `src/prototype` ni `scripts/p0` modifié.

## Décisions (Product Owner, définitives dès la fusion, décision 0093)
À lister dans la note de version suivante, rubrique « Décisions prises par le studio ».
- **B3d-PO-1 — Jour du plafond : jour civil UTC, à l'horloge de la base.** Raison : le plafond de 100 suit l'offre gratuite de Resend (Q354), dont le décompte est très probablement en UTC (à constater par M2-S) ; un jour suisse pourrait nous faire buter sur le quota de Resend entre minuit et 1 h ou 2 h. Le message « Réessaie demain » reste juste à une ou deux heures près.
- **B3d-PO-2 — Ce qui compte.** Toute tentative qui a appelé le transport compte, qu'elle réussisse ou non (Resend a pu la compter). Ce qui est refusé avant le transport (adresse, enveloppe, plafond, limiteur) ne compte pas.
- **B3d-PO-3 — Un seul plafond, deux usages, en attendant Samuel.** Le compteur est construit avec les usages `connexion` et `notification` et un seuil de 80 pour les notifications. Seul l'usage `connexion` existe dans M2a ; le plafond de 100 pour les codes est déjà tranché (Q354). Si Samuel refuse le partage (question 8 de la PR #829), seules les valeurs de configuration changent avant M7a et M6c : M2a n'attend pas sa réponse.
- **B3d-PO-4 — Au plafond, rien ne part plus tard.** Pas de file d'attente, pas de nouvelle tentative le lendemain, pas de repli vers un autre transport. L'écran dit « Réessaie demain » ; une notification refusée est perdue (son comportement précis appartient aux spécifications de M7a et M6c).
- **B3d-PO-5 — Expéditeur `onboarding@resend.dev` jusqu'au domaine.** Sans domaine vérifié, Resend n'envoie qu'à l'adresse de son compte : l'essai sur la préversion vaut pour Samuel seul. Le domaine et l'adresse d'expédition définitive viennent à l'étape 10 (question 7 de la PR #829).
- **B3d-PO-6 — Destinataire refusé par Resend : message générique.** Une autre adresse que celle du compte Resend reçoit « La connexion n'est pas disponible pour le moment… » (`provider_error`). Aucune liste d'adresses permises dans le code ni dans la configuration (ce serait une donnée personnelle dans le dépôt ou une variable de plus) ; ce cas disparaît avec le domaine.
- **B3d-PO-7 — Texte du plafond.** « Le nombre d'emails du jour est atteint. Réessaie demain. » (graphie « email » de l'écran 4), provisoire jusqu'à la relecture UX/UI (question U1).

## Hors périmètre
- Compte Resend, clé, variables Vercel : Samuel (action S1).
- Domaine d'envoi, SPF, DKIM, DMARC, adresse d'expédition définitive, région de traitement liée au domaine : étape 10, Samuel.
- E-mails « aperçu prêt » (M7a) et rappels (M6c), désinscription, préférences d'envoi.
- Ouverture des gardes `better-auth` et `api` sur `mvp-essai` (M1h).
- Webhooks de Resend (remise, rebond, plainte) : non nécessaires pour l'essai.
- Toute action dans les consoles Vercel, Neon, Resend ou GitHub ; toute mise en production.

## Découpage
| ID | Tâche | Rôle | Prérequis |
|---|---|---|---|
| M2-S | Décision de la Sécurité : transport (A ou B), nom, forme et confinement de la clé (côté serveur seulement), cas où `EMAIL_TRANSPORT=resend` est admis, région de traitement et sous-traitant (Q25), questions S1 à S7 | securite (Tech Lead consulté pour T1 à T4) | cette spécification fusionnée |
| M2a | Implémentation Resend du port, plafond global, correspondance des erreurs, journal, configuration, documentation ; critères R1 à R10, R12, R13 sur un double | backend | M2-S |
| M2c | Texte et état « plafond atteint » de l'écran 4 ; critère R11 | frontend | M2a (code d'erreur dans `src/contracts`) |

## Questions ouvertes
Nouvelles questions (à numéroter par le CEO dans `QUESTIONS.md`) :

**Sécurité (M2-S), 2026-10-28** — bloquent M2a :
- **S1** Transport : API HTTPS (A) ou SMTP (B) de Resend, avec les règles de construction (constante d'URL ou d'hôte, redirections, TLS, délais). *Ne bloque que M2a.*
- **S2** Clé : nom (proposition `RESEND_API_KEY`), contrôle de forme, lecture par `src/server/env` seulement, nom rédigé dans `src/server/log.ts`, cas où sa présence est refusée (proposition : partout hors de la préversion admise, `local` et `ci` compris). Recommandation : clé Resend à permission « Sending access » seulement, pas « Full access » (à transmettre à Samuel avec l'action S1).
- **S3** Cas où `EMAIL_TRANSPORT=resend` est admis : la proposition (préversion Vercel, branche `mvp-essai` par M1h, jamais `VERCEL_ENV=production`) suffit-elle, ou faut-il une condition de plus ?
- **S4** La barrière de sortie `src/server/env/egress.ts` (proxy, TLS affaibli, production) s'applique-t-elle au client Resend ?
- **S5** Région de traitement et sous-traitant (Q25) : Resend est une société américaine ; la région se choisit par domaine (une région UE existe d'après la documentation publique de Resend, à confirmer) ; sans domaine, l'envoi depuis `onboarding@resend.dev` passe vraisemblablement par la région par défaut, hors UE. Constater et écrire ce qui s'applique ; voir la question Samuel ci-dessous.
- **S6** Conservation chez Resend : le tableau de bord de Resend garde les messages envoyés, donc le code et l'adresse. Durée constatée, et faut-il le dire à Samuel avec l'action S1 ? (Le code expire en 10 minutes.)
- **S7** Noms exacts des erreurs de Resend à recopier dans le tableau du point 5, et base du décompte de son quota quotidien (UTC ou 24 heures glissantes : B3d-PO-1).

**Tech Lead, 2026-10-28** — ne bloquent pas M2-S :
- **T1** Stockage du compteur : table nouvelle (migration additive, rôle dédié comme `vadrouille_limiter`) ou réemploi d'`action_rate_limits` (dont les fenêtres sont fixes à partir du premier appel, et non alignées sur le jour UTC) ; purge. Bloque le code du plafond dans M2a.
- **T2** Emplacement et noms : module du plafond, fonction de réservation, constantes, erreur de plafond, tableau de correspondance.
- **T3** Option A : `fetch` natif ou SDK `resend` (recommandation du Product Owner : `fetch`, aucune dépendance nouvelle).
- **T4** Nom du code d'erreur (proposition `email_cap_reached`) et sa place dans `API_ERROR_CODES`.

**Samuel, 2026-10-28** — ne bloque pas le code :
- **Q-S1** Données hors UE : sans domaine, l'adresse de destination (la tienne seulement, B3d-PO-5) et le code passent par Resend, vraisemblablement hors UE (S5). *Bloque :* l'action S1, pas le code. *Recommandation :* l'accepter pour ton seul essai, et choisir la région UE de Resend avec le domaine à l'étape 10, avant tout autre testeur.

**UX/UI, 2026-10-28** — ne bloque pas :
- **U1** Relire le texte de B3d-PO-7.

**CEO, 2026-10-28** — ne bloque pas M2-S :
- **C1** Placement de M2c (tâche front séparée, ou dans la PR de M2a) et place de M2a par rapport aux autres tâches qui touchent `db/migrations` (plan, § 10).

Questions existantes touchées :
- **Q25** (Resend, tranchée) : cette spécification en est l'application ; la région et le sous-traitant restent à constater (S5, Q-S1).
- **Q354** (100 e-mails de connexion par jour, tranchée) : porté par le point 3 et R4, R5.
- **Question 8 de la PR #829** (Samuel, plafond commun à tous les envois, notifications arrêtées à 80) : recommandation reprise par B3d-PO-3, sans en dépendre pour M2a.
- **Question 7 de la PR #829** (Samuel, domaine d'envoi) : B3d-PO-5 et B3d-PO-6.
- **Q401** (variables du limiteur dans Vercel) : nécessaires à la préversion ; listées par M1h.
