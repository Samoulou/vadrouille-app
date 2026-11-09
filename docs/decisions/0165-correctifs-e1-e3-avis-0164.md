# 0165 — Après l'avis 0164 : forme des correctifs E1 (essais du code d'accès) et E3 (page de saisie) ; avis sur E4

Statut : **définitive (0093, fusion de la PR #1066) ; SE1 confirmée par la Sécurité (PR #NUMPR, section « Amendements ») : la voie (c) du § 1 est la forme définitive d'E1 ; la voie de repli (b) du § 1.5 et le ticket E1-repli (§ 4.2) sont sans objet**. Décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`, l. 37-43). Elle répond à **T1** et **T2** de l'avis 0164 (§ 3, « Questions nouvelles ») et à **Q841** de `QUESTIONS.md`, et fixe ce que livrent les tickets E1 et E3 que le CEO ouvrira (§ 4). Rien n'est tranché ici de ce qui revient à la **Sécurité** (confirmation de la forme de E1 : question SE1) ni à **Samuel** (reprise des risques acceptés S1 à S5 de 0164, réglages Vercel et Google, donnée personnelle : questions SA1 à SA3). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-11-09 · Décideur : Tech Lead (T1, T2, forme des tickets E1 et E3, avis sur E4) ; SE1 : confirmée par la Sécurité (Amendements, PR #NUMPR) · Ticket : #1063 · `main` relu : `bd21c14` (après #1057)

Numérotation : `main` va jusqu'à 0164 ; la seule PR ouverte au 2026-11-09 (#1058) ne touche pas `docs/decisions/`.

Références : 0164 (§ 1.1, § 3 E1 à E5, § 4, questions S1 à S5, T1, T2, C1), 0055 (section 2 points 2 et 3 ; S-1 point 4 ; S-2 points 2 et 4), 0046 (D15, D16), 0051 (point 2.1, point 6.2), 0129 (§ 3), 0163, 0002, 0035, 0093 ; `specs/P0-suite-2.md` (l. 151, l. 290) ; `docs/deploiement/variables-environnement.md` (§ `TRUSTED_IP_HEADER`, l. 118-124 ; référents de la clé de carte, l. 159-169).

Code relu (sur `bd21c14`) : `src/server/p0/acces.ts` (en-tête l. 21-36, `ouvertureP0` l. 137-141, `REFUS_DE_PRODUCTION` l. 166, `etatPageAcces` l. 168-184, `SQL_VERROU` à `SQL_ESSAI` l. 196-199, `saisirCodeAcces` l. 208-246) ; `src/server/actions/p0-acces.ts` (l. 19-29) ; `src/server/ip.ts` (`ipAddressKey`, `trustedIpKey`, l. 59-86) ; `src/adapters/share-guard.ts` (`EN_TETE_ADRESSE_DE_CONFIANCE`, l. 38-39) ; `src/server/env/index.ts` (`TRUSTED_IP_HEADER`, l. 553-565 ; `decodeSecret`, l. 317-330) ; `db/migrations/0003_prototype.sql` (`prototype.run_attempts` l. 221-231, déclencheur `run_attempts_set_values` l. 344-355, `GRANT INSERT (resultat)` l. 413, purge l. 497-510) ; `db/migrations/0017_brief_saisi_prototype.sql` (dernière version de `prototype.purge_expired`, l. 154) ; `.github/workflows/p0-purge.yml` (cron `17 */6 * * *`, l. 14) ; `tests/unit/p0/acces.test.ts` (l. 145-163, l. 199-222) ; `tests/support/base-essais-p0.ts` ; `tests/db/p0-acces.test.ts` (l. 182-225) ; `src/i18n/fr/prototype.json` (l. 11) ; `src/app/p/[token]/page.tsx` (l. 32).

**Ce que cette décision n'engage pas.** Aucun code, aucun test, aucune migration dans cette PR (documentation seule). Aucune dépense, aucun compte externe, aucune variable d'environnement, aucun réglage Vercel, Google, OpenRouter ou Neon, aucune valeur de secret lue. La forme retenue pour E1 (§ 1) **n'ajoute aucune donnée personnelle** et ne demande ni migration ni `GRANT`. Elle prévoit la **modification** de tests existants, sans en retirer aucun (§ 4.1) : `tests/unit/p0/acces.test.ts` (cas « au 6e essai de l'heure (acceptés compris) »), `tests/db/p0-acces.test.ts` (fin du cas des 6 saisies simultanées, cas de la fenêtre d'une heure). Cette décision est la décision écrite qu'exige `CLAUDE.md` pour ces modifications.

## Contexte

- **E1** (0164 § 3) : le compteur de 5 essais par heure glissante est **global** (`acces.ts` l. 197-198, refus à 5 l. 229) et compte les essais acceptés (0055 S-2 point 2). Sans la protection Vercel, n'importe qui peut l'épuiser et empêcher Samuel de saisir le code pendant une heure. Ni coût, ni fuite : disponibilité seulement. La Sécurité propose un compteur par adresse et laisse la forme au Tech Lead (T1).
- **E3** (0164 § 3) : le commentaire de `acces.ts` l. 169-172 dit les préversions « derrière la protection Vercel », ce qui n'est plus vrai. Sur une préversion d'une autre branche (`branch_refused`), chaque affichage de `/prototype/executions` écrit `p0.guard_closed` (l. 177-179). T2 demande si cela doit cesser hors de `p0-reel`.
- **Q841** reprend T1 et T2. Elle parle d'une « rétention d'une heure dans `run_attempts` ». La valeur réelle est **24 heures** : `expires_at := now() + interval '24 hours'` (`0003_prototype.sql` l. 352), purge toutes les 6 heures (`p0-purge.yml` l. 14). Seul le **compte** porte sur 60 minutes (`acces.ts` l. 198).

## Décision

### 1. T1 — E1 : le bon code n'est jamais compté contre Samuel (comparaison d'abord, plafond sur les seuls refus)

**Retenu, sous réserve de la Sécurité (SE1) : voie (c) ci-dessous. Pas de compteur par adresse.**

#### 1.1 Voies examinées

| Voie | Ce qu'elle fait | Pourquoi elle n'est pas retenue |
|---|---|---|
| (a) Compteur par adresse **à la place** du global | 5 essais par heure et par adresse | Plus aucune borne globale ; une adresse IPv6 se renouvelle à volonté (un /64 par client, `ip.ts` l. 72) ; ajoute une donnée personnelle (adresse, même hachée) et une migration. |
| (b) Compteur par adresse **en plus** du global (piste de 0164) | 5 par adresse, plafond global relevé en filet | Le filet global reste épuisable par plusieurs adresses : le blocage de Samuel n'est que repoussé. Demande `TRUSTED_IP_HEADER` sur `p0-reel` (réglage de Samuel), une table, un `GRANT`, une purge, et une donnée personnelle à justifier. Gardée comme **voie de repli** (§ 1.5) si la Sécurité refuse (c). |
| **(c) Comparaison d'abord ; plafond sur les seuls refus** | Le bon code est toujours accepté ; seuls les refus sont comptés et plafonnés | **Retenue** : supprime le blocage, sans donnée nouvelle ni changement de schéma. |

#### 1.2 Forme de (c) (`saisirCodeAcces`, `acces.ts` l. 208-246)

1. **Garde d'abord**, inchangée : `ouvertureP0` ; fermée → `fermee`, sans base (l. 214-215).
2. **Comparaison avant toute base** : `essaiAccepte(saisie, attendu)` (l. 202-206, inchangée : saisie de plus de 256 caractères ou indécodable refusée sans calcul, comparaison en temps constant). Elle ne coûte que du calcul local.
3. **Bon code** : une transaction **sans verrou consultatif et sans compte** insère la ligne `accepte` (`SQL_ESSAI`, inchangé), puis le cookie est rendu. Le bon code n'attend donc jamais derrière une file d'essais forgés. Base injoignable ou erreur → `indisponible` (échec fermé, 0055 section 2 point 3, inchangé).
4. **Mauvais code** : transaction actuelle (verrou `p0_run_attempts`, compte, insertion), avec un compte **des seuls refus** : `… WHERE resultat = 'refuse' AND created_at > now() - make_interval(mins => 60)`. À 5 refus ou plus : `too_many_attempts`, **sans ligne nouvelle** ; sinon ligne `refuse`, puis `invalid_code`.
5. **Inchangés** : `ESSAIS_PAR_HEURE = 5` (il borne désormais les refus), `LONGUEUR_SAISIE_MAX`, les codes rendus (`API_ERROR_CODES`, F8b), le cookie, la table, son `GRANT INSERT (resultat)` (`0003_prototype.sql` l. 413), ses 24 heures et la condition de 0055 S-2 point 4 (seulement `resultat`, aucune empreinte, aucun préfixe, aucune longueur).

#### 1.3 Ce que (c) change à la sécurité (à confirmer par la Sécurité, SE1)

- **Blocage de Samuel par un inconnu (0055 S-2 point 2)** : supprimé. Un inconnu peut toujours mettre le site en état `too_many_attempts` pour les mauvais codes, mais le bon code passe. Les essais acceptés ne comptent plus non plus (cinq saisies réussies dans l'heure ne bloquent plus la sixième).
- **Borne des essais** : aujourd'hui 5 comparaisons par heure, acceptées comprises. Avec (c), le nombre de comparaisons n'est plus borné par le compteur. Il n'est borné que par le débit de la fonction et par l'entropie du code. Le code est tiré par `openssl rand -hex 32` (0055 § 4, D22, point 2), soit 256 bits, et `decodeSecret` refuse moins de 32 octets ou un code trivial (`src/server/env/index.ts` l. 317-330). Même à 1 000 essais par seconde pendant un an (environ 3,2 × 10¹⁰ ≈ 2³⁵ essais), la probabilité de trouver le code reste de l'ordre de 2⁻²²¹. Ce n'est pas un risque réaliste. La réponse ne donne aucun signal nouveau : accepté ou non, comme aujourd'hui.
- **Écritures en base** : bornées comme aujourd'hui pour un inconnu (5 lignes `refuse` par heure au plus). Seul le détenteur du code peut écrire des lignes `accepte` sans borne.
- **Charge de la base** : chaque mauvais essai prend le verrou et lit un compte, comme aujourd'hui. Aucune charge nouvelle. Le bon code ne prend plus le verrou.
- **Trace** : les refus au-delà du plafond ne laissent aucune ligne, comme aujourd'hui. La trace durable reste `prototype.run_attempts` (0164 § 4).

#### 1.4 Réponse aux points de T1 (et de Q841)

| Point de T1 | Réponse (voie c) |
|---|---|
| Compteur par adresse, en plus ou à la place du global | Ni l'un ni l'autre. Compteur global gardé, limité aux refus. |
| En-tête de confiance `x-vercel-forwarded-for` | Aucun en-tête lu. `TRUSTED_IP_HEADER` n'est pas requis sur `p0-reel`. |
| Hachage | Sans objet : aucune adresse n'est traitée. |
| Durée de conservation dans `prototype.run_attempts` | Inchangée : 24 heures, purge toutes les 6 heures (0046 D15 et D16). Compte sur 60 minutes. |
| Donnée personnelle | Aucune donnée nouvelle. |
| Contrat de schéma et `GRANT` | Aucun changement. `GRANT INSERT (resultat)` suffit. Le compte lit `resultat` et `created_at` grâce au `SELECT` de table déjà accordé (`tests/db/roles.test.ts` l. 596). |
| Migration | Aucune. |

#### 1.5 Voie de repli (b), seulement si la Sécurité refuse (c)

La forme ci-dessous est fixée d'avance, pour que le ticket de repli n'attende pas une seconde décision. Elle reste soumise à SE1 et à SA1.
1. **Adresse** : `trustedIpKey(headers, env.trustedIpHeader)` (`src/server/ip.ts` l. 79-86) sur l'environnement validé par `src/server/env/index.ts` (0051 point 2.1). Jamais de lecture directe de `x-vercel-forwarded-for` ni d'un autre en-tête. IPv6 ramenée à son /64 (`ipAddressKey`). Clé `null` (en-tête non configuré, absent ou illisible) : un compartiment commun « sans adresse », soumis au même plafond par adresse.
2. **Empreinte** : `hex(HMAC(K_adresse, clé d'adresse))`, avec `K_adresse = HMAC-SHA-256(code, "vadrouille/p0/empreinte-adresse/v1")`. La clé est dérivée du code, comme `empreinteCookieAcces` (`acces.ts` l. 75-83, 0129 § 3). Il n'y a donc **aucun secret nouveau**, et une rotation du code change toutes les empreintes. L'étiquette est distincte de celles de la comparaison, du cookie et de l'empreinte du cookie (0055 S-1 point 1).
3. **Schéma** : `prototype.run_attempts` reste **inchangée**, donc 0055 S-2 point 4 est tenu pour elle. Une table nouvelle `prototype.run_attempts_adresses` (`id`, `organization_id`, `adresse_empreinte text NOT NULL CHECK (adresse_empreinte ~ '^[0-9a-f]{64}$')`, `created_at`, `expires_at`) est remplie par un déclencheur sur le modèle de `run_attempts_set_values`, avec `expires_at := now() + interval '1 hour'`. Le nom de colonne évite le motif `/address/` de `tests/db/schema.test.ts`. Droits : `GRANT SELECT` et `GRANT INSERT (adresse_empreinte)` à `vadrouille_prototype` ; `DELETE` et `SELECT (expires_at)` à `vadrouille_fn_prototype_purge`, avec politique de purge. `prototype.purge_expired` est redéfinie à partir de sa dernière version (`0017_brief_saisi_prototype.sql` l. 154). Le retour arrière supprime la table.
4. **Plafonds** : 5 essais par heure et par empreinte, et 30 par heure au total en filet. Le compte inclut les acceptés, comme aujourd'hui.
5. **Conservation** : 1 heure, puis suppression à la purge suivante (toutes les 6 heures), soit **7 heures au plus**. Raccourcir encore demanderait de changer la cadence de `p0-purge.yml`, donc une PR de workflow avec l'`owner-approved` de Samuel (0035).
6. **Préalables** : SA1 (donnée personnelle et durée) et le réglage `TRUSTED_IP_HEADER=x-vercel-forwarded-for` sur la préversion `p0-reel`. Sans ce réglage, tout tombe dans le compartiment commun, et l'on retrouve le défaut d'aujourd'hui.

### 2. T2 — E3 : le commentaire est corrigé ; l'affichage **continue** d'écrire `p0.guard_closed` hors production

**Retenu : non.** L'affichage de `/prototype/executions` ne cesse pas d'écrire `p0.guard_closed` hors de `p0-reel`. Seul le commentaire change.
1. **Le journal sert au diagnostic de `p0-reel` lui-même.** Si `VERCEL_GIT_COMMIT_REF` n'y valait pas exactement `p0-reel`, la garde y serait fermée avec `branch_refused`. Le code ne peut pas distinguer ce cas d'une préversion d'une autre branche. Taire `branch_refused` à l'affichage priverait donc le relevé de 0055 S-1 point 4 et la condition E2 de 0164 de leur seul signal sans saisie.
2. **L'exposition est déjà réduite.** Depuis 0163, seules `main` (production : rien n'est écrit à l'affichage, `REFUS_DE_PRODUCTION`, l. 166) et `p0-reel` sont construites. Le bruit ne vient plus que d'anciennes préversions encore servies, que Samuel peut supprimer (SA3). Le coût est nul (offre gratuite) et le journal ne garde qu'une heure (0164 § 4).
3. **Commentaire** (`acces.ts` l. 168-173), à réécrire en substance ainsi : « Hors production, les préversions sont publiques depuis la désactivation de la protection Vercel (0164). L'affichage y écrit `p0.guard_closed`, par choix (0165 § 2). C'est l'outil du relevé de 0055 S-1 point 4 sur `p0-reel`. Un inconnu peut l'inonder, ce qui ne produit que du bruit dans un journal gardé une heure. Depuis 0163, seules `main` et `p0-reel` sont construites. » L'en-tête du module (l. 29-30) est réécrit par E1 (§ 4.1), pas par E3.

### 3. Q841 — réponse

- **Compteur par adresse** : non. Le compteur global reste, mais il ne compte que les refus, et le bon code est toujours accepté (§ 1, sous réserve de SE1). Aucun en-tête, aucun hachage, aucune donnée personnelle, aucun changement de `prototype.run_attempts` (24 heures, et non une heure).
- **`p0.guard_closed` hors de `p0-reel`** : il reste écrit (§ 2). Seul le commentaire est corrigé.

### 4. Tickets à ouvrir par le CEO

Composition simulée partout, aucun appel payant, aucun `p0Run` réel. Les tests de base tournent en CI.

#### 4.1 E1 — `[back]` « Code d'accès : le bon code n'est jamais refusé par le compteur » (après la confirmation de SE1)

**Fichiers** :
- `src/server/p0/acces.ts` : `saisirCodeAcces` selon le § 1.2 ; `SQL_COMPTE` limité à `resultat = 'refuse'` ; en-tête l. 29-30 (« 5 refus par heure glissante ; le bon code n'est jamais compté contre lui ») ; commentaire de `ESSAIS_PAR_HEURE` (l. 42) ; commentaire de `saisirCodeAcces` (l. 208-212).
- `src/server/actions/p0-acces.ts` : commentaire de l. 19.
- `tests/unit/p0/acces.test.ts` ; `tests/support/base-essais-p0.ts` : le double compte les seuls refus quand la requête filtre `resultat` ; une transaction sans verrou y est déjà possible.
- `tests/db/p0-acces.test.ts`.
- `src/i18n/fr/prototype.json` l. 11 : texte relu. « Trop d'essais : réessaie dans une heure. » reste exact pour un mauvais code. Toute modification passe par l'UX/UI, sinon le texte est laissé tel quel.
- `docs/handovers/backend.md`, si une ligne y décrit le compte des essais.

**Critères** :
1. Après 5 refus dans l'heure, le bon code (hexadécimal ou base64) est accepté, et la ligne `accepte` est écrite.
2. Après 5 refus, un mauvais code rend `too_many_attempts`, sans ligne nouvelle.
3. Six bons codes dans l'heure sont tous acceptés (six lignes `accepte`).
4. Le bon code ne prend pas le verrou et ne lit pas le compte. Vérifié sur l'ordre des requêtes du double : ni `pg_advisory_xact_lock` ni `pg_catalog.count(*)`.
5. Un refus de plus d'une heure n'est pas compté ; un refus de moins d'une heure l'est.
6. Six mauvaises saisies simultanées donnent 5 lignes `refuse` au plus et exactement un `too_many_attempts`.
7. Inchangés : saisie de plus de 256 caractères refusée et comptée, garde fermée sans connexion, base indisponible rendant `indisponible`, aucune trace du code (sentinelle), aucune comparaison par `===`.
8. Aucune migration, aucun fichier de `db/` touché, `tests/db/roles.test.ts` inchangé.

**Tests modifiés, jamais retirés** :
- `tests/unit/p0/acces.test.ts` l. 199-208 : le cas « au 6e essai de l'heure (acceptés compris) » devient « 5 refus puis bon code : accepté ; 5 refus puis mauvais code : `too_many_attempts` sans ligne ; libre une heure après ».
- `tests/unit/p0/acces.test.ts` l. 210-222 : le cas simultané. Le bon code passe désormais : on attend 5 lignes `refuse` au plus, et le bon code accepté.
- `tests/db/p0-acces.test.ts` l. 197-208 : le titre du cas des 6 saisies simultanées (toutes de mauvais codes) reste. Ses deux dernières assertions (l. 205-207, « Le bon code ne passe plus ») deviennent « le bon code passe, une ligne `accepte` de plus ».
- `tests/db/p0-acces.test.ts` l. 218-225 : le cas « un essai de plus d'une heure n'est pas compté ; un essai de moins d'une heure l'est » porte sur des refus. La seconde saisie (l. 223) devient un mauvais code, qui reçoit `too_many_attempts`, et le cas vérifie en plus que le bon code passe.

**Ajouts** : critères 1, 3 et 4 en unitaire ; critère 1 en base, sur `vadrouille_prototype`.

#### 4.2 E1-repli — `[data]` puis `[back]` (seulement si la Sécurité refuse (c) et que Samuel répond oui à SA1)

**Fichiers** : migration `prototype.run_attempts_adresses` et son `.down.sql` (§ 1.5 point 3) ; `tests/db/roles.test.ts` (`PROTOTYPE_TABLES`, droits exacts) ; `tests/db/prototype.test.ts` ; `tests/unit/db/` (test de migration) ; `src/server/p0/acces.ts` (empreinte, double compte) ; `src/server/actions/p0-acces.ts` (`headers()` passés à `saisirCodeAcces`) ; tests unitaires et de base d'E1.

**Critères** : ceux du § 1.5, plus :
- aucune adresse en clair, en base comme dans les journaux (sentinelle) ;
- une rotation du code change l'empreinte ;
- clé `null` → compartiment commun ;
- ligne d'adresse supprimée par `prototype.purge_expired` après `expires_at` ;
- empreinte de la ligne `MIGRATIONS_APPROUVEES` donnée dans la PR (ligne ajoutée par une PR de workflow à part, 0035).

#### 4.3 E3 — `[back]` « Commentaire de la page de saisie après 0164 » (sans préalable)

**Fichiers** : `src/server/p0/acces.ts`, commentaire de `etatPageAcces` (l. 168-173) selon le § 2 point 3, et commentaire de `REFUS_DE_PRODUCTION` (l. 165) si besoin.

**Critères** :
- diff limité à des commentaires (aucune ligne de code exécutable modifiée) ;
- `tests/unit/p0/acces.test.ts` l. 145-163 (« écrit en préversion (relevé) et par les actions ») inchangé et vert ;
- aucune mention restante de la protection Vercel comme barrière dans `src/server/p0/`, vérifiée par une recherche sur « protection Vercel » ; les mentions historiques, datées, sont admises.

**Tests** : aucun nouveau (comportement inchangé). E3 peut partir dans la même PR qu'E1 si le CEO le préfère : leurs lignes ne se recouvrent pas.

#### 4.4 E4 — pas de ticket de code

- La vue partagée `/p/…` ne charge la carte qu'avec un jeton signé valide : un jeton invalide rend `notFound()` avant tout rendu (`src/app/p/[token]/page.tsx` l. 32 ; `src/server/essai/partage.ts`). La dépense par `/p/` est donc le fait des seules personnes à qui Samuel a donné un lien.
- Le vrai risque d'E4 est ailleurs : la clé publique est acceptée par **tout** site en `*.vercel.app` (`docs/deploiement/variables-environnement.md` l. 165-169). N'importe qui peut la reprendre sur son propre site, et aucun limiteur de Vadrouille ne le voit. Seuls un quota Google (0164, S2) et une liste de référents plus étroite (SA2) le bornent.
- Un limiteur de `/p/` sur le site d'essai demanderait `TRUSTED_IP_HEADER` et `RATE_LIMIT_HMAC_SECRET` sur `p0-reel` (réglages de Samuel), plus la base du limiteur, pour un gain marginal. **Avis du Tech Lead : pas de ticket.** À rouvrir si des liens d'essai sont donnés au-delà d'un petit cercle, ou si le quota de S2 ne peut pas être posé.

## Textes amendés (par renvoi, sans les réécrire)

Ces amendements ne valent qu'à la fusion du ticket E1 (§ 4.1), donc après la confirmation de la Sécurité (SE1). Si la Sécurité retient la voie de repli, le § 1.5 les remplace.
- **0055, section 2 point 3** (D19) : « 5 essais par heure glissante » devient « 5 refus par heure glissante ; le bon code est comparé d'abord et n'est jamais refusé par le compte » (§ 1.2). « Refus sans comparaison » ne vaut plus que pour le refus du compte, pas pour le bon code.
- **0055, S-2 point 2** : le risque « un tiers peut épuiser les 5 essais et bloquer Samuel une heure ; les essais acceptés comptent » disparaît. Il est remplacé par le risque 1 ci-dessous. **0055 S-2 point 4** : inchangé, et tenu.
- **`specs/P0-suite-2.md`** l. 151 (« 5 essais par heure au plus, puis refus pendant une heure ») et l. 290 (titre du critère) : la décision prime. Le titre du critère `p0: jeton limité à 5 essais par heure…` peut rester, il désigne désormais les refus.
- **0164 § 3 E1** : la piste « compter aussi par adresse » n'est pas retenue (§ 1.1). E3 : T2 répondu (§ 2). E4 : avis donné (§ 4.4).

## Conséquences

- La revue Tech Lead d'E1 et d'E3 vérifie le § 4 ; un écart demande une décision écrite.
- Une fois E1 fusionné, la question S1 de 0164 (reprise de 0055 S-2 points 1 et 2) ne porte plus que sur le point 1 (cookie volé valable 12 heures) et sur le risque 1 ci-dessous. Elle reste à Samuel, et n'est pas tranchée ici.
- E2 (relevé de la route de flux) n'est touché ni par E1 ni par E3 : il reste un préalable à toute saisie du code (0164, S5).

## Risques (à lister dans la note de version)

1. **Voie (c)** : le nombre de comparaisons n'est plus borné par le compteur, seulement par le débit et par l'entropie du code (256 bits, § 1.3). Si un code plus faible était posé un jour, ce risque changerait : `decodeSecret` refuse moins de 32 octets, pas un code de 32 octets mal tiré.
2. **Voie (c)** : un inconnu peut maintenir l'état `too_many_attempts` pour les mauvais codes. Samuel, qui a le bon code, n'est pas touché. Une personne qui se tromperait de bonne foi attendrait une heure.
3. **T2** : `p0.guard_closed` reste inondable, à l'affichage, sur une ancienne préversion encore servie ou sur `p0-reel` garde fermée. Cela ne produit que du bruit dans un journal gardé une heure (§ 2).

## Questions nouvelles, par destinataire (à reporter par le CEO dans `QUESTIONS.md`)

**Sécurité**
- **SE1** — Confirmes-tu la voie (c) du § 1 ? Elle compare d'abord, ne compte que les refus, et le bon code n'est jamais refusé par le compte. Le nombre de comparaisons n'est alors plus borné que par l'entropie du code, de 256 bits (§ 1.3, risque 1). Sinon, retiens-tu la voie de repli (b) du § 1.5, qui ajoute une empreinte d'adresse dans une table à part et laisse `run_attempts` inchangée (0055 S-2 point 4) ? Bloque : le ticket E1 (§ 4.1 ou § 4.2).

**Samuel** (donnée personnelle, comptes externes : réservé)
- **SA1** — *Seulement si la Sécurité retient (b)* : acceptes-tu de conserver une empreinte de l'adresse IP de chaque personne qui saisit un code sur le site d'essai ? Ce serait une donnée personnelle pseudonymisée, gardée 7 heures au plus (§ 1.5 point 5). Il faudrait aussi poser `TRUSTED_IP_HEADER=x-vercel-forwarded-for` sur la préversion `p0-reel`. Bloque : E1-repli seulement ; rien si (c) est confirmée.
- **SA2** — Faut-il remplacer le référent `https://*.vercel.app/*` de la clé `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` par les seules adresses exactes de `main` et de la branche `p0-reel` (adresse de branche stable de Vercel) ? Aujourd'hui, n'importe quel site en `vercel.app` peut utiliser la clé à tes frais (§ 4.4). Ce point complète S2 de 0164 (quota). Bloque : rien ; réduit E4.
- **SA3** — Peux-tu supprimer les anciennes préversions d'autres branches encore servies ? Depuis 0163, elles ne sont plus construites, mais celles qui restent sont publiques, gardent les gardes de leur commit et nourrissent `p0.guard_closed` (§ 2). Bloque : rien ; réduit E3 et E5 de 0164.

**CEO**
- **C1** — Ouvrir E3 (§ 4.3) maintenant. Ouvrir E1 (§ 4.1) après la réponse de la Sécurité à SE1, ou E1-repli (§ 4.2) si elle retient (b) et que Samuel répond oui à SA1. Ne pas ouvrir de ticket E4 (§ 4.4). Reporter SE1 et SA1 à SA3 dans `QUESTIONS.md`, et marquer Q841 « Répondue (0165) ».

## Quand revoir

- À la réponse de la Sécurité sur SE1 (le § 1 ou le § 1.5 devient la forme d'E1).
- Si le code d'accès cesse d'être un secret aléatoire de 256 bits (risque 1).
- Si `p0-reel` est ouvert à d'autres personnes que Samuel (G0 ou au-delà) : la voie (c) suppose un seul détenteur du code.
- Si des liens d'essai `/p/` sont donnés au-delà d'un petit cercle (E4, § 4.4).

## Amendements

### Amendée par la PR #NUMPR (ticket #1070, 2026-11-09) — verdict de la Sécurité sur SE1

Statut : **avis de l'agent securite**, qui répond à SE1. La Sécurité n'a pas de domaine délégué (`docs/CONTEXT.md`, « Qui décide quoi » ; 0164, en-tête) : cet amendement ne tranche rien d'autre que la réserve SE1 que le Tech Lead a posée au § 1. Il ne modifie aucun code, aucun test, aucune migration, aucun réglage. Code relu sur `origin/main` au commit `dbcd736` (après #1058) : `src/server/p0/acces.ts` (en-tête l. 21-36, `memeCode` l. 64-68, `SQL_VERROU` à `SQL_ESSAI` l. 196-199, `essaiAccepte` l. 202-206, `saisirCodeAcces` l. 208-246), `src/server/env/p0.ts` (`decoderJetonSaisi`, l. 120-126), `src/server/env/index.ts` (`OCTETS_MIN = 32` et `OCTETS_DISTINCTS_MIN = 16`, l. 260-261 ; `decodeSecret`, l. 317-330), `src/server/actions/p0-acces.ts` (l. 19-29), `src/server/p0/base.ts` (l. 15-18). Les lignes citées par 0165 sont inchangées depuis `bd21c14`.

#### 1. Verdict : **voie (c) confirmée**

La Sécurité confirme la voie (c) du § 1 (comparaison d'abord, seuls les refus comptés, 5 par heure glissante, bon code jamais refusé par le compte), dans la forme du § 1.2. Elle **ne retient pas** la voie de repli (b) du § 1.5.

Motifs :
1. **(c) supprime le défaut d'E1 ; (b) ne fait que le repousser.** Avec (b), le filet global de 30 essais par heure reste épuisable par quelques adresses, et une adresse IPv6 se renouvelle à volonté (§ 1.1). Avec (c), aucun nombre de refus, d'où qu'ils viennent, ne fait refuser le bon code par le compte.
2. **(c) n'ajoute ni donnée personnelle, ni table, ni `GRANT`, ni réglage.** 0055 S-2 point 4 reste tenu tel quel. (b) demanderait une empreinte d'adresse (SA1), `TRUSTED_IP_HEADER` sur `p0-reel` (réglage de Samuel) et une migration de plus.
3. **Ce que (c) abandonne (la borne de 5 comparaisons par heure) ne protégeait rien de mesurable** face à un code de 256 bits (point 2 du § 2 ci-dessous). La borne utile est l'entropie du code, et elle est tenue par la procédure de D22 (0055 § 4 point 2).

Conséquences :
- **SA1 est sans objet** : la question à Samuel ne se pose que si (b) est retenue (§ « Questions nouvelles »). Le CEO peut la retirer de `QUESTIONS.md` ou la marquer sans objet. `TRUSTED_IP_HEADER` n'est pas requis sur `p0-reel` pour E1.
- **Le ticket E1 (§ 4.1) peut être ouvert** par le CEO ; le ticket E1-repli (§ 4.2) ne l'est pas.
- La piste de 0164 § 3 E1 (« compter aussi par adresse ») est retirée par la Sécurité elle-même.
- **Rien de ce qui revient à Samuel n'est tranché.** S1 de 0164 reste à Samuel : après la fusion d'E1, elle ne porte plus que sur 0055 S-2 point 1 (cookie volé valable 12 heures) et sur les risques 1 et 2 de 0165 (§ « Conséquences »). La reprise de ces risques, le redéploiement de `p0-reel`, SA2 et SA3 restent à lui.

#### 2. Relecture du § 1.3, point par point

| Point du § 1.3 | Avis de la Sécurité |
|---|---|
| **Blocage de Samuel par un inconnu** (0055 S-2 point 2) | **Confirmé**, avec une précision. Le blocage **par le compte** disparaît : le bon code ne lit pas le compte et ne prend pas le verrou (§ 1.2 point 3). Les essais acceptés ne comptent plus. Reste un blocage qui n'est pas propre au compteur : un afflux de mauvaises saisies simultanées attend le verrou consultatif en tenant chacune une connexion. Si les connexions de Neon venaient à manquer, le bon code recevrait `indisponible` (échec fermé, voulu). Ce défaut existe déjà aujourd'hui et existerait de même avec (b) (le compte par adresse passe aussi par la base). Il demande un afflux soutenu, et non 5 requêtes par heure. Ce n'est donc pas un motif de préférer (b). Il est consigné comme risque 4 ci-dessous. |
| **Borne des essais** | **Confirmé.** Le calcul est juste : 1 000 essais par seconde pendant un an font environ 3,15 × 10¹⁰ ≈ 2³⁵ essais, soit une probabilité de l'ordre de 2³⁵ / 2²⁵⁶ = 2⁻²²¹. Le débit réel est bien plus faible : chaque mauvaise saisie prend le verrou, et les mauvaises saisies sont donc traitées une à une. Deux précisions. (1) **La réponse reste un oracle au-delà du plafond** : aujourd'hui, au-delà de 5 essais, la réponse est `too_many_attempts` sans comparaison ; avec (c), un mauvais code reçoit `too_many_attempts` et le bon code un cookie. C'est exactement le « nombre de comparaisons non borné » du risque 1. Les réponses possibles sont les mêmes qu'aujourd'hui et ne disent rien de plus que « accepté ou non ». (2) **L'entropie repose sur la procédure, pas sur le contrôle** : `decodeSecret` refuse moins de 32 octets, les motifs triviaux et moins de 16 octets distincts (`src/server/env/index.ts` l. 260-261, l. 317-330), mais ne prouve pas qu'un code de 32 octets a été tiré au hasard. Les 256 bits sont tenus par `openssl rand -hex 32` (D22 point 2). La saisie passe par ce même `decodeSecret` (`decoderJetonSaisi`, `src/server/env/p0.ts` l. 120-126) : une saisie de moins de 32 octets est refusée sans comparaison et comptée comme un refus, comme aujourd'hui. Le temps de réponse du bon code (sans verrou) diffère de celui d'un mauvais (avec verrou) ; il ne révèle que le résultat, que la réponse donne déjà, puisque la comparaison est faite en temps constant avant (`memeCode`, l. 64-68). |
| **Écritures en base** | **Confirmé.** Un inconnu écrit au plus 5 lignes `refuse` par heure glissante (le refus du compte n'écrit rien, verrou compris). Seul le détenteur du code écrit des lignes `accepte` sans borne, gardées 24 heures (D15, D16). Chaque ligne `accepte` est aussi la trace d'une saisie réussie : une ligne `accepte` que Samuel ne reconnaît pas signale un code connu d'un tiers, donc une rotation (D22 point 6). |
| **Charge de la base** | **Confirmé.** Chaque mauvaise saisie coûte un verrou et un compte, comme aujourd'hui au-delà du plafond. La comparaison faite avant le verrou ne coûte que quelques HMAC sur au plus 256 caractères (`LONGUEUR_SAISIE_MAX`). Le bon code ne coûte qu'une insertion. Le risque d'afflux est celui du premier point (risque 4). |
| **Trace** | **Confirmé.** Les refus au-delà du plafond ne laissent ni ligne ni journal (`saisirCodeAcces` n'appelle pas `logEvent`), comme aujourd'hui. La trace durable reste `prototype.run_attempts`, limitée à `resultat` et `created_at` (0055 S-2 point 4). Une tentative massive ne se voit donc que par les 5 lignes `refuse` de chaque heure et par les journaux d'accès de Vercel. C'est suffisant pour le prototype à un seul détenteur. |

#### 3. Ce que la revue Sécurité du ticket E1 vérifiera

La revue Tech Lead vérifie le § 4.1 (§ « Conséquences »). La revue Sécurité de la PR d'E1 vérifiera en plus, sur le head proposé :
1. **Ordre** (§ 1.2) : garde d'abord, sans base si elle est fermée ; puis `essaiAccepte` **avant** toute connexion et toute requête. Aucune autre branche ne précède la comparaison, hormis la garde.
2. **Bon code** : transaction sans `SQL_VERROU` ni `SQL_COMPTE` (critère 4 du § 4.1, sur l'ordre des requêtes du double), insertion de `accepte`, puis `COMMIT`. Le cookie n'est rendu **qu'après** un `COMMIT` réussi. Toute erreur (connexion, insertion, `COMMIT`) rend `indisponible`, jamais un cookie (échec fermé, 0055 section 2 point 3).
3. **Mauvais code** : verrou, puis compte filtré sur `resultat = 'refuse'` et sur 60 minutes, la valeur `'refuse'` étant écrite dans le texte SQL (aucune valeur tirée de la saisie dans une requête). À 5 ou plus : `ROLLBACK` et `too_many_attempts`, sans ligne. Sinon : ligne `refuse` et `invalid_code`. Compte illisible : `indisponible`.
4. **Saisie hors forme** : une saisie qui n'est pas une chaîne, de plus de 256 caractères ou indécodable suit le chemin du mauvais code (comptée, plafonnée), sans décodage au-delà de 256 caractères.
5. **Concurrence** : 6 mauvaises saisies simultanées donnent au plus 5 lignes `refuse` et exactement un `too_many_attempts` (critère 6) ; le bon code passe après 5 refus (critère 1) et six fois dans l'heure (critère 3).
6. **Aucune trace du code** : test sentinelle inchangé et vert (console, journaux, état sérialisé, erreurs, base) ; `prototype.run_attempts` ne reçoit que `resultat` (0055 S-2 point 4) ; aucune comparaison par `===` (test statique inchangé).
7. **Réponses** : toujours les seuls codes `fermee`, `invalid_code`, `too_many_attempts`, `indisponible` ; l'état du formulaire (`src/server/actions/p0-acces.ts`) ne porte qu'un statut. Aucun nouveau signal (ni compte restant, ni délai) dans la réponse ou dans le texte de `src/i18n/fr/prototype.json`.
8. **Périmètre** : aucun fichier de `db/`, aucune migration, aucun `GRANT`, `tests/db/roles.test.ts` inchangé (critère 8) ; aucun en-tête d'adresse lu, aucune lecture de `TRUSTED_IP_HEADER` ni d'`x-vercel-forwarded-for` dans `src/server/p0/` ; `ESSAIS_PAR_HEURE`, `LONGUEUR_SAISIE_MAX`, le cookie et ses clés dérivées inchangés.
9. **Tests modifiés, jamais retirés** : les quatre cas du § 4.1 sont modifiés comme écrit, et aucun autre test d'`acces.ts` n'est supprimé ni désactivé (`CLAUDE.md`).
10. **Commentaires** : l'en-tête (l. 29-30), `ESSAIS_PAR_HEURE` (l. 42), `saisirCodeAcces` (l. 208-212) et `src/server/actions/p0-acces.ts` l. 19 disent « 5 refus par heure glissante ; le bon code n'est jamais compté contre lui », sans mention de la protection Vercel comme barrière.

Un écart sur l'un de ces points vaut changements demandés.

#### 4. Risques (s'ajoutent à ceux de 0165, à lister dans la note de version)

4. **Afflux de mauvaises saisies** : des mauvaises saisies simultanées et soutenues attendent le verrou en tenant une connexion chacune. Si les connexions venaient à manquer, le bon code recevrait `indisponible` pendant l'afflux. Ce risque existe déjà aujourd'hui et n'est pas propre à (c). Le prototype n'a qu'un utilisateur. Une borne d'attente du verrou (`lock_timeout`, comme `src/server/auth/index.ts` l. 185-187) le réduirait côté base ; c'est une suggestion au Tech Lead, **non exigée** pour E1. Une limite de débit en amont (pare-feu Vercel) est un réglage de compte externe, donc à Samuel (non posé ici).

#### 5. « Quand revoir » (inchangé, précisé)

La confirmation de (c) tombe si l'une des conditions de « Quand revoir » change : code qui ne serait plus un secret aléatoire de 256 bits, `p0-reel` ouvert à d'autres détenteurs du code que Samuel (G0 ou au-delà), ou mise en public au sens de 0034 point 1. Dans chacun de ces cas, la Sécurité réexamine (c) et la voie (b) avant le changement.
