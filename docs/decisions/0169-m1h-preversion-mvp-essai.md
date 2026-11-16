# 0169 — M1h : préversion `mvp-essai` (gardes `better-auth` et `api`, barrière des appels réels, plafonds) ; amendements de 0077 § 5.1, 0086 § 2.1 et 0163

Statut : **décidée par le CEO sur mandat de Samuel du 2026-11-09, verdicts du Tech Lead et de la Sécurité à la revue** de la PR qui la porte. Elle ne devient définitive qu'à la fusion de cette PR (CI verte, validation du Tech Lead, 0093).

Date : 2026-11-10 · Décideur : CEO, sur mandat de Samuel · Ticket : #1105 · Ligne M1h de `docs/plans/mvp-etapes-1-9.md` (étape 1, § 11) · `main` relu : `32547a3`

Numérotation : `main` va jusqu'à 0167 ; 0168 est prise par une PR ouverte.

## Ce sur quoi cette décision s'appuie

**Réponses de Samuel** (fil du projet, 2026-11-09 06:07 UTC, « Je suis tes reco », reportées dans `QUESTIONS.md`) :

| Question | Réponse suivie |
|---|---|
| Q634 | Une préversion `mvp-essai` peut lire et écrire la vraie base avant G0, **pour cette seule branche** (lève Q417 pour elle seule). |
| Q635 | Nouvelle branche `mvp-essai` ; `p0-reel` est gardée. |
| Q636 | Le récit et le logement de vrais comptes peuvent partir au fournisseur de modèles, avec `zdr` et la mention de l'écran 2. |
| Q637 | Temps de trajet gardés 30 jours puis relus (non livré ici, voir § 7). |
| Q638 | Avant le paiement, seules les 8 propositions de l'aperçu sont vérifiées sur Google. |
| Q639 | 2 USD d'IA par voyage, 10 USD par organisation et par jour, 5 USD par jour sans compte. |
| Q640, Q641 | Resend sans domaine vérifié (envoi à la seule adresse de Samuel) ; plafond commun de 100 e-mails par jour. |

**Mandat du 2026-11-09** (fil du projet, 22:24 UTC : Samuel donne les pleins pouvoirs au CEO pour terminer le MVP ; 22:25 UTC : « Rien ne demande mes mains »). Sur ce mandat, **le CEO tranche oui aux recommandations** de quatre questions encore ouvertes dans `QUESTIONS.md`, que cette décision consigne pour que Samuel puisse les reprendre à tout moment :

| Question | Ce que le CEO tranche | Portée |
|---|---|---|
| Q645 | Le oui à Q636 couvre aussi les libellés des engagements envoyés au modèle, et le logement et les noms de lieux écrits par l'IA envoyés à Google Text Search, **aux conditions de 0139**. | La requête du serveur vers le site proposé par l'IA (point c de la question) **n'est pas ouverte** : voir § 4. |
| Q731 | Idem pour jusqu'à 3 textes de logement et les heures de fin d'engagements (0149). | Mêmes conditions. |
| Q843 | `generations.verification` : 60 Text Search et 60 fiches par voyage. | § 3. |
| Q696 | Chargement des photos Google depuis le navigateur accepté **pour la préversion** (prolonge F13-Q4). | **Sans effet dans cette PR** : le client des photos reste non branché (§ 7). À reprendre avant toute ouverture à un public (0143 § 4 point 3). |

Ces quatre réponses ne sont pas de la main de Samuel : c'est le mandat qui les porte. Le CEO les reporte dans `QUESTIONS.md` par la PR « chore: status ».

**Ce que cette décision n'engage pas.** Aucun réglage Vercel, aucune variable posée, aucune branche créée, aucun appel payant, aucune migration, aucun fichier de `.github/`. Aucune clé de production. Aucune donnée Google en base au-delà de l'identifiant de lieu (0011) : l'écriture des positions au cache reste fermée (§ 7). Aucun test supprimé ni désactivé ; les attentes modifiées sont listées au § 9 (c'est la décision écrite qu'exige `CLAUDE.md`).

## 1. Gardes `better-auth` et `api` : ouvertes pour la seule préversion Vercel de `mvp-essai`

**Amende 0077 § 5.1 (B3-TL-2) et 0086 § 2.1 (B6-TL-7).** Les deux gardes s'ouvrent, en plus de `local` et `ci`, sur **un seul déploiement** : la préversion Vercel de la branche `mvp-essai`. Jamais la production, jamais une autre branche.

1. **Un seul prédicat**, `previewMvpEssai(env)` (`src/dev/flags.ts`), fonction pure, **stricte et sans normalisation** (elle ouvre : comparaisons exactes). Vrai si et seulement si :
   - `isProductionTarget(env)` est fausse (ni `VADROUILLE_ENV`, ni `VERCEL_ENV`, ni `VERCEL_TARGET_ENV` à `production`) ;
   - `VERCEL` vaut exactement `1` et `VERCEL_ENV` exactement `preview` ;
   - `VERCEL_TARGET_ENV` est absente ou vaut exactement `preview` (un environnement personnalisé de Vercel refuse, comme 0138 § 3 condition 4) ;
   - `VADROUILLE_ENV` est absente (toute déclaration de l'opérateur refuse, vide comprise) ;
   - `VERCEL_GIT_COMMIT_REF` vaut exactement `mvp-essai` (constante `BRANCHE_MVP_ESSAI`, seule définition du nom).
2. **Trois lecteurs, même prédicat** :
   - `betterAuthAllowed` (`src/adapters/auth-guard.ts`) : `betterAuthLocalOuCi(env) || previewMvpEssai(env)`. L'ancien corps devient `betterAuthLocalOuCi`, gardé pour ce qui doit rester `local` et `ci` seulement (§ 6) ;
   - `assertApiAdapter` (`src/adapters/api-guard.ts`), par `betterAuthAllowed`, toujours avec `AUTH_ADAPTER=better-auth` ;
   - `parseServerEnv` (`src/server/env/index.ts`) : `AUTH_ADAPTER=better-auth` n'est plus `forbidden` en `staging` **quand** `previewMvpEssai` est vrai ; partout ailleurs, refus inchangé.
3. **Exigences de démarrage propres à la préversion** (`parseServerEnv`) : `BETTER_AUTH_URL` et `APP_URL` en `https://` ; `RATE_LIMIT_HMAC_SECRET` et `TRUSTED_IP_HEADER` requis **au démarrage** (ailleurs, le limiteur échoue fermé à l'usage). Les cookies de session sont sécurisés (`cookiesSecurises` : vrai hors `local`).
4. **Envoi du code** : le cas admis de Resend (`resendAdmis`, 0138 § 3) n'est pas modifié (T2 de 0138). La condition de branche que 0138 confiait à M1h est tenue par l'exigence `AUTH_ADAPTER=better-auth`, désormais admise sur `mvp-essai` seule : `EMAIL_TRANSPORT=resend` ne démarre sur aucune autre préversion.
5. **Connexion simulée** : toujours refusée avec `api` (aucune organisation réelle, 0017 § 11.2 ; plan § 0.3). Aucune connexion de secours n'est ajoutée.

## 2. Barrière des appels réels (B9-TL-8) : branche `mvp-essai`

`BRANCHE_APPELS_REELS` vaut `mvp-essai` (même constante que la garde). Les autres conditions de `evaluerBarriere` ne changent pas : préversion Vercel, `GENERATION_APPELS_REELS` exactement `1` (variable posée par Samuel, **l'interrupteur** : la retirer referme tout appel payant sans redéploiement de code), plafonds posés et non nuls, crochet d'accès (§ 5).

## 3. Plafonds réels (`PLAFONDS_USAGE`)

**Montants de Samuel**, repris tels quels :

| Plafond | Valeur | Source |
|---|---|---|
| IA par voyage, révision comprise | 2 USD : `programme` 1,20 + `revision` 0,80 ; `verification` sans coût de modèle | Q639 ; 0136, question 6 |
| Par organisation et par jour | 10 USD | Q639 |
| Actions sans compte, par jour | 5 USD | Q639 |
| Google, par mois ; jusqu'à G0 | 20 USD ; 40 USD | 0027 § 2 ; 0046 D13 point 3 |
| Modèles, par mois ; jusqu'à G0 | 40 USD ; 80 USD | 0027 § 2 ; 0046 D13 point 3 |

Les mois et les enveloppes sont les **seuls plafonds globaux** (toutes organisations confondues). Comme la préversion est publique (0163), ce sont eux qui bornent la dépense totale : **au plus 20 USD de Google et 40 USD de modèles par mois**, quoi qu'il arrive.

**Valeurs techniques du studio, sous ces montants** (nombres de requêtes ; **à juger par le Tech Lead à la revue**) :

| Profil | Text Search | Fiches | Forfait réservé au prix plein |
|---|---|---|---|
| `programme` | 60 | 60 | 1,20 (IA) + 1,20 = 2,40 USD |
| `revision` | 60 | 60 | 0,80 (IA) + 1,20 = 2,00 USD |
| `verification` (Q843) | 60 | 60 | 1,20 USD |

- Un voyage entier (programme, une révision, vérification) réserve au plus **5,60 USD**, sous les 10 USD par organisation et par jour (test `usage.test.ts`).
- Quota du jour par méthode : 400 requêtes (deux voyages entiers par jour, toutes organisations).
- `relecture` : valeurs de départ de 0100 § 1.4, **non servies sur la préversion** (§ 7).
- `apercu`, `complet`, `lot` (ancienne chaîne, non sélectionnée) et `mini` (B11, non livrée) : le schéma les exige et la barrière exige un profil `apercu` non nul ; valeurs de la variante simulée, coût de modèles sous 2 USD. Aucun workflow de la chaîne inversée ne les réserve.
- Les seuils de l'autocomplétion (Q669) et de l'ajout de lieu (Q682) **ne sont pas validés ici** : `SEUILS_AUTOCOMPLETION_VALIDES` et son équivalent restent à `false`.

## 4. Écriture de programmes réels, et sites proposés par l'IA

1. `ECRITURE_PROGRAMMES_REELS_AUTORISEE` passe à `true`. La question 9 de la spécification B9 portait sur les horaires calculés par le moteur à partir des durées Routes ; la chaîne inversée (`CHAINE_APERCU = "inversee"`, 0136) n'en écrit pas : ses horaires sont rédigés par l'IA et aucune requête Routes ne part à la génération (0136 § 2.4). Q634 et Q636 autorisent l'écriture et l'envoi. **Rebrancher l'ancienne chaîne en réel demande de reprendre la question 9.**
2. **Condition S4-2 de 0139 non posée, donc sites fermés.** 0139 exige, au plus tard dans la PR qui ouvre la barrière, le refus avant toute résolution d'une adresse reprenant un texte du brief. Elle n'est pas écrite. Plutôt que d'ouvrir sans elle, la variante réelle reçoit le **vérificateur fermé** (`barriereFermee: true`) : le serveur n'envoie **aucune** requête vers un site proposé par l'IA, aucune résolution DNS, et aucun lien « Site officiel » n'est gardé. Le point (c) de Q645 reste donc sans objet. Ticket de suite : poser S4-2, puis rebrancher `creerVerificateurStatut`.
3. **S4-3 de 0139 vérifiée** : le prompt `programme` ne reçoit aucun contenu tiers (ni page, ni recherche web) ; `RECIT_API_AUTORISE` reste `false`, le récit n'est ni écrit ni envoyé sur `api` (Q747 non tranchée pour la révision).

## 5. Crochet d'accès de la barrière

1. **Génération** : nouveau crochet `accesGenerationReelle` (`src/server/generation/acces-reel.ts`), branché par défaut dans `src/server/generation/dependances.ts`. Une étape de workflow n'a ni requête ni cookie ; l'accès est contrôlé **avant** elle, par la session `better-auth` qui crée le voyage dans son organisation (RLS). Le crochet vérifie que le processus sert la vraie app sous ses gardes (`assertApiAdapter()`), et ferme sur toute levée.
2. **Recherches de `api`** (ville de l'écran 1, ajout de lieu) : `accesReelApi` **reste fermé** (`false`). L'écran 1 est anonyme et les seuils ne sont pas validés (Q669, Q682). L'écran 1 garde son repli (liste des villes du MVP).
3. **Point soumis à la Sécurité** : sur `api`, « qui peut lancer une génération payante » se ramène à « qui peut ouvrir une session ». Aujourd'hui, sans domaine vérifié, Resend n'envoie qu'à l'adresse de Samuel (Q640) : lui seul reçoit un code. Ce n'est **pas une garde du code**. Dès qu'un domaine est vérifié, toute personne qui atteint la préversion peut créer un compte ; sa dépense reste bornée par les 10 USD par organisation et par jour et, au total, par les plafonds mensuels du § 3.

## 6. Paiement, partage

- `PAYMENT_ADAPTER=stripe` (mode test, 0140) devient disponible sur la préversion : `paymentAvailable` lit `betterAuthAllowed`. Clés `sk_test_` ou `rk_test_` seulement (`parseServerEnv` refuse tout préfixe de production).
- **Paiement simulé : toujours refusé sur la préversion** (Q131 non tranchée). `parseServerEnv` refuse `PAYMENT_ADAPTER=simulated` et le drapeau du webhook simulé en `staging`, et `paymentAvailable` lit désormais `betterAuthLocalOuCi`, pour que l'ouverture du § 1 n'ouvre pas ce chemin. **Sans clés Stripe de test, le déblocage n'est donc pas possible sur la préversion.**
- Partage `api` (0157 § 1.2) : ouvert sur la préversion, avec `TRUSTED_IP_HEADER`, comme 0157 l'annonçait.

## 7. Ce qui reste fermé, et pourquoi

| Fermé | Raison | Suite |
|---|---|---|
| Source réelle de relectures sur la préversion (0100 § 5.3 : `local` seulement) | Chaque lecture réserve un forfait entier au prix plein (0,52 USD par jour lu, 3,20 USD par voyage lu) : quelques pages lues épuiseraient les 10 USD par organisation et par jour. À régler avant d'ouvrir (cache, forfait au réel, #826). | Sur la préversion, la lecture passe par le double de B6, qui ne connaît pas les lieux réels : **temps de trajet et positions absents à l'affichage**. Ticket à ouvrir (Tech Lead). |
| Client des photos du tri (0143 § 4) | Il lui faut un décompte du coût hors de `prototype.forfaits`, un plafond par organisation et par jour, et une nouvelle revue Sécurité : pas faisable proprement dans cette PR. | Les cartes gardent l'emplacement « Photo du lieu ». Ticket de suite. |
| Recherche de ville et ajout de lieu réels | Seuils non validés (Q669, Q682). | Repli de l'écran 1. |
| Sites officiels | S4-2 non posée (§ 4). | Ticket de suite. |
| Écriture des positions au cache (`ECRITURE_POSITIONS_AUTORISEE`) | Purge des coordonnées non activée (Q438, #527). | Inchangé. |
| Récit sur `api` (`RECIT_API_AUTORISE`) | Q747 (révision v3). | Inchangé. |
| Paiement simulé | Q131. | Stripe de test (action S5). |
| Rappels par e-mail réels | 0157, 0162 (`RAPPELS_ENVOI_REEL`). | Inchangé. |

## 8. Vercel : `mvp-essai` construite (amende 0163)

`scripts/vercel/ignore-build.sh` construit `main`, `p0-reel` et `mvp-essai` (0163, « Quand revoir », deuxième point). Chaque poussée sur `mvp-essai` compte dans les 100 déploiements par jour de l'offre gratuite.

**Conséquence de 0163 à juger par la Sécurité** : sans protection des déploiements, la préversion `mvp-essai` est **publique**. Deux conditions d'acceptations antérieures supposaient cette protection et ne sont pas remplies :
- 0138 § 8 (M2-S-8) : n'importe qui peut demander des codes et épuiser le plafond de 100 e-mails par jour (Samuel ne pourrait plus se connecter ce jour-là ; aucun coût) ;
- 0140, question 1 : sans protection, le webhook Stripe est joignable directement (sa signature le protège) : ce point-là devient plus simple.
Q840 (un site public est-il une « mise en public » au sens de 0034, recommandation : oui pour `mvp-essai`) reste ouverte : cette décision **ne la tranche pas** et la signale comme préalable possible à la création de la branche.

## 9. Tests

**Ajoutés** : `tests/unit/adapters/gardes-mvp-essai.test.ts` (prédicat, `betterAuthAllowed`, `assertAuthAdapter`, `assertApiAdapter`, paiement, partage : ouverts sur la préversion de `mvp-essai`, fermés sur 25 autres configurations, production comprise) ; `tests/unit/server/env.test.ts` (démarrage de la préversion, refus partout ailleurs, exigences `https` et limiteur, paiement simulé refusé) ; `src/server/generation/acces-reel.test.ts` (crochet de la génération).

**Attentes modifiées** (aucun test retiré) : les tests qui affirmaient l'état fermé d'avant M1h affirment l'état décidé ici, et gardent la règle qu'ils éprouvaient en la refermant par injection.

| Fichier | Avant | Après |
|---|---|---|
| `src/server/generation/barriere-fermee.test.ts` | `BRANCHE_APPELS_REELS` et `PLAFONDS_USAGE` à `null` | branche `mvp-essai`, plafonds posés ; fermée hors de la branche, sans drapeau, sans préversion, en production ; `plafonds: null` injecté pour l'échec fermé |
| `src/server/generation/generation-unitaires.test.ts` | trois garde-fous fermés | branche posée, programmes réels autorisés, positions toujours fermées ; garde-fou éprouvé avec `programmesReelsAutorises: false` |
| `src/server/config/usage.test.ts`, `src/server/usage/reservation.test.ts` | `PLAFONDS_USAGE` à `null` | montants du § 3 vérifiés un à un |
| `tests/unit/server/composition-lecture.test.ts` | échec fermé par défaut | échec fermé avec `plafonds: null` injecté |
| `tests/unit/vercel-ignore-build.test.ts` | `mvp-essai` ignorée | `mvp-essai` construite ; noms voisins ignorés |

## 10. Verdicts attendus à la revue

- **Tech Lead** : § 1 (prédicat et ses trois lecteurs), § 3 (valeurs techniques), § 5.1 (crochet), § 7 (relectures).
- **Sécurité** : § 1 et § 5.3 (accès), § 4.2 (sites fermés à la place de S4-2), § 8 (préversion publique, Q840, M2-S-8), lignes de confinement ajoutées (`src/dev/flags.ts` : `VERCEL`, `VERCEL_GIT_COMMIT_REF`).

## Quand revoir

- Un domaine d'envoi est vérifié, ou une autre personne que Samuel doit se connecter (§ 5.3).
- Le compte Vercel passe à une offre payante (protection des préversions, § 8).
- Avant toute ouverture à un public : Q696 (photos), Q840, la passe de 0034.
- Samuel reprend l'une des quatre questions tranchées sur mandat.
