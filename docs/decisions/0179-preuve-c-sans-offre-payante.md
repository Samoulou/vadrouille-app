# 0179 — Relevé de la route de flux : une seconde forme de la preuve (c), lue dans les en-têtes de la plateforme contre des témoins, sans offre payante (amendement de 0069 point 3 et de la procédure E2 de 0164)

Statut : **décidée par le Tech Lead le 2026-11-16** (décision déléguée : outillage et tests, « Qui décide quoi » de `docs/CONTEXT.md`), en réponse à la « proposition facultative au Tech Lead » de 0164. **Sa PR ne se fusionne pas sans l'avis favorable de la Sécurité, consigné sur cette PR** (décideur de 0069 et autrice de 0164 ; chemin sensible). Une fois fusionnée, elle est définitive sans délai de veto (décision 0093). Aucune dépense, aucun compte, aucune clé, aucun jeton, aucun réglage Vercel, aucune donnée personnelle, aucun code d'application.

Date : 2026-11-16 · Décideur et rédacteur : Tech Lead · Ticket : #1146 · `main` relu : `3be7f31` · Amende 0069 (point 3, élément (c) ; point 2, témoins ; point 5, consignation) et 0164 (condition E2, point 2 ; § 4, premier point) · Décisions liées : 0063 point 8, 0093, 0161 · Questions liées : Q836, Q844, Q870 · Numérotation : `main` va jusqu'à 0178 ; aucune branche `claude/…` ouverte n'ajoute 0179.

## 1. Constat

Relevé E2 de la Sécurité, le 2026-11-16 vers 16:56 UTC, sur le déploiement `dpl_DSZQhoTmfTc1uTCW7Ns4SwYsrhgi` (branche `p0-reel`, commit `a84f041`, région de fonction `fra1`), sans cookie :

- les cinq requêtes vers `/.well-known/workflow/v1/flow` (les quatre sondes de 0069 point 3 et le témoin « `POST x-vqs-*` sans cookie » du point 2) rendent **404** ;
- preuve (a) réunie : `x-matched-path: /404` sur les cinq ;
- preuve (b) réunie : la sortie du build liste `ƒ /.well-known/workflow/v1/flow` ;
- preuve (c) **impossible à lire** : `create_observability_query` répond 402 « Observability Plus is required ». C'est une offre payante.

**Offre payante : état des sources.** « Pas de Vercel payant avant le lancement public » a été dit par Samuel dans la discussion du projet le 2026-11-09 ; c'est à reporter dans `QUESTIONS.md` par la PR de statut. Aucune décision du dépôt ne le porte. Le dépôt n'en garde que Q836 (« Je vais pas payer Vercel pour l'instant », ouverte).

Selon 0069 point 3 et 0164 (E2, point 2), un 404 dont un élément de preuve manque n'est pas prouvé : le relevé s'arrête, et rien n'est saisi ni lancé.

**La règle ne change pas** : un 404 n'est conforme que s'il est prouvé qu'aucune fonction n'a été invoquée par la requête. Cette décision ne change que **le moyen** de le prouver.

## 2. Pistes évaluées

| Piste | Verdict | Raison |
|---|---|---|
| Ligne de journal à l'entrée de la route de flux | **Écartée** | La route est un fichier de build généré par `withWorkflow` (`next.config.ts`) : `route.js` exporte `workflowEntrypoint(...)` de `workflow/runtime`. Aucun code du dépôt ne tourne à l'entrée du gestionnaire. Les modules de `src/workflows/` y sont importés, mais une ligne au niveau du module ne s'écrit qu'au premier chargement d'une instance, pas à chaque requête. Envelopper ou réécrire le fichier généré reviendrait à modifier la sortie du SDK sur le chemin le plus sensible. |
| Ligne de journal à l'entrée de la garde d'étape (`verifierGardeEtape`) | **Écartée** | La garde n'est atteinte qu'après le gestionnaire du SDK (0069 point 4 : « pas pour ce que fait le gestionnaire du SDK avant d'atteindre une étape »). Une requête forgée refusée par le SDK n'écrirait rien, alors que la fonction aurait tourné. L'absence de ligne prouverait moins que (c). |
| Journal d'exécution tel quel (`get_runtime_logs`) | **Écartée** (inchangé depuis 0069) | Il ne contient que ce que l'application écrit. Relu le 2026-11-16 à 17:03 UTC : aucune ligne pour les témoins de 16:56, pourtant servis par une fonction. Vide ne veut donc rien dire. |
| Trace de la plateforme par identifiant de requête (`get_project_trace`) | **Sans objet** | « Trace not found » pour un témoin comme pour une sonde (17:04 UTC). |
| Session de trace (`create_trace_session`) | **Écartée** | Elle crée un jeton (0069 point 1 : aucun jeton créé), et la requête ne serait plus celle d'un appelant quelconque. Non essayée. |
| En-têtes posés par la plateforme, lus contre des témoins du même relevé | **Retenue** (§ 3) | Voir § 4. |
| Décompte lu par Samuel dans le tableau de bord gratuit | **Facultatif, non exigé** | Aucun agent ne lit le tableau de bord, et je n'ai pas vérifié que l'offre gratuite y affiche le décompte par route. Voir § 3 point 5. |

## 3. Décision

1. **La preuve (c) de 0069 point 3 admet deux formes ; (a) et (b) restent exigées.**
   - **(c-compte)** : le décompte des invocations, tel que 0069 le décrit, sans changement. Il vaut pour tout relevé, avec ou sans cookie.
   - **(c-en-têtes)** : la forme des points 2 à 4 ci-dessous. Elle ne demande aucune offre payante et aucune lecture après coup.
   - **Domaine de (c-en-têtes)** : seulement un relevé **sans cookie**, sur un déploiement **sans protection de déploiement** (le cas E2 de 0164). Pour un relevé fait avec le cookie d'un lien de partage, sur un déploiement protégé, 0069 reste tel quel : seule (c-compte) vaut.
   - **Dans ce domaine, l'une ou l'autre forme suffit.** Mais un décompte lisible qui montre une invocation sur la route de flux rend le relevé **non conforme**, même si (c-en-têtes) est réunie (point 5).

2. **Témoins du relevé sans cookie.** Ceux de 0069 point 2 sont joués **sans cookie** (il n'y en a pas : la protection est désactivée, 0164), et ceux-ci s'y ajoutent. Même relevé, même hôte, même session, aucune redirection suivie. `<aléa>` : 16 chiffres hexadécimaux, tirés de nouveau à chaque relevé.

   | Témoin | Requête | Attendu | Sinon |
   |---|---|---|---|
   | **404 de la plateforme** (chemin absent de tout build) | `GET /temoin-introuvable-<aléa>`, puis `POST` sur le même chemin | 404 ; `x-matched-path: /404` ; `x-vercel-id` à **deux** segments ; même `etag` (noté E) et même corps (SHA-256 noté C) pour les deux | relevé nul |
   | **404 de l'application** (rendu par une fonction) | `GET /p/<aléa>` | 404 ; `x-matched-path: /p/[token]` ; `x-vercel-id` à **trois** segments ; `etag` absent ou différent de E ; SHA-256 du corps différent de C | relevé nul : la forme (c-en-têtes) n'est pas utilisable |

   Les témoins `GET /prototype/executions` (avant et après) et `POST /prototype/executions` de 0069 restent. Ils sont servis par une fonction : leur `x-vercel-id` doit avoir **trois** segments. Sinon, relevé nul.

   Aucun de ces témoins ne soumet d'action, ne porte de code, ni n'appelle un fournisseur payant (vue partagée : 0164 § 1.2). `<aléa>` ne peut pas être un jeton de partage : 16 caractères, quand `SHARE_TOKEN_PATTERN` en exige 43 (`src/contracts/values.ts`).

3. **Lecture de `x-vercel-id`.** On découpe la valeur sur `::` (deux deux-points). Le premier segment peut lister plusieurs régions traversées, séparées par un seul `:` ; il compte pour un segment.
   - **Exactement deux** segments : région(s) traversée(s), identifiant de requête. **Aucune région de fonction.**
   - **Exactement trois** segments : région(s) traversée(s), **région de la fonction**, identifiant de requête.
   - Tout autre nombre de segments, pour une requête vers la route de flux, fait échouer (c1). Ce peut être un refus à tort ; c'est voulu.
   - Seul le segment du milieu d'un témoin servi par une fonction est comparé aux régions du déploiement relevé (`regions` de `get_deployment` ; aujourd'hui `fra1`). S'il n'en fait pas partie, relevé nul : le format a changé, et cette forme ne prouve plus rien.

4. **Critère (c-en-têtes).** Une requête vers la route de flux qui rend 404 satisfait (c) si elle réunit **tous** ces éléments :
   - (c1) `x-vercel-id` est présent et a **exactement deux** segments ;
   - (c2) son `etag` est E et le SHA-256 de son corps est C, ceux du témoin « 404 de la plateforme » **du même relevé** ;
   - (c3) les témoins du point 2 sont tous conformes, dans le même relevé ;
   - (c4) la sortie du build du déploiement relevé liste `/_not-found` en statique (`○`), en plus de la route de flux exigée par (b). Cet élément recoupe (c2) ; il est gardé parce qu'il se lit ailleurs que dans la réponse ;
   - (c5) rien, dans le dépôt au commit relevé, ne fait tourner du code ni ne réécrit le chemin avant le routage de `/.well-known/` :
     - un seul fichier de proxy ou de middleware existe (`src/proxy.ts`), et son `matcher` ne couvre pas `/.well-known/` (aujourd'hui : `/p/:path*` seul) ;
     - `vercel.json` n'a ni `rewrites`, ni `redirects`, ni `routes` (aujourd'hui : `regions` et `ignoreCommand` seuls) ;
     - `next.config.ts` n'a ni `rewrites` ni `redirects` (condition de maintien de 0161, `next.config.ts` l. 94) ;
   - (c6) les cinq requêtes vers la route de flux ont le même résultat : même code, même `x-matched-path`, même nombre de segments, même `etag`, même corps.

   Un seul élément manquant, pour une seule requête : le 404 n'est pas prouvé, et le relevé s'arrête comme en 0069 point 3 (« toute autre réponse »). `x-vercel-cache` est consigné, sans être un critère.

5. **Toute observation contraire l'emporte.** Une invocation vue sur la route de flux pendant la fenêtre du relevé, par quelque moyen que ce soit (décompte lisible, tableau de bord, journal), rend le relevé non conforme, même si (c-en-têtes) est réunie. Samuel peut regarder le tableau de bord Vercel ; ce n'est pas exigé.

6. **Consignation** (complète 0069 point 5). Pour chaque requête, témoins compris : date et heure UTC, code, `x-matched-path`, nombre de segments de `x-vercel-id` et segments de région (jamais l'identifiant de requête), `x-vercel-cache`, égalité de l'`etag` avec E et du SHA-256 du corps avec C (oui ou non). Plus : les régions du déploiement, la ligne `/_not-found` du build, les trois lectures de (c5), et la forme de (c) utilisée. Ni corps, ni lien, ni cookie. E et C sont propres au déploiement et au relevé : ils ne se reprennent jamais d'un relevé à l'autre.

7. **Procédure E2 de 0164.** Le troisième point de son étape 2 (« Le décompte des invocations (preuve c) se lit dans la fenêtre… ») devient : la preuve (c) est réunie sous l'une des deux formes du point 1. Avec (c-en-têtes), il n'y a rien à lire après coup : la rétention d'une heure du journal (0164 § 4, premier point) ne borne plus cette preuve. Le reste de la procédure est inchangé : relevé fait par la Sécurité, garde ouverte, avant toute saisie du code et tout lancement, sans exécution `en_cours` ; relevé non conforme : rien n'est lancé.

8. **Ce qui n'est pas décidé ici.** Le relevé « garde fermée », autre volet de la proposition de 0164, n'est pas ouvert. Le moment et la portée des relevés (0069 point 4), les sondes, leur ordre et leur corps ne changent pas. Les questions Q844 et Q870 restent à Samuel (§ 7).

## 4. Pourquoi cette forme prouve autant

Mesures du 2026-11-16 sur le déploiement relevé, sans cookie (16:56 UTC : relevé de la Sécurité ; 17:05 UTC : contrôle du Tech Lead) :

| Requête | Code | `x-matched-path` | `x-vercel-id` | `etag` et corps |
|---|---|---|---|---|
| `GET` et `POST /prototype/executions` (fonction) | 200 | `/prototype/executions` | `iad1::fra1::…` (trois segments) | pas d'`etag` |
| `GET /connexion` (404 rendu par une fonction) | 404 | `/connexion` | `iad1::fra1::…` | pas d'`etag`, corps différent de C |
| `GET /p/<aléa>` (404 rendu par une fonction) | 404 | `/p/[token]` | `iad1::fra1::…` | pas d'`etag`, corps différent de C |
| `GET` et `POST /temoin-introuvable-<aléa>`, `POST /.well-known/workflow/v1/temoin-<aléa>` (404 de la plateforme) | 404 | `/404` | `iad1::…` (deux segments) | E, C |
| Les cinq requêtes vers la route de flux | 404 | `/404` | `iad1::…` (deux segments) | E, C |

Les huit corps (cinq requêtes de flux, trois 404 de la plateforme) ont le même SHA-256. E est le MD5 de ce corps. Sortie du build de ce déploiement (`bld_4h80xn33t`, lue à 17:06 UTC avec `list_deployment_events`) : `○ /_not-found`, `ƒ /.well-known/workflow/v1/flow`, `ƒ Proxy (Middleware)`.

- **La plateforme dit elle-même où la fonction a tourné.** Sa documentation décrit `x-vercel-id` comme la liste des régions traversées et la région où la fonction s'est exécutée (<https://vercel.com/docs/headers/request-headers>). L'en-tête est posé par la plateforme, pas par l'application.
- **Cette lecture n'est pas supposée, elle est vérifiée à chaque relevé.** Les témoins servis par une fonction portent la région du déploiement, y compris quand la fonction rend un 404. Si ce n'était plus vrai, le relevé serait nul (point 3), pas conforme.
- **La réponse est le fichier statique du déploiement.** Même `etag` et même corps qu'un chemin qui n'existe dans aucun build. Un 404 rendu par une fonction n'a ni cet `etag` ni ce corps (témoin « 404 de l'application »).
- **La preuve porte sur chaque requête.** Le décompte est un agrégat sur une fenêtre, lu après un délai de propagation ; (c-en-têtes) attribue le résultat à chacune des requêtes, dans sa propre réponse.
- **(c-compte) et (c-en-têtes) reposent sur la même source** : ce que la plateforme déclare. Aucune des deux ne dépend du code de l'application.

## 5. Limites

- **Cause du 404 inconnue : constaté, non expliqué.** Le build liste la route de flux comme une fonction (`ƒ`), et pourtant la plateforme répond par son fichier 404 statique. L'explication probable est la protection des fonctions déclenchées par une file (0063 point 8, « Consumer function security »), mais je ne l'ai pas vérifiée. La preuve est donc **empirique, pas mécanistique** : elle dit ce que la plateforme a fait de ces requêtes, pas pourquoi. Elle ne vaut que tant que ce comportement se constate : une requête de flux qui répond autrement, ou des requêtes de flux qui ne répondent pas toutes de la même façon (c6), et le 404 n'est pas prouvé ; un témoin qui répond autrement, et le relevé est nul.
- **Risque résiduel propre à cette forme.** Elle serait fausse si la plateforme invoquait une fonction, cachait sa région dans `x-vercel-id`, jetait sa réponse et servait le fichier statique à la place. Je ne connais aucun mécanisme documenté qui le fasse, mais je ne peux pas l'exclure par une mesure indépendante de la réponse. Le décompte, lui, a le risque symétrique : une invocation que la télémétrie ne compterait pas.
- **Coût d'une fausse conformité : borné.** Si la route était en fait joignable, une requête forgée devrait encore passer la garde du mode réel et viser une exécution réservée `en_cours`, que seule une entrée protégée par le code d'accès réserve (0164 § 1.2). La dépense resterait bornée par le forfait de l'exécution et par le fusible de 2 USD par voyage (0093).
- **Format non contractuel.** Le découpage de `x-vercel-id` est décrit par la documentation, pas garanti. Les témoins le revérifient à chaque relevé ; un format changé donne un relevé nul, donc un blocage, jamais un faux conforme.
- **Portée.** La preuve vaut pour ces requêtes, sur ce déploiement, à ce moment. Elle se refait dans les cas de 0069 point 4.
- **File.** Elle ne dit rien de l'invocation par la file (0069, « Joignabilité de la route par la file ») : inchangé.
- **Témoin « 404 de l'application » : fragile.** Il invoque une fonction du site d'essai, sans coût et sans lecture de données. Si le format du jeton, la route `/p/[token]` ou le `matcher` du proxy changeaient, ou si `/p/` devenait limité en débit sur le site d'essai (0164, E4), il ne rendrait plus l'attendu : le relevé serait nul, et un témoin équivalent serait à choisir par une nouvelle décision.

## 6. Conséquences

- **Le relevé du 2026-11-16 à 16:56 UTC n'est pas déclaré conforme par cette décision.** Ses cinq requêtes satisfont (c1), et (c2) contre le contrôle de 17:05 UTC, mais les témoins du point 2 n'étaient pas dans le même relevé, et ce contrôle n'est pas celui de la Sécurité. La Sécurité refait le relevé complet (une douzaine de requêtes, nouvel `<aléa>`, E et C relevés de nouveau) après la fusion. Tant qu'il n'est pas conforme : ni saisie du code, ni lancement.
- **Aucun code d'application n'est nécessaire.** Le relevé reste fait à la main, comme en 0069 point 1.
- **Outillage de suite, non bloquant** (ticket #1147, à ordonner par le CEO) : un script versionné du relevé, qui calcule le critère du point 4, et l'alignement du bloc « préversion » de `tests/e2e/p0-flux.e2e.spec.ts` (0069 point 6 ; 0164, E2). Un bloc au vert ne vaut toujours pas relevé sans la consignation de la Sécurité.
- 0069 et 0164 portent en tête la mention « Amendée par 0179 », et la « proposition facultative » de 0164 une note « traitée en partie » ; le reste de leur texte n'est pas réécrit.
- Note de version suivante : lister 0179.

## 7. Questions de Samuel que cette décision touche

Cette décision ne répond à aucune d'elles à sa place.

- **Q844 (0164, S5), ouverte.** La procédure E2 est **proposée**, pas acceptée. 0179 en change une ligne : au temps 2, la preuve (c) peut être réunie sous la forme (c-en-têtes). Si Samuel répond oui à Q844, c'est à la procédure ainsi amendée ; le libellé de Q844 est à mettre à jour par le CEO. Tant que Q844 est ouverte, elle bloque la première saisie du code, relevé conforme ou non.
- **Q870, ouverte** (« Utiliser le site d'essai malgré une preuve de sécurité impossible en gratuit ? »). Sa prémisse tombe si 0179 est fusionnée et si le relevé refait est conforme : la preuve devient possible en gratuit, et la question n'a plus d'objet. D'ici là, elle reste ouverte telle quelle. Si le relevé refait n'est pas conforme, Q870 ne s'applique pas non plus : un relevé non conforme ferme (0164, E2 point 4).
- **Q836, ouverte.** Inchangée : 0179 ne demande aucune offre payante.
- **Question nouvelle, à Samuel.** Préfères-tu t'en tenir au décompte (0069 tel quel) ? Il faut alors soit que tu le lises toi-même dans le tableau de bord, soit une offre payante. Bloque : rien ; 0179 peut être remise en cause à tout moment (0093).
