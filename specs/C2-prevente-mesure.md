# C2 — Mesurer la prévente : compteur de visites et questionnaire

Rédaction : Product Owner · Date : 2026-11-10 · `main` relu : `2c95b60` · Branche de la prévente relue : `claude/project-thread-e29et3` (PR #1102, **non fusionnée** à la rédaction) · Ticket : #1112 · Rôles des tâches qui suivent : data (C2a), backend (C2b, C2c, C2e), frontend (C2d), qa (C2f) · Revue : Tech Lead, Sécurité, UX/UI.

## Objectif
Rendre lisibles deux des trois seuils commerciaux de G0 (décision 0044) : **300 visites** de la page de prévente et **10 réponses** au questionnaire en ligne. Le troisième (5 préventes payées dont 3 hors cercle proche) se lit dans Stripe (décision 0168, point 3) et n'entre pas ici.

Trois pièces :
1. un **compteur de visites** de la page de prévente, côté serveur, sans cookie ni identifiant personnel ;
2. un **questionnaire** de 5 questions, sans donnée personnelle demandée, lié depuis la page de prévente et depuis la page « Merci » ;
3. une **lecture des compteurs** par le studio, sans compte externe ni dépense.

Règle au-dessus de toutes les autres : **la page de prévente ne casse jamais à cause de la mesure**. Sans base, ou base en panne : pas de compteur, pas de questionnaire, et la page s'affiche comme avant.

## Références
- Décision 0044 (seuils G0) ; décision 0168 sur la branche de la PR #1102 (point 10 : « le compteur de visites et l'exclusion de `?src=interne` viennent avec la tâche "questionnaire et compteur" » ; « Conditions d'activation », dernier tiret).
- `docs/commercial/suivi.md` : « Ce qu'est une visite », « Provenance (cumul) », « Questionnaire (cumul) », « Qui remplit ».
- `docs/commercial/questionnaire.md` : règles, les 5 questions, introduction et fin, « Où il apparaît ».
- `docs/commercial/page-prevente.md` : § 6 (« Après le paiement »), « Mesure (pour la tâche frontend) ».
- Code de la prévente (branche de la PR #1102) : `src/adapters/prevente.ts` (`getPrevente`, `sourcePrevente`), `src/app/page.tsx`, `src/app/precommande/page.tsx`, `src/app/precommande/merci/page.tsx`, `src/features/accueil/LandingPrevente.tsx`, `src/i18n/fr/prevente.json`, `next.config.ts` (en-têtes de `/precommande/:path*`).
- Base : `db/README.md`, `db/connection.ts` (garde de production), décisions 0002 (aucun stockage propre à Vercel), 0006 et 0007 (migrations, rôles), 0034 (aucune connexion en production avant la passe de sécurité), 0035 (fichiers sous `.github/workflows/`), 0036 (noms des variables), 0057 (`db-releve.yml`, modèle d'une lecture par workflow), 0163 (offre gratuite de Vercel : seules `main` et `p0-reel` sont construites).
- Limiteur : `src/server/rate-limit.ts`, `src/server/config/limites.ts`, `src/server/ip.ts`.
- Interface : `docs/handovers/frontend.md` § 4 (tokens Ligne), § 10 (vocabulaire), § 11 (accessibilité).
- `QUESTIONS.md` : Q24 (Neon à Francfort, relié à Development et Preview seulement), Q27 (durées de conservation), Q86 (seuils du limiteur), Q127, Q357, Q362 (Q-C1-7 : définition d'une visite et du cercle proche ; Q-C1-8 : rattachement des réponses au paiement).

## Prérequis, dans cet ordre
1. **PR #1102 fusionnée** (décision 0168) : tout le code de C2 s'appuie sur `getPrevente`, `sourcePrevente`, `LandingPrevente` et les pages `/precommande`. Si #1102 change ces noms avant sa fusion, les tâches suivent le code fusionné.
2. Cette spécification fusionnée.
3. Réponses du **Tech Lead** (T1 à T6) et avis de la **Sécurité** (S1 à S5), dans leur revue ou par une décision à part.
4. C2a, puis C2b et C2c, puis C2d ; C2e après C2a ; C2f en dernier (tableau « Tâches »).
5. Pour compter en production : la section « Une base en production » (réservé à Samuel pour l'essentiel). **Rien dans C2 n'ouvre la production** ; le code fusionne éteint par l'absence de base.

Si la réponse du Tech Lead ou de la Sécurité change un point de cette spécification, elle prime pour ce point.

---

## 1. Ce que la personne voit

| Qui | Ce qui se passe |
|---|---|
| Une personne ouvre la page de prévente | Rien de visible : la page s'affiche comme avant, sans bandeau, sans cookie, sans script de mesure. |
| Elle n'a pas précommandé | En bas de page, un lien discret : « Pas pour cette fois ? Dis-nous ce qui t'a retenu, en deux minutes. » Jamais de fenêtre qui bloque la lecture. |
| Elle a payé et revient sur « Merci » | Sous les phrases existantes, un lien : « Deux minutes pour nous dire où tu pars ? » |
| Elle ouvre le questionnaire | Une page courte : introduction, 5 questions facultatives, un bouton « Envoyer ». Après l'envoi : « Merci. Tes réponses nous servent à choisir les destinations et à améliorer le produit. » et « Revenir à l'accueil ». |
| Le stockage n'est pas disponible | Les deux liens n'apparaissent pas. Qui ouvre l'adresse du questionnaire à la main lit « Le questionnaire n'est pas encore ouvert. » et « Revenir à l'accueil ». Aucune erreur. |
| Le studio | Lance un workflow GitHub et lit les nombres de la semaine dans son résumé (§ 5). |

---

## 2. Compteur de visites (C2b)

### 2.1 Règles reprises de `suivi.md` (« Ce qu'est une visite »)
Ces règles sont une **proposition du rôle `commercial`, à confirmer par Samuel** (Q362, Q-C1-7). C2 les code telles quelles ; si Samuel les change, une tâche les aligne.

1. Une visite est **un affichage de la page de prévente**, compté **côté serveur**.
2. **Aucun cookie, aucun identifiant personnel.** Donc aucun dédoublonnage par personne : un rechargement ou un retour compte à nouveau. Le seuil de 300 se lit en affichages.
3. **Exclus** : les robots déclarés (agent utilisateur de robot connu) ; les visites faites par le lien de test `?src=interne`.
4. La **provenance** est la valeur du paramètre `src` du lien.

### 2.2 Précisions fonctionnelles (décisions C2-PO-1 à C2-PO-6, rubrique « Décisions »)
1. **La page de prévente** est la page d'accueil `/` quand la précommande est ouverte (`getPrevente()` non nul, décision 0168 point 1). Précommande fermée : rien n'est compté. `/precommande`, `/precommande/merci` et le questionnaire ne sont pas des visites.
2. **Un affichage** est une réponse `GET` de la page, rendue par le serveur. Ne comptent pas : une requête `HEAD` ; un préchargement (en-tête `Next-Router-Prefetch`, ou `Purpose` ou `Sec-Purpose` contenant `prefetch`) ; une requête de données du routeur qui n'affiche pas la page entière (forme exacte : T3).
3. **Robots déclarés** : agent utilisateur reconnu par une liste embarquée dans le code, sans appel réseau (source de la liste : T2). La liste couvre au moins les cas des tests : `Googlebot`, `bingbot`, `facebookexternalhit`, `Twitterbot`, `Slackbot-LinkExpanding`, `WhatsApp`, `curl`. Un agent utilisateur **absent ou vide** n'est pas compté.
4. **Provenance gardée**, à partir de `sourcePrevente` (lettres minuscules, chiffres, tirets, 30 au plus) :
   - `interne` : **rien n'est écrit** ;
   - une valeur de la liste de `suivi.md` (`proches`, `forum`, `groupe`, `reddit`, `instagram`, `instagram-pub`, `createur`) : gardée telle quelle ;
   - valeur valide mais hors liste : comptée sous **`autre`** (la table ne grossit pas au gré d'adresses fabriquées) ;
   - `src` absent, répété ou de forme invalide : compté sous **`direct`** (ligne « sans `src` » de `suivi.md`).
   La liste vit dans une seule constante de configuration côté serveur ; une valeur s'ajoute par une PR.
5. **Ce qui est stocké** : un nombre par jour (UTC) et par provenance. **Aucune ligne par visite** : ni heure, ni adresse IP, ni agent utilisateur, ni adresse de page, ni `Referer`. L'adresse IP n'est pas lue par le compteur.
6. **Le compteur ne retarde ni ne casse la page.** Le rendu n'attend pas l'écriture. Toute erreur (pas de base, garde de production, délai, refus de rôle) est avalée : la page répond comme sans compteur, et une ligne de journal porte un code seulement (jamais la chaîne de connexion, l'hôte, ni l'agent utilisateur). Pas de nouvelle tentative, pas de file d'attente : une visite non écrite est perdue, limite acceptée.

### 2.3 Limites connues, à écrire dans `suivi.md` par C2b
- Le compte surestime le nombre de personnes (pas de dédoublonnage) et sous-compte quand la base est indisponible.
- Un robot non déclaré (qui se présente comme un navigateur) est compté. Aucune parade sans identifiant ; signalé à la Sécurité (S4).
- Le jour est en UTC : une visite de 00:30, heure de Suisse, compte la veille. Sans effet sur le cumul.

---

## 3. Questionnaire (C2c, C2d)

### 3.1 Les questions
Elles existent : `docs/commercial/questionnaire.md` (rôle `commercial`, 2026-10-13). C2 les reprend **sans les modifier** : introduction, 5 questions, fin. Les libellés vont dans `src/i18n/fr/prevente.json` ; les réponses sont stockées par **code stable**, jamais par libellé :

| Question | Saisie | Codes stockés |
|---|---|---|
| 1. « Où pars-tu ? » | champ court, facultatif | texte libre, 80 caractères au plus (C2-PO-9) |
| 2. « Quand pars-tu ? » | choix unique | `paques`, `ascension`, `pentecote`, `printemps`, `plus-tard`, `sans-date` |
| 3. « Comment as-tu préparé ton dernier voyage ? » | plusieurs choix | `guides-blogs`, `avis-cartes`, `assistant`, `application`, `agence`, `presque-rien`, `autre` |
| 4, parcours `precommande`. « Qu'est-ce qui t'a décidé ? » | plusieurs choix | `adresses-sourcees`, `evenements`, `remplacer`, `prix`, `gain-de-temps`, `demonstration`, `autre` |
| 4, parcours `visite`. « Qu'est-ce qui t'a retenu ? » | plusieurs choix | `prix`, `pas-de-voyage`, `attendre`, `assistant-gratuit`, `fiabilite`, `destination`, `autre` |
| 5. « Comment as-tu découvert Vadrouille ? » | choix unique | `connait-createur`, `ami`, `forum-groupe`, `instagram`, `createur-contenu`, `autre` |

Règles de `questionnaire.md` gardées : toutes les questions facultatives ; une question = une saisie ; « Autre » est une case simple, sans champ libre ; un seul champ libre (question 1), avec la mention « N'indique ni nom, ni adresse, ni numéro. » ; aucune donnée personnelle demandée ; **aucun rattachement au paiement** (recommandation de `questionnaire.md`, Q-C1-8 non tranchée : C2 code la version anonyme).

### 3.2 Adresses, parcours et provenance
1. Adresse : **`/precommande/questionnaire`** (C2-PO-7). Elle hérite des en-têtes de `/precommande/:path*` (`Cache-Control: private, no-store`, `Referrer-Policy: strict-origin`, `X-Robots-Tag: noindex, nofollow`). Précommande fermée : 404, comme les autres pages `/precommande`.
2. **Parcours** (branche de la question 4) : `?apres=paiement` donne `precommande` ; toute autre valeur, ou l'absence du paramètre, donne `visite`. C'est une déclaration, pas une preuve de paiement : l'application ne connaît pas le paiement (0168 point 7).
3. **Lien de la page de prévente** : en bas de page, texte du § 1, vers `/precommande/questionnaire`, avec `?src=` quand la provenance de la visite est valide. Lien `<a>` simple, sans fenêtre ni bandeau.
4. **Lien de la page « Merci »** : texte du § 1, vers `/precommande/questionnaire?apres=paiement`. La page « Merci » ne lit et ne transmet **aucun paramètre** de son adresse (ni identifiant de session Stripe, ni autre).
5. **Provenance d'une réponse** : même règle que les visites (§ 2.2 point 4). `src=interne` : la personne voit le même parcours et le même « Merci », **rien n'est stocké**.
6. Les deux liens ne s'affichent que si le stockage est disponible (§ 6.2).

### 3.3 Envoi
1. Le formulaire fonctionne **sans JavaScript** (envoi natif vers le serveur) ; la page de prévente reste sans JavaScript client.
2. Le serveur valide par un schéma strict de `src/contracts` : codes hors liste, clé inconnue, texte de plus de 80 caractères ou parcours inconnu donnent `validation_failed`, rien n'est stocké.
3. Question 1 : espaces de début et de fin retirés, caractères de contrôle retirés, suites d'espaces réduites à une ; vide après nettoyage : absente.
4. **Réponse entièrement vide** : refusée, avec « Réponds à au moins une question. » (C2-PO-10). Elle ne compte pas pour le seuil de 10.
5. Après un envoi accepté : redirection (303) vers l'état « Merci » ; recharger cette page ne renvoie rien.
6. Échec du stockage (base tombée entre l'affichage et l'envoi) : la page réaffiche le formulaire **avec les réponses saisies** et « Tes réponses n'ont pas pu être enregistrées. Réessaie dans un instant. » (`role="alert"`).
7. **Ce qui est stocké par réponse** : un identifiant aléatoire, le jour (UTC, sans l'heure), la provenance, le parcours, les réponses. **Jamais** : adresse IP, agent utilisateur, identifiant de session, identifiant de paiement, adresse e-mail, heure précise.
8. Pas de dédoublonnage : une personne peut répondre deux fois. Le limiteur (§ 3.4) borne l'abus ; le seuil de 10 se lit en envois.

### 3.4 Limitation de débit
1. Action `questionnaire-prevente` du limiteur existant (`src/server/rate-limit.ts`, table `action_rate_limits`, clés HMAC : aucune adresse IP en clair en base), espèce `ip` : **5 envois par heure et par adresse IP** (proposition ; seuil réel : Sécurité, S2, comme Q86). Sans en-tête d'adresse de confiance, le compartiment commun `no-trusted-ip` s'applique.
2. **Plafond global** : au plus **200 réponses stockées par jour UTC**, toutes adresses confondues (proposition, S2) : borne le volume si l'en-tête d'adresse est contourné.
3. Refus (limiteur, plafond, ou limiteur indisponible : règle existante, fermé par défaut) : « Trop d'envois pour le moment. Réessaie plus tard. » (`role="alert"`), réponses saisies gardées dans le formulaire, rien n'est stocké.
4. Le limiteur est évalué **après** la validation du schéma et **avant** toute écriture. Les réponses `src=interne`, jamais stockées, passent aussi par le limiteur.
5. **Les visites ne passent pas par le limiteur** : le compteur ne lit pas l'adresse IP (§ 2.2 point 5). Son volume est borné par sa forme : au plus 9 lignes par jour.

### 3.5 Interface (C2d)
Écran hors maquettes, sur le modèle des deux écrans de 0168 point 7 : colonne étroite (`max-w-md`), titre `titre-jour`, police de Ligne (pas Fraunces), composants Ligne existants. **Avis UX/UI attendu à la revue de C2d** (U1 à U3).
- Tokens Ligne seulement (`docs/handovers/frontend.md` § 4) : aucune couleur en dur, aucune valeur arbitraire de couleur (`pnpm lint`).
- Vocabulaire et ton du § 10 : tutoiement, phrases courtes, ni point d'exclamation ni emoji.
- Accessibilité (§ 11, WCAG 2.2 AA) :
  - un seul `h1` ; `lang="fr"` ; ordre de tabulation égal à l'ordre de lecture ; focus visible partout ;
  - chaque question est un `fieldset` avec sa `legend` ; cases et boutons radio **natifs**, chacun avec son `label` ; cible d'au moins 44 × 44 px ;
  - question 1 : `label` visible (pas de texte d'exemple à la place), mention « N'indique ni nom… » reliée par `aria-describedby`, `maxlength="80"`, `autocomplete="off"` ;
  - « Toutes les questions sont facultatives. » dans l'introduction ; aucun champ `required` ;
  - erreurs et refus en `role="alert"`, en texte (jamais par la seule couleur) ; confirmation en `role="status"` ;
  - contrastes : texte ≥ 4,5:1, contours de contrôle ≥ 3:1 ;
  - utilisable à 390 × 844 et jusqu'à 200 % de zoom sans défilement horizontal.
- Textes nouveaux (propositions, à valider par l'UX/UI, U1) : titre « Deux minutes pour nous aider » ; bouton « Envoyer » ; « Réponds à au moins une question. » ; « Tes réponses n'ont pas pu être enregistrées. Réessaie dans un instant. » ; « Trop d'envois pour le moment. Réessaie plus tard. » ; « Le questionnaire n'est pas encore ouvert. » ; « Revenir à l'accueil » (existant). Introduction, questions, options et fin : `questionnaire.md`, mot pour mot.

---

## 4. Données (C2a)

Proposition de forme ; noms, types, rôles et droits reviennent au rôle `data` et au Tech Lead (T1), avec l'avis de la Sécurité (S1).

| Table | Colonnes | Contraintes |
|---|---|---|
| `prevente_visites` | `jour` (date UTC), `src` (texte), `visites` (entier) | clé primaire (`jour`, `src`) ; `src` dans la liste fermée du § 2.2 plus `direct` et `autre`, **jamais `interne`** (`CHECK`) ; `visites` ≥ 1 ; écriture par incrément atomique (`INSERT … ON CONFLICT … DO UPDATE`) |
| `prevente_reponses` | `id` (uuid), `jour` (date UTC), `src`, `parcours` (`precommande` ou `visite`), `destination` (texte, nul ou 1 à 80 caractères), `periode` (code ou nul), `preparation` (liste de codes), `motifs` (liste de codes), `decouverte` (code ou nul) | codes des listes du § 3.1 (`CHECK`) ; `motifs` cohérents avec `parcours` ; au moins une réponse non vide (`CHECK`) ; `src` jamais `interne` |

Contraintes de la tâche :
- **Postgres seulement**, par `db/schema/` et une migration relue de `db/migrations/` au prochain numéro libre, avec son retour arrière (`.down.sql`) et sa ligne dans `MIGRATIONS_APPROUVEES` (workflow `db-migrate`). Aucun stockage ni API propres à Vercel (KV, Edge Config, Analytics, Blob : décision 0002).
- **Moindre privilège** (0007) : le rôle de l'application n'a sur ces deux tables que ce que l'écriture demande (`INSERT` et l'incrément ; pas de `DELETE`, pas de lecture des réponses). La lecture passe par un rôle distinct qui n'a que `EXECUTE` sur les fonctions d'agrégat du § 5. Rôle applicatif existant ou rôle dédié : T1.
- **Ces tables n'appartiennent à aucune organisation** (visiteurs anonymes, avant tout compte) : écart au principe « multi-organisation dès le schéma » (`docs/CONTEXT.md`), à valider par le Tech Lead (T1).
- **Durée de conservation des réponses** : non fixée dans le dépôt (Q27 est ouverte pour les données de compte). Question à Samuel (§ « Questions ouvertes », 3). D'ici là, la migration ne crée aucune purge ; la spécification ne promet aucune durée à la personne.
- Tests de base (`tests/db/`) : droits de chaque rôle, contraintes `CHECK`, incrément concurrent, refus de `interne`.

---

## 5. Lecture des compteurs par le studio (C2e)

**Forme proposée : un workflow GitHub lancé à la main**, sur le modèle de `db-releve.yml` (décision 0057). Pas de page interne : une page ajouterait une surface publique, un secret d'accès et un écran à protéger, pour un besoin d'une lecture par semaine. Pas de compte externe, pas de dépense (Actions est gratuit sur un dépôt public). Forme technique : Tech Lead (T5) ; avis de la Sécurité (S3).

1. Workflow `prevente-releve.yml`, `workflow_dispatch` seulement, sur `main`, environnement GitHub dédié, connexion par variables libpq tirées de secrets, sous un rôle de lecture qui n'a que `EXECUTE` sur les fonctions d'agrégat. Aucune session d'agent ne se connecte à la base (règle P0S2-PO-7, reprise).
2. Le dépôt est public, donc **les journaux sont publics** : le workflow n'affiche que des **nombres** et des **codes**. Ces nombres finissent de toute façon dans `docs/commercial/suivi.md`, qui est public.
3. Sortie (résumé du job), dans l'ordre de `suivi.md` :
   - visites par semaine (lundi à dimanche, jours UTC) et cumul sur 300 ;
   - visites par provenance (cumul) ;
   - réponses : cumul sur 10, par provenance, par parcours ;
   - répartition des questions 2, 3, 4 (une liste par parcours) et 5, par code.
4. **Question 1 (texte libre)** : jamais affichée brute. Le workflow affiche les 5 destinations les plus citées **parmi celles citées au moins 2 fois** (après mise en minuscules et nettoyage des espaces), et le nombre de réponses restantes sous « autres ». Motif : quelqu'un peut écrire un nom ou une adresse malgré la mention. Seuil de 2 : proposition (S3).
5. **Lecture brute des destinations**, pour D3 : une requête documentée dans `db/maintenance/` (lecture seule, texte seulement, sans `id` ni `jour`), exécutée par Samuel dans la console Neon, comme le repli de `coords-purge` ; jamais par le studio.
6. Un fichier sous `.github/workflows/` demande le libellé `owner-approved` posé par Samuel (décision 0035), et l'environnement, le rôle et les secrets sont posés par Samuel : voir « Questions ouvertes », 2.
7. C2e met à jour `db/README.md` (rôle, workflow, requête) et la rubrique « Qui remplit » de `docs/commercial/suivi.md` (lecture par le workflow ; lignes `direct` et `autre` de la provenance ; limites du § 2.3). Le report hebdomadaire reste au rôle `commercial`.

Avant qu'une base existe en production, le workflow échoue à chaque lancement : attendu, comme `coords-purge` avant la pose de ses secrets.

---

## 6. Sans base, et en production

### 6.1 État constaté (rien n'est inventé ici)
- **La production n'a aucune base.** Les variables Neon visent Development et Preview seulement ; aucune ne vise Production (décision 0034, « État vérifié » du 2026-10-12 ; Q24). Cet état n'a pas été revérifié pour cette spécification.
- **Le code refuse toute connexion en production** : `db/connection.ts` n'ouvre aucune connexion quand l'environnement résolu est `production` (0034, « Garde préalable à toute fusion »), et `pnpm db:migrate` refuse aussi.
- **Aucune préversion par PR** : depuis 0163, Vercel ne construit que `main` (cible production) et `p0-reel`. C2 se vérifie donc en `local` et en CI (conteneur Postgres de la CI), pas sur une préversion de sa branche.
- La page de prévente elle-même n'est pas activée en production (`PREVENTE=1` attend les conditions de 0168).

### 6.2 Comportement du code sans base (exigé, testé)
Une seule fonction dit si la mesure est disponible, **sans ouvrir de connexion** : variables de connexion présentes et environnement autorisé par la garde de `db/connection.ts`. Elle est exposée par `src/adapters`.

| Situation | Page de prévente | Compteur | Liens vers le questionnaire | `/precommande/questionnaire` |
|---|---|---|---|---|
| Mesure indisponible (pas de variable, ou production aujourd'hui) | s'affiche comme avant | aucune écriture, aucune tentative de connexion, aucune ligne de journal par requête | absents | « Le questionnaire n'est pas encore ouvert. », code 200 |
| Mesure disponible, base en panne ou trop lente | s'affiche comme avant, sans attendre | visite perdue, une ligne de journal (code seulement) | présents | formulaire affiché ; à l'envoi, message du § 3.3 point 6 |
| Mesure disponible, base saine | s'affiche comme avant | visite écrite | présents | formulaire, envoi, « Merci » |
| Précommande fermée (`PREVENTE` ≠ `1`) | accueil habituel | rien | sans objet | 404 |

Aucune de ces situations ne rend une erreur 500 sur `/`, `/precommande`, `/precommande/merci` ou `/precommande/questionnaire`.

**Adaptateur `mock`** (`local`, CI, démonstration) : la mesure a une mise en œuvre en mémoire, pour que C2d et C2f se testent sans base. Elle ne vaut jamais en production.

### 6.3 Une base en production : ce qu'il faut
C2 ne fait rien de cette liste ; elle dit ce qui manque. Tant qu'un point manque, les seuils 300 et 10 ne se lisent pas en production.

| # | Ce qu'il faut | Qui |
|---|---|---|
| 1 | Décider qu'une base sert la production, et laquelle : une base ou une branche Neon **distincte** de celle des préversions (recommandation), en région UE. Si la formule gratuite de Neon suffit : **non vérifié dans le dépôt**. | Samuel (mise en production, comptes, argent) ; Tech Lead pour la forme |
| 2 | Avis écrit de la Sécurité : la passe de 0034 (« avant la mise en public »), ou un verdict limité à cette ouverture (deux tables sans donnée de compte, le limiteur, rien d'autre). | Sécurité ; accord de Samuel |
| 3 | Décision écrite sur l'ouverture de la garde de production de `db/connection.ts` **pour ces seules tables** (rôle dédié, liste d'autorisation, tests de la garde dans la même PR). Aujourd'hui la garde refuse tout. | Tech Lead et Sécurité (`docs/decisions/`) |
| 4 | Rôles créés (`db/bootstrap/roles.sql`) et migrations appliquées sur cette base par le workflow `db-migrate` (qui refuse aujourd'hui la production : même décision que le point 3). | data ; Samuel pour les secrets |
| 5 | Variables posées sur l'environnement Production de Vercel : la chaîne de connexion du rôle à moindre privilège (nom selon 0036, jamais `DATABASE_URL` ni l'identifiant propriétaire), les variables du limiteur (secret HMAC, `TRUSTED_IP_HEADER`). | Samuel |
| 6 | Environnement GitHub, rôle de lecture et secrets du workflow `prevente-releve` ; libellé `owner-approved` sur sa PR. | Samuel |
| 7 | Conditions de 0168 pour `PREVENTE=1` (mentions du vendeur, lien Stripe, offre Vercel payante) : indépendantes de C2, rappelées parce que sans elles aucune visite n'existe. | Samuel, CEO |
| 8 | Texte d'information sur les données (question « Que devient ce que je saisis ? » de `page-prevente.md` § 7) : il doit couvrir le questionnaire avant son ouverture au public. | Samuel (juridique, Q127) |

---

## 7. Contraintes communes aux tâches
- Données seulement par `src/adapters` et les types de `src/contracts` : aucune page, aucun composant n'importe `db/` ni `src/server/` directement. Les contrats (provenance, parcours, codes, réponse, relevé) sont des schémas stricts.
- Aucune API ni stockage propres à Vercel ; aucun service de mesure externe ; aucun script tiers ; aucun cookie ; aucun `localStorage`.
- Aucune donnée Google n'est concernée.
- Aucune clé de production, aucun secret committé ; aucun message d'erreur ou journal ne contient une chaîne de connexion, un hôte, une adresse IP ou le texte de la question 1.
- Aucun appel payant : C2 se code et se teste en `local` et en CI.
- `pnpm verify` au vert ; une PR qui touche `db/` s'appuie sur le job `db` de la CI.

---

## 8. Tâches

Une spécification, six tâches (règle du CEO pour une étape découpée, Q826). Chaque tâche a son ticket, sa branche et sa PR.

| ID | Tâche | Rôle | Dépend de | Fichiers principaux |
|---|---|---|---|---|
| **C2a** | Tables `prevente_visites` et `prevente_reponses`, rôles et droits, fonctions d'agrégat de lecture, migration et retour arrière, tests de base | data | #1102 fusionnée ; T1, S1 | `db/schema/`, `db/migrations/`, `db/bootstrap/roles.sql`, `tests/db/`, `db/README.md` |
| **C2b** | Contrats de la mesure ; adaptateur (mémoire et Postgres) ; « mesure disponible » ; compteur de visites branché sur `/` ; `suivi.md` (limites, lignes `direct` et `autre`) | backend | C2a ; T2, T3, T4, S4 | `src/contracts/`, `src/adapters/`, `src/server/`, `src/app/page.tsx` (appel seul), `docs/commercial/suivi.md` |
| **C2c** | Envoi du questionnaire : schéma, nettoyage, limiteur `questionnaire-prevente`, plafond du jour, écriture, codes d'erreur | backend | C2a, C2b (contrats) ; S2 | `src/contracts/`, `src/adapters/`, `src/server/actions/`, `src/server/config/limites.ts` |
| **C2d** | Page `/precommande/questionnaire` (formulaire, « Merci », « pas encore ouvert »), liens de la page de prévente et de « Merci », textes | frontend | C2b, C2c ; U1 à U3 | `src/app/precommande/questionnaire/`, `src/features/accueil/LandingPrevente.tsx`, `src/app/precommande/merci/page.tsx`, `src/i18n/fr/prevente.json` |
| **C2e** | Workflow `prevente-releve.yml`, requête de `db/maintenance/`, documentation (`db/README.md`, `suivi.md` « Qui remplit ») | backend | C2a ; T5, S3 ; `owner-approved` (0035) | `.github/workflows/`, `db/maintenance/`, `db/README.md` |
| **C2f** | Parcours de bout en bout, accessibilité (axe), captures 390 × 844, cas « sans base » | qa | C2b, C2c, C2d | `tests/e2e/`, `tests/visual/` |

Ordre : **C2a → C2b → C2c → C2d → C2f** ; **C2e** en parallèle dès C2a fusionnée. Une seule tâche à la fois sur `db/migrations` (C2a) ; C2b et C2c touchent toutes deux `src/contracts` et `src/adapters` : pas dans le même cycle. C2b peut être livrée et utile seule (le compteur ne dépend pas du questionnaire).

---

## 9. Critères d'acceptation

Chaque critère est vérifié par un test nommé dans la PR de sa tâche. « Écriture » : appel de l'adaptateur de mesure, observé par un espion ou par la base de test.

### Compteur (C2b)
- [ ] **A1** `GET /` avec `PREVENTE=1` et un agent utilisateur de navigateur : exactement une écriture, `visites` + 1 pour le jour UTC et la provenance `direct`.
- [ ] **A2** `GET /?src=forum` : + 1 sous `forum`. Table de cas pour les 7 valeurs de la liste.
- [ ] **A3** `GET /?src=interne` : aucune écriture ; la page est identique à celle de `?src=forum`, au lien près.
- [ ] **A4** `GET /?src=inconnu-123` : + 1 sous `autre` ; `?src=FORUM`, `?src=a&src=b`, `?src=` et une valeur de 31 caractères : + 1 sous `direct`.
- [ ] **A5** Aucune écriture pour chacun des agents utilisateurs `Googlebot`, `bingbot`, `facebookexternalhit`, `Twitterbot`, `Slackbot-LinkExpanding`, `WhatsApp`, `curl`, ni pour un agent utilisateur absent ou vide (table de cas).
- [ ] **A6** Aucune écriture pour une requête `HEAD`, ni pour une requête portant `Next-Router-Prefetch`, `Purpose: prefetch` ou `Sec-Purpose: prefetch`.
- [ ] **A7** `PREVENTE` absent ou différent de `1` : aucune écriture sur `/`. `GET /precommande`, `/precommande/merci` et `/precommande/questionnaire` : aucune écriture de visite.
- [ ] **A8** Deux `GET /` identiques : deux visites (pas de dédoublonnage) ; la réponse ne pose aucun cookie (`Set-Cookie` absent) et la page ne charge aucun script de mesure.
- [ ] **A9** La ligne écrite ne contient que `jour`, `src` et `visites` ; l'adresse IP n'est pas lue par le compteur (espion sur `src/server/ip.ts` : aucun appel).
- [ ] **A10** Adaptateur dont l'écriture lève une erreur : `GET /` répond 200 avec le même HTML que sans compteur ; une ligne de journal, sans chaîne de connexion, hôte ni agent utilisateur.
- [ ] **A11** Adaptateur dont l'écriture ne se termine jamais : `GET /` répond quand même (le rendu n'attend pas l'écriture).
- [ ] **A12** Mesure indisponible (variable de connexion absente ; puis environnement `production`, table de cas commune `tests/support/cas-production-commune.ts`) : aucune tentative de connexion, aucune écriture, `GET /` répond 200.

### Données (C2a)
- [ ] **B1** La migration s'applique sur une base vide après les précédentes, et son retour arrière la défait ; une seconde exécution de `pnpm db:migrate` ne fait rien.
- [ ] **B2** 50 incréments concurrents du même (`jour`, `src`) donnent `visites` = 50, une seule ligne.
- [ ] **B3** `src = 'interne'` est refusé par la base dans les deux tables ; un code hors liste, une `destination` de 81 caractères, des `motifs` d'un autre parcours et une réponse entièrement vide sont refusés.
- [ ] **B4** Le rôle d'écriture ne peut ni lire ni supprimer `prevente_reponses`, ni toucher une autre table que celles prévues ; le rôle de lecture n'a que `EXECUTE` sur les fonctions d'agrégat et aucun droit sur une table.
- [ ] **B5** Aucune colonne des deux tables ne peut recevoir une adresse IP, un agent utilisateur, une heure ou un identifiant de paiement (liste des colonnes figée dans un test).

### Questionnaire, serveur (C2c)
- [ ] **C1** Un envoi valide écrit une ligne avec les codes du § 3.1, le parcours et la provenance ; `?apres=paiement` donne `precommande`, tout autre cas `visite`.
- [ ] **C2** Un code hors liste, une clé inconnue, un texte de 81 caractères, des motifs de l'autre parcours : `validation_failed`, aucune écriture.
- [ ] **C3** Question 1 : `"  Lisbonne \n"` est stocké `Lisbonne` ; une valeur faite d'espaces est stockée absente.
- [ ] **C4** Réponse entièrement vide : refusée, aucune écriture, message « Réponds à au moins une question. ».
- [ ] **C5** `src=interne` : réponse « Merci », aucune écriture dans `prevente_reponses`.
- [ ] **C6** Sixième envoi dans l'heure depuis la même adresse : `rate_limited`, aucune écriture ; limiteur indisponible : `rate_limited`, aucune écriture.
- [ ] **C7** Plafond du jour atteint : refus, aucune écriture, même message que C6.
- [ ] **C8** L'écriture échoue : le formulaire revient avec les réponses saisies et le message du § 3.3 point 6 ; aucune erreur 500.
- [ ] **C9** Après un envoi accepté, la réponse est une redirection 303 ; recharger la page d'arrivée ne provoque aucune écriture.
- [ ] **C10** Aucun journal ne contient le texte de la question 1 ni l'adresse IP (test sur le journal capturé).

### Questionnaire, interface (C2d)
- [ ] **D1** La page de prévente porte le lien « Pas pour cette fois ?… » vers `/precommande/questionnaire`, avec `?src=forum` quand la page est ouverte par `?src=forum` ; aucun lien quand la mesure est indisponible.
- [ ] **D2** « Merci » porte le lien « Deux minutes pour nous dire où tu pars ? » vers `/precommande/questionnaire?apres=paiement` ; ouvert avec `?session_id=abc`, son HTML ne contient pas `abc` ; aucun lien quand la mesure est indisponible.
- [ ] **D3** Le formulaire affiche l'introduction, les 5 questions et leurs options de `questionnaire.md`, mot pour mot ; la question 4 n'affiche qu'une liste, selon le parcours.
- [ ] **D4** JavaScript désactivé : remplir, envoyer et lire « Merci » fonctionne.
- [ ] **D5** Mesure indisponible : `/precommande/questionnaire` répond 200 avec « Le questionnaire n'est pas encore ouvert. » et « Revenir à l'accueil ». Précommande fermée : 404.
- [ ] **D6** `/precommande/questionnaire` répond avec `Cache-Control: private, no-store`, `Referrer-Policy: strict-origin` et `X-Robots-Tag: noindex, nofollow`.
- [ ] **D7** axe sans violation sur : formulaire vide, formulaire en erreur, refus du limiteur, « Merci », « pas encore ouvert » (`pnpm test:a11y`).
- [ ] **D8** Chaque question est un `fieldset` avec `legend` ; chaque case et bouton radio a un `label` et mesure au moins 44 × 44 px ; le champ de la question 1 a un `label`, `maxlength="80"` et un `aria-describedby` vers la mention ; un seul `h1` ; aucun champ `required`.
- [ ] **D9** Erreurs et refus en `role="alert"`, confirmation en `role="status"` ; parcours complet au clavier seul, focus visible à chaque étape.
- [ ] **D10** `pnpm lint` passe (aucune couleur en dur) ; captures de référence à 390 × 844 des cinq états de D7.
- [ ] **D11** La page de prévente reste sans JavaScript client : aucun composant client n'est ajouté à `LandingPrevente`.

### Lecture (C2e)
- [ ] **E1** Sur une base de test remplie par un jeu connu, les fonctions d'agrégat rendent les nombres attendus : visites par semaine et par provenance, cumul, réponses par provenance et par parcours, répartition des questions 2 à 5.
- [ ] **E2** Une destination citée une seule fois n'apparaît pas dans la sortie du workflow ; `Lisbonne` et ` lisbonne ` comptent pour une même destination citée deux fois.
- [ ] **E3** Le workflow n'a ni `checkout` ni action tierce, `permissions: {}`, se limite à `main`, et n'affiche que des lignes au motif figé (nombres et codes) ; test de forme du fichier, sur le modèle des tests de `db-releve.yml`.
- [ ] **E4** `db/README.md` décrit le rôle de lecture, le workflow et la requête de `db/maintenance/` ; `suivi.md` (« Qui remplit ») nomme le workflow.

### Bout en bout (C2f)
- [ ] **F1** En `ci`, avec la base de test : ouvrir `/?src=groupe`, suivre le lien du bas de page, répondre aux questions 1, 2 et 4, envoyer ; la base contient une visite `groupe` et une réponse `groupe`, parcours `visite`.
- [ ] **F2** Même parcours par `?src=interne` : aucune visite, aucune réponse, mêmes écrans.
- [ ] **F3** Sans variable de base : `/`, `/precommande` et `/precommande/merci` répondent comme sur `main` après #1102 (captures inchangées), sans lien vers le questionnaire.
- [ ] **F4** Aucun cookie, aucune entrée de `localStorage` ni de `sessionStorage` après F1.
- [ ] **F5** Aucune dépendance à un stockage ou à une API propres à Vercel n'est ajoutée (`package.json` ; test existant de `vercel.json` inchangé).

---

## Décisions
Détails fonctionnels fixés par le Product Owner (délégation, `docs/CONTEXT.md` ; définitifs à la fusion, décision 0093). À lister dans la prochaine note de version.

- **C2-PO-1** La page de prévente comptée est `/` quand la précommande est ouverte ; les pages `/precommande` ne sont pas des visites.
- **C2-PO-2** Un affichage est un `GET` de la page entière ; `HEAD` et préchargements ne comptent pas.
- **C2-PO-3** Agent utilisateur absent ou vide : non compté, comme un robot déclaré.
- **C2-PO-4** Provenance hors liste : `autre` ; absente ou invalide : `direct`. Liste fermée, celle de `suivi.md`.
- **C2-PO-5** Le compteur garde un nombre par jour UTC et par provenance, jamais une ligne par visite.
- **C2-PO-6** Une visite non écrite est perdue : ni file d'attente ni nouvelle tentative.
- **C2-PO-7** Adresse du questionnaire : `/precommande/questionnaire` ; parcours par `?apres=paiement`.
- **C2-PO-8** Les liens vers le questionnaire ne s'affichent que si le stockage est disponible.
- **C2-PO-9** Question 1 : 80 caractères au plus.
- **C2-PO-10** Une réponse entièrement vide est refusée et ne compte pas.
- **C2-PO-11** `src=interne` : parcours identique, rien n'est stocké (ni visite, ni réponse).
- **C2-PO-12** Une réponse garde le jour, pas l'heure.
- **C2-PO-13** Lecture par workflow GitHub lancé à la main, plutôt que par une page interne (forme technique : T5).
- **C2-PO-14** Le texte libre de la question 1 n'est jamais affiché brut dans une sortie publique ; seuil de 2 citations (S3).

Ne sont **pas** décidés ici, parce que réservés à Samuel : la définition d'une visite (Q-C1-7 ; C2 code la proposition de `suivi.md`), le rattachement des réponses au paiement (Q-C1-8 ; C2 code l'anonymat), la base de production, les durées de conservation, l'information donnée à la personne.

## Hors périmètre
- Ouvrir une base en production, lever la garde de `db/connection.ts`, poser une variable ou un secret (§ 6.3).
- Activer `PREVENTE=1` ; mentions du vendeur ; lien Stripe.
- Compter les préventes, les remboursements, le « hors cercle proche » (Stripe, Samuel).
- Rattacher une réponse à un paiement ou à une personne.
- Événements `paywall_viewed`, `payment_started`, `payment_succeeded` (`docs/handovers/frontend.md` § 12) et compte des clics sur « Précommander » : utiles pour lire l'entonnoir, à proposer dans une tâche suivante.
- Tableau de bord, graphiques, export ; report automatique dans `suivi.md`.
- Purge des réponses (attend la durée de conservation).
- Modifier les questions de `questionnaire.md`.

## Questions ouvertes

### À Samuel (réservées ; à reporter dans `QUESTIONS.md` par le CEO)
1. **Base en production.** Ouvres-tu une base pour la production (Neon, région UE), distincte de celle des préversions, pour ces deux tables et le limiteur ? Recommandation : oui, une branche ou une base à part, avec un rôle à moindre privilège. Le coût éventuel n'est pas vérifié dans le dépôt. **Bloque** : la lecture des seuils 300 et 10 en production (pas le code, qui fusionne éteint).
2. **Poses de Samuel pour la lecture.** Environnement GitHub `prevente-releve`, rôle de lecture, secrets, et libellé `owner-approved` sur la PR du workflow (0035). **Bloque** : C2e en fonctionnement réel.
3. **Durée de conservation des réponses** et texte d'information sur les données du questionnaire (avec Q27 et Q127). Recommandation : supprimer les réponses à la clôture de G0, après report des agrégats dans `suivi.md`. **Bloque** : l'ouverture du questionnaire à d'autres personnes que Samuel et le studio.
4. **Q-C1-7 et Q-C1-8 (Q362), toujours ouvertes** : C2 code la définition d'une visite proposée par `suivi.md` et des réponses anonymes. Une autre réponse demande une tâche d'alignement. **Bloque** : rien pour le code ; le sens du seuil de 300.
5. **Lien de retour Stripe.** L'adresse de retour du lien de paiement doit être `/precommande/merci` **sans** `{CHECKOUT_SESSION_ID}` (la page n'en lit rien, mais l'identifiant resterait dans l'historique et les journaux d'accès). **Bloque** : rien ; à faire à la création du lien (0168, conditions d'activation).

### Au Tech Lead
- **T1** Forme des tables, rôle d'écriture (rôle applicatif existant ou rôle dédié `vadrouille_prevente`), tables hors organisation et hors RLS par organisation. **Bloque** : C2a.
- **T2** Source de la liste des robots (liste maison ou bibliothèque embarquée), sans appel réseau. **Bloque** : C2b.
- **T3** Où compter pour qu'un affichage soit compté une fois et que le rendu n'attende pas (rendu de la page, `after`, proxy) ; reconnaissance des requêtes du routeur ; effet de la décision 0161 (préchargement). **Bloque** : C2b.
- **T4** Forme de « mesure disponible » et de l'adaptateur (mémoire, Postgres), nom des variables (0036). **Bloque** : C2b.
- **T5** Lecture par workflow (proposée) ou autre forme. **Bloque** : C2e.
- **T6** Ouverture de la garde de production pour ces seules tables, le moment venu (§ 6.3 point 3). **Bloque** : la production, pas C2.

### À la Sécurité
- **S1** Droits des rôles sur les deux tables ; absence de RLS par organisation. **Bloque** : C2a.
- **S2** Seuils : 5 envois par heure et par adresse, 200 réponses par jour. Faut-il un champ piège ou un contrôle d'origine en plus ? **Bloque** : C2c.
- **S3** Sortie publique du workflow : nombres et codes seulement, seuil de 2 pour les destinations. **Bloque** : C2e.
- **S4** Gonflement du compteur par des requêtes fabriquées (aucune parade sans identifiant) : risque accepté, ou plafond par jour ? **Bloque** : rien ; la confiance dans le seuil de 300.
- **S5** Avis nécessaire avant une base en production (§ 6.3 point 2). **Bloque** : la production.

### À l'UX/UI
- **U1** Textes nouveaux du § 3.5 ; place et forme du lien discret sur la page de prévente (fond sombre du pied de page). **Bloque** : C2d.
- **U2** Choix unique facultatif : un bouton radio natif ne se décoche pas. Laisser tel quel, ou ajouter un moyen d'effacer son choix ? **Bloque** : C2d.
- **U3** Rendu de l'écran (colonne étroite, composants Ligne) et de ses états. **Bloque** : C2d.

### Au rôle `commercial` et au CEO
- **C1** La page « Merci » ne connaît pas la provenance (l'adresse de retour de Stripe est fixe) : les réponses du parcours `precommande` sont rangées sous `direct`, et un achat de test fait par `src=interne` ne peut pas être exclu à cet endroit. Consigne proposée : pendant un test, ne pas envoyer le questionnaire depuis « Merci », ou ouvrir `/precommande/questionnaire?apres=paiement&src=interne`. **Bloque** : rien ; à écrire dans `suivi.md`.
- **C2** `suivi.md` n'a pas de ligne `autre` dans « Provenance » : C2b l'ajoute, avec les limites du § 2.3. **Bloque** : rien.
- **C3** La décision 0168 n'est pas sur `main` à la rédaction ; cette spécification en dépend. Si #1102 n'est pas fusionnée, C2 n'a pas de page à mesurer. **Bloque** : toutes les tâches de code.
