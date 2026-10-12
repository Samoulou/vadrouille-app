# Comptes externes du back-end (B0c)

Rôles : backend (liste), tech-lead (recommandation Neon ou Supabase) · Date : 2026-10-12 · Ticket : #154 · Demande de Samuel : #studio, 2026-10-12 09:57 CEST · Sources internes : `docs/handovers/backend.md` (B0a, § 2, § 9, § 12 à § 15), décisions 0002, 0006 à 0009, `QUESTIONS.md` (Q24, Q25, Q26, Q28, Q46, Q103, Q197, Q234, Q235), cadrage § 11 (budget)

**Décision de Samuel sur Q24 (#studio, 2026-10-12 10:35 CEST)** : Neon à Francfort ; Samuel crée le compte lui-même au démarrage de B1, via Vercel. Les autres comptes restent des recommandations.

**Ce document recommande, il ne tranche pas.** Ouvrir un compte, choisir un fournisseur payant et engager une dépense sont réservés à Samuel (`docs/CONTEXT.md`, « Qui décide quoi »). Aucun compte n'est ouvert par cette PR.

**Tarifs** : relevés le 2026-10-12 sur les pages officielles citées, en USD ou en CHF selon la page, hors TVA. Un tarif marqué « non vérifié » n'a pas pu être lu sur la page officielle ce jour-là : à confirmer à l'ouverture du compte.

---

## 1. Comptes déjà ouverts

Les clés Google serveur et OpenRouter et leurs plafonds sont consignés dans `QUESTIONS.md` (Q103 : clé en place le 2026-10-12 ; Q234 : choix des clés et montants). Les décisions 0026 et 0027, qui les détaillent, ne sont pas encore sur `main`.

| Compte | Ouvert par | Ce qu'il débloque | Formule | Région | Données personnelles |
|---|---|---|---|---|---|
| GitHub (dépôt public) | Samuel | Code, CI, revues | gratuite (dépôt public) | — | aucune donnée d'utilisateur |
| Vercel | Samuel | Staging, préversions, plus tard B9 (monde Vercel des workflows) | formule actuelle non notée dans le dépôt (voir § 2, étape 6) | fonctions : UE à régler (`docs/handovers/backend.md` § 14) | journaux de la plateforme (adresses IP, `/p/[token]`, Q27) |
| Google Cloud, clé serveur `GOOGLE_MAPS_SERVER_KEY` (Places et Routes) | Samuel (Q103) | P0, puis B8 (ancrage, trajets) et la recherche de B11 | payante au-delà des quotas gratuits ; plafond fixé par Samuel : 20 USD par mois, quotas quotidiens plafonnés (Q234) | Google, mondial (facturation suisse, cadrage D4) | aucune (seul l'identifiant de lieu est stocké) |
| Google Cloud, clé navigateur Maps JavaScript (Q3) | Samuel | Carte de F4 | quotas gratuits prévus (non vérifié pour Maps JavaScript) | Google, mondial | aucune |
| OpenRouter, `OPENROUTER_API_KEY` | Samuel (Q234) | P0, puis B7 (couche IA) | crédits prépayés ; plafond fixé par Samuel : 40 USD par mois (Q234) | États-Unis (intermédiaire), fournisseurs selon le routage | prompts ; en production, le récit libre de l'écran 2 (Q197) |

Tarifs Google utiles pour B8 et B11 ([grille officielle](https://developers.google.com/maps/billing-and-pricing/pricing), relevée le 2026-10-12, par 1 000 appels jusqu'à 100 000) : Place Details Essentials 10 000 gratuits par mois puis 5 USD ; Place Details Pro 5 000 gratuits puis 17 USD ; Text Search Pro 5 000 gratuits puis 32 USD ; Text Search Essentials (identifiants seuls) illimité ; Compute Routes Essentials 10 000 gratuits puis 5 USD.

Tarifs OpenRouter ([page officielle](https://openrouter.ai/pricing), 2026-10-12) : prix des fournisseurs sans majoration, frais de 5,5 % sur l'achat de crédits (formule Standard) ou 8 % (Business). Routage « zéro rétention » disponible sur toutes les formules ; **routage UE (`eu.openrouter.ai`) seulement en Business ou Enterprise**. À trancher par Samuel avant B7 en production : le récit libre (données personnelles) transite par un intermédiaire hors UE (Q46, Q197).

---

## 2. Comptes à ouvrir, dans l'ordre où il les faut

L'ordre suit le backlog de B0a (`docs/handovers/backend.md` § 15, B1 à B12). Aucune tâche B ne commence avant G0 (roadmap) : la colonne « Quand » dit à quelle tâche le compte devient bloquant, pas qu'il faut l'ouvrir maintenant. B1 à B3 tournent en local et en CI **sans compte** (Postgres en conteneur, Mailpit, monde local des workflows, adaptateur de paiement simulé).

| Étape | Compte | Quand (tâche) | Ce qu'il débloque | Formule recommandée | Région | Données personnelles | Question |
|---|---|---|---|---|---|---|---|
| 1 | **Postgres managé en UE** : Neon, retenu par Samuel (§ 3) | B1 pour la base de staging ; bloquant pour B3 (essai de l'en-tête d'IP de confiance sur staging) et pour le test de restauration | Base de staging, puis de production ; repli « monde Postgres » des workflows (0009) | Neon : Free pour le staging, Launch (à l'usage) pour la bêta | Neon `aws-eu-central-1` (Francfort) | toutes les données des utilisateurs (comptes, briefs, voyages) | Q24 |
| 2 | **Nom de domaine** | Avant les étapes 3 et 4 | Adresse d'envoi des emails (SPF, DKIM) ; site public avec mentions légales, exigé par TWINT ; `APP_URL` | payant, 30 CHF prévus (cadrage § 11) | bureau d'enregistrement au choix | coordonnées du titulaire | hors § 14 de B0a, ajouté ici |
| 3 | **Envoi d'emails** (codes de connexion, « propositions prêtes ») | B3 pour l'envoi réel ; Mailpit suffit avant | Connexion réelle sur le staging, puis en bêta | gratuite au départ (voir les candidats ci-dessous) | UE à exiger | adresse email, code à usage unique (sous-traitant) | Q25 |
| 4 | **Stripe, mode test, carte et TWINT** | B4 pour l'adaptateur `stripe` ; l'adaptateur simulé suffit avant | Paiement de test de bout en bout, webhook signé | gratuit en mode test ; en production, frais par transaction (ci-dessous) | Stripe (sous-traitant de paiement) ; compte suisse | nom, email, moyen de paiement (chez Stripe seulement) | Q26 |
| 5 | **OpenRouter en production** (compte existant) | B7 avec un fournisseur réel | Couche IA du produit | Standard (5,5 %) ou Business (8 %, routage UE) | États-Unis ; UE en Business | récit libre de l'écran 2 | Q46, Q197 |
| 6 | **Vercel Pro et Vercel Workflows** | B9 (monde Vercel en staging) ; avant la bêta payante si le compte est en Hobby (selon la page Vercel, Hobby exclut l'usage commercial) | Workflows durables en staging ; usage commercial | Pro, 20 USD par mois selon la page Vercel (80 CHF prévus sur ~4 mois, cadrage § 11) | fonctions en UE à régler ; état des workflows à vérifier (Q28) | journaux ; état des workflows réduit aux identifiants (0009) | Q28 ; décision de Samuel |
| 7 | **Observabilité** (erreurs, traces IA, mesure) | Avant la bêta (phase 2) ; aucune tâche B ne l'exige (exportateur désactivé, § 13 de B0a) | Erreurs, traces par étape, mesure du parcours | gratuites au départ | UE à exiger | identifiants, adresses IP selon l'outil | décision de Samuel |

### Détail par compte

**1. Postgres en UE (Q24).** Comparaison et recommandation au § 3. Budget du cadrage : 100 CHF sur ~4 mois.

**2. Nom de domaine.** Absent du § 14 de B0a, mais deux comptes en dépendent : un fournisseur d'emails n'envoie de façon fiable que depuis un domaine vérifié, et Stripe n'active TWINT qu'après vérification d'un site public, accessible sans mot de passe, avec raison sociale, adresse et contact dans les mentions légales ([documentation TWINT de Stripe](https://docs.stripe.com/payments/twint), 2026-10-12). Le staging protégé par l'authentification Vercel (Q235, `QUESTIONS.md`) ne suffit donc pas pour activer TWINT en production.

**3. Envoi d'emails (Q25).** Candidats dont le siège ou l'hébergement est en UE, pour comparaison ; le choix revient à Samuel :
| Fournisseur | Formule gratuite | Payant | Région | Source (2026-10-12) |
|---|---|---|---|---|
| Scaleway Transactional Email | 300 emails par mois | 0,25 EUR les 1 000 emails suivants, sans abonnement | France (société et hébergement) | [page TEM](https://www.scaleway.com/fr/transactional-email-tem/), [FAQ](https://www.scaleway.com/en/docs/transactional-email/faq/) |
| Brevo | 300 emails par jour, transactionnel compris (non vérifié : sources tierces seulement) | à partir de quelques euros par mois (non vérifié : la page officielle n'a pas pu être lue) | France (siège), centres de données en UE (non vérifié) | [page des tarifs](https://www.brevo.com/pricing/) |
| Resend (pour mémoire) | 3 000 emails par mois, 100 par jour | 20 USD par mois pour 50 000 | société américaine ; région d'envoi configurable, région UE non confirmée par la page des tarifs | [page des tarifs](https://resend.com/pricing) |

Le transport est déjà prévu en SMTP (`nodemailer`, décision 0008) : tous ces fournisseurs conviennent sans changement de code. Au volume du MVP (codes de connexion de quelques dizaines de testeurs), la formule gratuite de Scaleway suffirait ; celle de Brevo aussi, si son quota se confirme sur la page officielle.

**4. Stripe (Q26).** Mode test gratuit et sans abonnement. Frais en production ([tarifs Stripe Suisse](https://stripe.com/ch/pricing), 2026-10-12) : cartes suisses 2,9 % + 0,30 CHF ; cartes étrangères 3,25 % + 0,30 CHF (+ 2 % avec conversion). **Tarif TWINT non publié sur cette page** : à demander à l'ouverture (un revendeur affiche 1,9 % + 0,30 CHF, non vérifié). TWINT : CHF seulement, 5 000 CHF au plus par paiement, remboursements jusqu'à 180 jours, disponible avec Checkout ([documentation](https://docs.stripe.com/payments/twint)). Pour 29 CHF (Q2) payés par une carte suisse : 1,14 CHF de frais.

**5. OpenRouter en production.** Voir § 1. Le compte existe ; ce qui reste à décider, c'est la formule (routage UE en Business) et les clauses de sous-traitance (Q46) avant que le récit libre d'un vrai utilisateur y transite.

**6. Vercel Pro et Workflows** ([tarifs Vercel](https://vercel.com/pricing), 2026-10-12). Hobby : gratuit, **usage personnel non commercial**, 50 000 événements de workflow par mois, aucun dépassement achetable. Pro : 20 USD par mois avec 20 USD de crédit d'usage ; workflows à 20 USD le million d'événements et 0,50 USD par Go écrit et par Go-mois conservé. La région de l'état des workflows reste à vérifier par B9 (Q28) ; repli : monde Postgres dans la base de l'étape 1.

**7. Observabilité.** Sentry (formule Developer gratuite : 1 utilisateur, 5 000 erreurs ; Team 26 USD par mois facturé à l'année, [tarifs](https://sentry.io/pricing/), 2026-10-12 ; région UE à choisir à la création de l'organisation, non vérifiée sur la page), traces IA (Langfuse ou un exportateur OpenTelemetry) et PostHog en région UE. Budget du cadrage : 30 CHF avec les emails. Aucune trace ne contient de prompt ni de brief tant que Samuel n'a pas retenu un service en UE (§ 13 de B0a).

---

## 3. Recommandation du Tech Lead : Neon plutôt que Supabase

**Suivie par Samuel le 2026-10-12 (Q24)** : Neon, `aws-eu-central-1` (Francfort), compte créé par Samuel au démarrage de B1, via Vercel. Le reste de cette section garde l'argumentaire tel qu'il a été proposé.

**Recommandation : Neon, projet en région `aws-eu-central-1` (Francfort), formule Free pour le staging, Launch pour la bêta.** Better Auth reste une bibliothèque dans notre code (décision 0008) ; ni Neon Auth ni Supabase Auth ne sont utilisés.

### Critères

| Critère | Neon | Supabase |
|---|---|---|
| **Better Auth (0008)** | Indifférent : Better Auth 1.7.7 tourne dans notre code avec l'adaptateur Drizzle et le rôle `vadrouille_auth`. Neon propose aussi un « Managed Better Auth » (Neon Auth, Better Auth 1.7.6, schéma `neon_auth`), mais il expose des routes HTTP (`/api/auth/[...path]`) : contraire à 0008, **à ne pas activer** ([documentation](https://neon.com/docs/auth/overview)) | Indifférent pour Better Auth. Supabase Auth (schéma `auth`) existe dans chaque projet et reste inutilisé : surface en plus |
| **RLS et rôles (0007)** | Postgres standard. Le rôle créé par la console (`neondb_owner`) est membre de `neon_superuser`, qui a `CREATEROLE` et **`BYPASSRLS`** ; les rôles créés en SQL ne le sont pas et n'ont que les droits qu'on leur donne ([documentation des rôles](https://neon.com/docs/manage/roles)). Usage : `neondb_owner` sert seulement à créer les rôles `vadrouille_*` (amorçage), jamais à l'application ni aux migrations | Le rôle `postgres` a **`BYPASSRLS`**, `service_role` aussi ; les vues créées par `postgres` contournent la RLS ([documentation RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)). Même usage possible (`postgres` pour l'amorçage seulement), mais **en plus** : l'API de données (PostgREST) accorde par défaut `SELECT`, `INSERT`, `UPDATE`, `DELETE` à `anon` et `authenticated` sur les tables de `public` ([documentation](https://supabase.com/docs/guides/api/securing-your-api)). À neutraliser : désactiver l'API de données et révoquer les droits par défaut, puis l'ajouter aux tests `rôles` |
| **Contexte de transaction (0007)** | Pooler PgBouncer en mode transaction : `set_config(…, true)` et `SET LOCAL ROLE` restent dans la transaction, compatibles | Supavisor en mode transaction (port 6543) : même compatibilité ; requêtes préparées à désactiver ([documentation](https://supabase.com/docs/guides/database/connecting-to-postgres)) |
| **Connexion depuis Vercel** | Connexion directe et pooler en IPv4 | Connexion directe en **IPv6 seulement** ; Vercel et GitHub Actions ne sortent qu'en IPv4 ([documentation](https://supabase.com/docs/guides/platform/ipv4-address)) : passage obligé par le pooler, ou option IPv4 payante (formule Pro et au-delà) |
| **Branches de base** | Branches copie-sur-écriture : 10 par projet en Free et Launch, 1,50 USD par branche-mois au-delà ; une branche par préversion possible | Branches seulement en Pro : 0,01344 USD par branche et par heure (≈ 9,80 USD par mois pour une branche permanente) |
| **Région UE** | Francfort seulement pour l'UE (Londres est hors UE) ([régions](https://neon.com/docs/introduction/regions)) | Irlande, Paris, Francfort, Stockholm ; **Zurich** en plus, hors UE ([régions](https://supabase.com/docs/guides/platform/regions)) |
| **Coût du staging** | Free : 0 USD, 100 CU-heures par mois et par projet, 1 Go, mise en veille après 5 min. **Attention** : à partir du 5 octobre 2026, un projet Free inactif 90 jours peut être supprimé ([régions et projets inactifs](https://neon.com/docs/introduction/regions)) | Free : 0 USD, 500 Mo, 2 projets, **mise en pause après une semaine d'inactivité** (gênant pour un staging consulté par à-coups) |
| **Coût de la bêta (~4 mois)** | Launch, sans minimum : 0,106 USD par CU-heure, 0,35 USD par Go-mois. Ordre de grandeur : 0,25 CU allumé en permanence ≈ 19 USD par mois ; avec la mise en veille, nettement moins. Au plus ≈ 77 USD sur 4 mois, sous les 100 CHF du cadrage tant qu'un dollar vaut moins de 1,30 CHF | Pro : 25 USD par mois (10 USD de calcul inclus, instance Micro), soit 100 USD sur 4 mois : au-dessus des 100 CHF du cadrage dès qu'un dollar vaut plus d'un franc (taux de change non appliqué ici) |
| **Sauvegardes et retour arrière (§ 12 de B0a)** | Restauration à un instant : 6 h en Free, jusqu'à 7 jours en Launch (0,20 USD par Go-mois) | Sauvegardes quotidiennes 7 jours incluses en Pro ; restauration à un instant : 100 USD par mois en option |
| **Portabilité (0002)** | Postgres 17 standard, export `pg_dump` | Idem, mais des schémas propres à Supabase (`auth`, `storage`, extensions) à ignorer |

Tarifs : [Neon](https://neon.com/pricing) et [Supabase](https://supabase.com/pricing), relevés le 2026-10-12.

### Pourquoi Neon
1. **Moins de surface à neutraliser.** Notre modèle de sécurité (0007) repose sur nos propres rôles `NOBYPASSRLS`, sans API exposée. Neon est un Postgres nu ; Supabase ajoute une API de données ouverte par défaut aux rôles `anon` et `authenticated`, un service d'authentification et des droits par défaut qu'il faudrait désactiver et tester.
2. **Connexion depuis Vercel sans option payante** (IPv4).
3. **Branches incluses**, utiles pour tester une migration sur une copie du staging avant de l'appliquer (procédure de retour arrière de B1).
4. **Coût** : staging gratuit sans mise en pause hebdomadaire, bêta à l'usage sous le budget de 100 CHF.

### Ce qui ferait choisir Supabase
- Un client (agence) exige un hébergement en Suisse : Supabase a une région Zurich, Neon non (même motif de révision que 0002).
- Samuel veut des sauvegardes quotidiennes gérées sans configuration : incluses en Pro chez Supabase.

### Points communs, quel que soit le choix
- Les deux sociétés sont américaines (Neon appartient à Databricks) ; les données restent dans la région choisie. Contrat de sous-traitance (DPA) à signer par Samuel ; sa disponibilité n'a pas été vérifiée ici.
- Le rôle d'administration fourni (`neondb_owner` ou `postgres`) a `BYPASSRLS` : il ne sert qu'à l'amorçage des rôles. `DATABASE_URL`, `DATABASE_URL_AUTH` et `DATABASE_URL_MIGRATOR` (0006) pointent sur `vadrouille_app`, `vadrouille_auth` et `vadrouille_migrator`, jamais sur lui.
- À vérifier par B1 sur la base de staging Neon, puis à consigner par B1 dans un amendement de 0007 (ce n'est pas encore une décision) : les appartenances `WITH INHERIT FALSE, SET TRUE` et le transfert de propriété vers les rôles `vadrouille_fn_*` fonctionnent depuis le rôle d'amorçage (Postgres 16 et suivants, `CREATEROLE` sans superutilisateur) ; le test `rôles: aucun rôle ne contourne la RLS` passe sur la base gérée et pas seulement dans le conteneur.

---

## 4. Ce que Samuel décide

1. ~~**Q24**~~ : tranchée le 2026-10-12 (Neon, Francfort, compte créé par Samuel via Vercel au démarrage de B1).
2. **Domaine** : lequel, et quand (avant l'envoi réel d'emails et l'activation de TWINT).
3. **Q25** : fournisseur d'emails en UE (par exemple Scaleway, ou Brevo une fois ses conditions vérifiées).
4. **Q26** : ouverture du compte Stripe suisse en mode test ; TWINT exigera le site public de l'étape 2.
5. **Q46, Q197** : formule OpenRouter pour la production (Standard, ou Business pour le routage UE).
6. **Vercel** : passage en Pro avant la bêta payante si le compte est en Hobby (usage commercial exclu selon la page Vercel), et l'outil d'observabilité en UE.

## Questions nouvelles (à reporter par le CEO)
- Le domaine n'est pas dans le § 14 de B0a alors que les emails et TWINT en dépendent : l'ajouter à la liste des engagements externes (Samuel, avant B3 réel et B4 Stripe).
- Neon Free supprime un projet inactif 90 jours (à partir du 5 octobre 2026, [documentation Neon](https://neon.com/docs/introduction/regions)) : si Samuel ouvre un staging Free avant G0, il faut une activité régulière ou la formule Launch (Tech Lead, puis Samuel pour la dépense).
- Formule actuelle du compte Vercel (Hobby ou Pro) non notée dans le dépôt : à confirmer par Samuel (bloque l'usage commercial, pas les tâches B).
