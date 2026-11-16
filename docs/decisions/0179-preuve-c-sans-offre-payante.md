# 0179 — Relevé de la route de flux : une seconde forme de la preuve (c), lue dans les en-têtes de la plateforme contre des témoins, sans offre payante (amendement de 0069 point 3 et de la procédure E2 de 0164)

Statut : **décidée par le Tech Lead le 2026-11-16** (décision déléguée : outillage et tests, « Qui décide quoi » de `docs/CONTEXT.md`), en réponse à la « proposition facultative au Tech Lead » de 0164. **Définitive dès la fusion de sa PR, sans délai de veto** (décision 0093). **Avis de la Sécurité demandé à la revue de cette PR** (décideur de 0069 et autrice de 0164 ; chemin sensible) : la forme décrite ici ne s'applique à un relevé qu'une fois cet avis rendu favorable et consigné sur la PR. Aucune dépense, aucun compte, aucune clé, aucun jeton, aucun réglage Vercel, aucune donnée personnelle, aucun code d'application.

Date : 2026-11-16 · Décideur et rédacteur : Tech Lead · Ticket : #1146 · `main` relu : `3be7f31` · Amende 0069 (point 3, élément (c) ; point 2, témoins ; point 5, consignation) et 0164 (condition E2, point 2 ; § 4, premier point) · Décisions liées : 0002, 0063 point 8, 0093, 0163 · Numérotation : `main` va jusqu'à 0178 ; aucune branche `claude/…` ouverte n'ajoute 0179.

## 1. Constat

Relevé E2 de la Sécurité, le 2026-11-16 vers 16:56 UTC, sur le déploiement `dpl_DSZQhoTmfTc1uTCW7Ns4SwYsrhgi` (branche `p0-reel`, commit `a84f041`, région de fonction `fra1`), sans cookie :

- les cinq requêtes vers `/.well-known/workflow/v1/flow` (les quatre sondes de 0069 point 3 et le témoin « `POST x-vqs-*` sans cookie » du point 2) rendent **404** ;
- preuve (a) réunie : `x-matched-path: /404` sur les cinq ;
- preuve (b) réunie : la sortie du build liste `ƒ /.well-known/workflow/v1/flow` ;
- preuve (c) **impossible à lire** : `create_observability_query` répond 402 « Observability Plus is required ». C'est une offre payante. Samuel a décidé qu'il n'y aurait pas de Vercel payant avant le lancement public.

Selon 0069 point 3 et 0164 (E2, point 2), un 404 dont un élément de preuve manque n'est pas prouvé : Samuel ne peut ni saisir son code ni lancer un essai.

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

1. **La preuve (c) de 0069 point 3 admet deux formes. L'une ou l'autre suffit ; (a) et (b) restent exigées.**
   - **(c-compte)** : le décompte des invocations, tel que 0069 le décrit, sans changement. Il reste valable chaque fois qu'il est lisible.
   - **(c-en-têtes)** : la forme des points 2 à 4 ci-dessous. Elle ne demande aucune offre payante et aucune lecture après coup.

2. **Témoins ajoutés à ceux de 0069 point 2.** Même relevé, même hôte, même session, sans cookie, aucune redirection suivie. `<aléa>` : 16 chiffres hexadécimaux tirés pour le relevé.

   | Témoin | Requête | Attendu | Sinon |
   |---|---|---|---|
   | **404 de l'application** (rendu par une fonction) | `GET /p/<aléa>` | 404 ; `x-matched-path: /p/[token]` ; `x-vercel-id` à **trois** segments | relevé nul : la forme (c-en-têtes) n'est pas utilisable |
   | **404 de la plateforme** (chemin absent de tout build) | `GET /temoin-introuvable-<aléa>`, puis `POST` sur le même chemin | 404 ; `x-matched-path: /404` ; `x-vercel-id` à **deux** segments ; même `etag` et même corps pour les deux | relevé nul |

   Les témoins `GET /prototype/executions` (avant et après) et `POST /prototype/executions` de 0069 restent. Ils sont servis par une fonction : leur `x-vercel-id` doit avoir **trois** segments. Sinon, relevé nul.

   Aucun de ces témoins ne soumet d'action, ne porte de code, ni n'appelle un fournisseur payant (vue partagée : 0164 § 1.2).

3. **Lecture de `x-vercel-id`.** On découpe la valeur sur `::`.
   - Deux segments : régions traversées, identifiant de requête. **Aucune région de fonction.**
   - Trois segments : régions traversées, **région de la fonction**, identifiant de requête.
   - Pour tout témoin servi par une fonction, le segment du milieu doit être une des régions du déploiement relevé (`regions` de `get_deployment`). Sinon, relevé nul : le format a changé, et cette forme ne prouve plus rien.

4. **Critère (c-en-têtes).** Une requête vers la route de flux qui rend 404 satisfait (c) si elle réunit **tous** ces éléments :
   - (c1) `x-vercel-id` est présent et a **exactement deux** segments ;
   - (c2) son `etag` est celui du témoin « 404 de la plateforme », et son corps est le même à l'octet près (même SHA-256) ;
   - (c3) les témoins du point 2 sont tous conformes, dans le même relevé ;
   - (c4) la sortie du build du déploiement relevé liste `/_not-found` en statique (`○`), en plus de la route de flux exigée par (b) ;
   - (c5) le `matcher` de `src/proxy.ts`, au commit relevé, ne couvre pas `/.well-known/` (aujourd'hui : `/p/:path*` seul). Sinon le proxy, qui est une fonction, tournerait avant le routage.

   Un seul élément manquant, pour une seule requête : le 404 n'est pas prouvé, et le relevé s'arrête comme en 0069 point 3 (« toute autre réponse »). `x-vercel-cache` est consigné, sans être un critère.

5. **Lecture facultative du tableau de bord.** Samuel peut regarder, dans le tableau de bord Vercel, si une invocation est comptée sur la route de flux pendant la fenêtre du relevé. Ce n'est pas exigé. En revanche, **toute observation contraire l'emporte** : une invocation vue sur la route de flux, par quelque moyen que ce soit, rend le relevé non conforme, même si (c-en-têtes) est réunie.

6. **Consignation** (complète 0069 point 5). Pour chaque requête, témoins compris : code, `x-matched-path`, nombre de segments de `x-vercel-id` et segments de région (jamais l'identifiant de requête), `x-vercel-cache`, égalité de l'`etag` et du SHA-256 du corps avec le témoin « 404 de la plateforme » (oui ou non). Plus : les régions du déploiement, la ligne `/_not-found` du build, le `matcher` lu, et la forme de (c) utilisée. Ni corps, ni lien, ni cookie.

7. **Procédure E2 de 0164.** Le troisième point de son étape 2 (« Le décompte des invocations (preuve c) se lit dans la fenêtre… ») devient : la preuve (c) est réunie sous l'une des deux formes du point 1. Avec (c-en-têtes), il n'y a rien à lire après coup : la rétention d'une heure du journal (0164 § 4, premier point) ne borne plus cette preuve. Le reste de la procédure est inchangé : relevé fait par la Sécurité, garde ouverte, avant toute saisie du code et tout lancement, sans exécution `en_cours` ; relevé non conforme : rien n'est lancé.

8. **Ce qui n'est pas décidé ici.** Le relevé « garde fermée », autre volet de la proposition de 0164, n'est pas ouvert. Le moment et la portée des relevés (0069 point 4), les sondes, leur ordre et leur corps ne changent pas.

## 4. Pourquoi cette forme prouve autant

Mesures du 2026-11-16 sur le déploiement relevé, sans cookie (16:56 UTC : relevé de la Sécurité ; 17:05 UTC : contrôle du Tech Lead) :

| Requête | Code | `x-matched-path` | `x-vercel-id` | `etag` et corps |
|---|---|---|---|---|
| `GET` et `POST /prototype/executions` (fonction) | 200 | `/prototype/executions` | `iad1::fra1::…` (trois segments) | pas d'`etag` |
| `GET /connexion` (404 rendu par une fonction) | 404 | `/connexion` | `iad1::fra1::…` | pas d'`etag` |
| `GET /p/<aléa>` (404 rendu par une fonction) | 404 | `/p/[token]` | `iad1::fra1::…` | pas d'`etag` |
| `GET` et `POST /temoin-introuvable-<aléa>` (404 de la plateforme) | 404 | `/404` | `iad1::…` (deux segments) | `etag` E, corps C |
| Les cinq requêtes vers la route de flux | 404 | `/404` | `iad1::…` (deux segments) | `etag` E, corps C |

Les huit corps (cinq requêtes de flux, trois 404 de la plateforme) ont le même SHA-256. L'`etag` est le MD5 de ce corps.

- **La plateforme dit elle-même où la fonction a tourné.** Sa documentation décrit `x-vercel-id` comme la liste des régions traversées et la région où la fonction s'est exécutée (<https://vercel.com/docs/headers/request-headers>). L'en-tête est posé par la plateforme, pas par l'application.
- **Cette lecture n'est pas supposée, elle est vérifiée à chaque relevé.** Les témoins servis par une fonction portent la région du déploiement, y compris quand la fonction rend un 404. Si ce n'était plus vrai, le relevé serait nul (point 3), pas conforme.
- **La réponse est le fichier statique du déploiement.** Même `etag` et même corps qu'un chemin qui n'existe dans aucun build. Un 404 rendu par une fonction n'a ni cet `etag` ni ce corps (témoin « 404 de l'application »).
- **La preuve porte sur chaque requête.** Le décompte est un agrégat sur une fenêtre, lu après un délai de propagation ; (c-en-têtes) attribue le résultat à chacune des requêtes, dans sa propre réponse.
- **(c-compte) et (c-en-têtes) reposent sur la même source** : ce que la plateforme déclare. Aucune des deux ne dépend du code de l'application.

## 5. Limites

- **Risque résiduel propre à cette forme.** Elle serait fausse si la plateforme invoquait une fonction, cachait sa région dans `x-vercel-id`, jetait sa réponse et servait le fichier statique à la place. Je ne connais aucun mécanisme documenté qui le fasse, mais je ne peux pas l'exclure par une mesure indépendante de la réponse. Le décompte, lui, a le risque symétrique : une invocation que la télémétrie ne compterait pas. C'est sur ce point que l'avis de la Sécurité est demandé.
- **Format non contractuel.** Le découpage de `x-vercel-id` est décrit par la documentation, pas garanti. Les témoins le revérifient à chaque relevé ; un format changé donne un relevé nul, donc un blocage, jamais un faux conforme.
- **Portée.** La preuve vaut pour ces requêtes, sur ce déploiement, à ce moment. Elle se refait dans les cas de 0069 point 4.
- **File.** Elle ne dit rien de l'invocation par la file (0069, « Joignabilité de la route par la file ») : inchangé.
- **Témoin « 404 de l'application ».** Il invoque une fonction du site d'essai, sans coût et sans lecture de données. S'il devenait limité en débit sur le site d'essai (0164, E4), un témoin équivalent serait à choisir par une nouvelle décision.

## 6. Conséquences

- **Le relevé du 2026-11-16 à 16:56 UTC n'est pas déclaré conforme par cette décision.** Ses cinq requêtes satisfont (c1), et (c2) contre le contrôle de 17:05 UTC, mais les témoins du point 2 n'étaient pas dans le même relevé, et ce contrôle n'est pas celui de la Sécurité. La Sécurité refait le relevé complet (une douzaine de requêtes) après la fusion et son avis favorable. Tant qu'il n'est pas conforme : ni saisie du code, ni lancement.
- **Aucun code d'application n'est nécessaire.** Le relevé reste fait à la main, comme en 0069 point 1.
- **Outillage de suite, non bloquant** (ticket #1147, à ordonner par le CEO) : un script versionné du relevé, qui calcule le critère du point 4, et l'alignement du bloc « préversion » de `tests/e2e/p0-flux.e2e.spec.ts` (0069 point 6 ; 0164, E2). Un bloc au vert ne vaut toujours pas relevé sans la consignation de la Sécurité.
- 0069 et 0164 portent en tête la mention « Amendée par 0179 » ; leur texte n'est pas réécrit.
- Note de version suivante : lister 0179.

## 7. Question nouvelle

- **Samuel** — Tu as accepté la procédure E2 « selon 0069 tel quel » (0164, S5). Cette décision en change un moyen de preuve, pas l'exigence. Elle est déléguée et définitive à sa fusion (0093) ; tu peux la remettre en cause à tout moment. Si tu préfères le décompte, il te faut soit le lire toi-même dans le tableau de bord, soit une offre payante. Bloque : rien.
