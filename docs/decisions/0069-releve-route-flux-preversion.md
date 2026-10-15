# 0069 — Relevé de la route de flux sur la préversion de `p0-reel` : méthode, sondes témoins et critère (401, 403 ou 404 prouvé) (amendement de 0063, point 8)

Statut : décision déléguée (exigence de sécurité : Sécurité, décideur du point 8 de 0063), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel 6 heures après sa fusion (0068). Aucune dépense, aucune clé nouvelle, aucune donnée personnelle. **Compte externe** : le relevé passe par le connecteur Vercel que Samuel a lui-même relié à son compte dans claude.ai ; aucun compte n'est ouvert, aucun jeton n'est créé. Samuel est informé de chaque lien de partage créé ou réutilisé (date d'expiration, jamais le lien) par le commentaire du relevé sur #369. Rien n'est donc réservé à Samuel.

Date : 2026-10-15 · **Décideur : Sécurité** · Rédactrice : Sécurité · Méthode validée par le CEO (consigne de coordination du 2026-10-15, option (iii), reprise dans la description de la PR #384) ; critère élargi sur l'avis du CEO, **soumis à la confirmation du Tech Lead** par la revue de cette PR · Amende 0063, point 8 (méthode et critère), et la phrase « relevé humain » du point 4 de son amendement P0r3c-5 · Numérotation : `main` va jusqu'à 0068 ; aucune PR ouverte n'ajoute 0069.

## Contexte

0063 point 8 fait de l'e2e de la route de flux, joué sur la préversion de `p0-reel`, une **condition du premier lancement réel**. Toute requête directe à `/.well-known/workflow/v1/flow` doit être refusée par la plateforme (401 ou 403), avec et sans en-têtes `x-vqs-*`, et avec un CloudEvent binaire de `@vercel/queue`. Le bloc « préversion » de `tests/e2e/p0-flux.e2e.spec.ts` attend le jeton « Protection Bypass for Automation » (`E2E_P0_REEL_BYPASS`), « non accessible aux agents ». Le relevé revenait donc à Samuel.

Trois constats changent la situation :

1. **Samuel travaille dans le cloud seulement.** Lancer Playwright avec un jeton depuis sa machine n'est pas une voie possible. Les autres voies sont plus lourdes (voir « Alternatives écartées »).
2. **Le critère du bloc versionné peut passer à tort.** Il accepte 401 ou 403 sans vérifier que la protection de déploiement de Vercel a été franchie. Avec un jeton faux, expiré ou ignoré, c'est cette protection qui répond 401, avant toute fonction ; le relevé passerait sans rien prouver sur la protection des files.
3. **Premier relevé, résultat décevant.** Le relevé du 2026-10-15 à 15:11 UTC ([commentaire du 15:16 UTC sur #369](https://github.com/Samoulou/vadrouille-app/pull/369#issuecomment-6195530436)), sur le déploiement `dpl_7verCcN5jRgFFNx3ikbX5ePC2PP3` (commit `d61e9fa`, branche `p0-reel`), a rendu 200 au témoin puis **404** au `POST` sans en-têtes ; il s'est arrêté là. La sortie du build de ce déploiement liste bien la route (`ƒ /.well-known/workflow/v1/flow`, « Compiled workflows (21 steps, 1 workflow) ») : le 404 ne vient donc pas d'un build sans la route (le cas de 0063 point 10). Le critère fermé n'admettait pas ce code ; **c'est ce résultat qui motive l'élargissement du point 3**, pas une exigence moindre.

## Décision

1. **Méthode.** Le relevé de 0063 point 8 est fait par la **Sécurité**, en lecture, depuis le bac à sable de sa session :
   - **Adresse, contrôlée avant tout envoi du cookie** : `https:`, hôte conforme à `HOTE_PREVERSION` du bloc versionné, ni identifiants ni port ; c'est l'hôte du déploiement de `p0-reel` relevé (vérifié avec le connecteur : branche, commit, état `READY`).
   - **Accès** : un lien de partage de ce déploiement, obtenu par le connecteur Vercel (`get_access_to_vercel_url`). La seule redirection admise est la réponse 307 de la visite du lien, **qui n'est pas suivie** : le cookie `_vercel_jwt` est lu dans sa réponse, et la session le garde en mémoire.
   - **Requêtes** : celles du bloc « préversion » de `tests/e2e/p0-flux.e2e.spec.ts`, recopiées (mêmes chemins, mêmes corps, mêmes en-têtes de file), **sauf** l'en-tête `x-vercel-protection-bypass`, remplacé par le cookie. Aucune redirection n'est suivie.
   - **Jeton d'automatisation** : il n'est ni créé ni lu.
   - **Confidentialité, exacte** : le lien et le cookie ne sont écrits dans aucun fichier du dépôt ou du dossier partagé, aucun commentaire ni aucune description. Le lien figure en revanche dans la transcription de la session de la Sécurité et dans les journaux du connecteur. Le connecteur n'offre pas de révocation : le commentaire du relevé consigne la date d'expiration du lien.
   - **Repli** : si le connecteur Vercel est indisponible, le relevé revient au bloc versionné, joué par Samuel avec `E2E_P0_REEL_BYPASS` (sous le critère du point 3 et la lecture du journal par la Sécurité).
2. **Sondes témoins, obligatoires.** Avec le même cookie :

   | Témoin | Attendu | Sinon |
   |---|---|---|
   | `GET /prototype/executions`, **avant** les sondes | **200** et la page de saisie du code d'accès (« Accès aux exécutions réelles », sans cookie D22, pas le formulaire de lancement de 0064) | 401 ou redirection vers la connexion Vercel : accès non franchi, relevé nul. 404 : garde de l'application fermée (`notFound()`), blocage distinct, relevé nul. |
   | `POST /prototype/executions`, sans en-tête `Next-Action` ni corps | ni 401, ni redirection vers la connexion Vercel (un `POST` franchit donc la protection) | relevé nul |
   | `POST` avec les en-têtes `x-vqs-*` du bloc, **sans cookie** | 401, 403 ou redirection vers la connexion Vercel (cas d'un appelant quelconque, visé par 0063 point 8) | arrêt, comme au point 3 |
   | `GET /prototype/executions`, **après** les sondes | 200, page de saisie (le lien n'a pas expiré pendant le relevé) | relevé nul |

   Aucune action n'est soumise : ni saisie de code, ni lancement.
3. **Sondes et critère.** Les quatre sondes du bloc versionné, **dans l'ordre de `SONDES`**, vers `/.well-known/workflow/v1/flow` ; les trois `POST` portent le corps `{"runId": "wrun_01FORGE00000000000000000"}` :
   - `GET` sans en-têtes ;
   - `POST` sans en-têtes de file ;
   - `POST` avec les en-têtes `x-vqs-*` du bloc ;
   - `POST` avec les en-têtes du CloudEvent binaire du bloc.

   **Une sonde est conforme si elle rend :**
   - **401 ou 403** : refus de la plateforme (critère de 0063) ;
   - **ou un 404 servi sans invocation de fonction**, prouvé pour cette sonde par les trois éléments suivants, tous exigés :
     - (a) l'en-tête **`x-matched-path: /404` est présent** (la plateforme a servi sa page 404). Un `x-matched-path` absent ou différent ne prouve rien : la sonde n'est pas conforme ;
     - (b) **la sortie du build** du déploiement relevé liste la route `/.well-known/workflow/v1/flow` (sinon le 404 viendrait d'un build sans la route, 0063 point 10) ;
     - (c) **le journal d'exécution** du déploiement, lu avec le connecteur Vercel (`get_runtime_logs`, filtré sur le déploiement), sur une fenêtre qui va d'une minute avant la première requête à la fin du relevé, lu **au moins 5 minutes après** la dernière requête (propagation) : il contient les requêtes témoins vers `/prototype/executions` (le journal capte bien ce déploiement), et **aucune ligne** sur `/.well-known/workflow/v1/flow`.

   **Toute autre réponse** arrête le relevé et bloque le déverrouillage et le premier lancement, en attendant la décision de la Sécurité (décideur du point 8 de 0063) : 400, 405, 500, un 2xx, une redirection, un 404 dont un élément de preuve manque, ou tout signe que le gestionnaire a tourné (ligne de journal sur la route de flux, `x-matched-path` qui la nomme).

   Ce critère est **plus strict** que 401 ou 403 seulement si la route existe dans le build (b) et que rien ne l'a exécutée (a, c) : la route de file n'est alors pas exposée en HTTP.
4. **Moment et portée de la garantie.**
   - **Premier relevé** : il se fait **avant le déverrouillage** (0056 § 4). Une requête forgée acceptée ne pourrait alors rien lancer : l'exécution visée est inconnue ; chaque étape de `p0Run` exige d'abord une exécution réservée en base (`verifierGardeEtape`, sinon `run_refused`) ; seule l'action de lancement réserve une exécution (`reserverExecution`, appelée seulement depuis `lancement.ts`), et elle est refusée tant que S8 tient (`verrouS8Leve`). « Avant toute clé et tout appel » vaut pour l'entrée des étapes (`ouvrirEtape`, `etapeClore`), **pas** pour ce que fait le gestionnaire du SDK avant d'atteindre une étape.
   - **Relevés suivants** : le relevé est refait à toute mise à jour de `p0-reel` qui change la version du Workflow SDK, de `@vercel/queue` ou du runtime. Il se fait alors avec S8 fermé, ou sans aucune exécution `en_cours` ; sinon, seules les sondes protègent, et la Sécurité le consigne.
5. **Consignation.** Le relevé est consigné sur la PR qui a mis `p0-reel` à jour, comme pour 0062 § 8 et 0065 § 7. On y écrit : le déploiement, le commit, l'hôte de préversion, la méthode, la preuve que le build sert la route, et pour chaque sonde et chaque témoin son code, `x-matched-path`, la présence de `x-vercel-id` (provenance plateforme, valeur non écrite), ainsi que la fenêtre et le résultat de la lecture du journal, et la date d'expiration du lien. On n'écrit ni corps de réponse, ni lien, ni cookie.
6. **Suite.** Une PR de test, revue par le Tech Lead et la Sécurité, aligne le bloc versionné : sondes témoins du point 2 ajoutées ; critère du point 3 ; un 404 n'y est accepté qu'avec `x-matched-path: /404` présent, **et** le test le signale comme « à confirmer par le journal » : un bloc au vert avec un 404 ne vaut pas relevé sans la lecture du journal par la Sécurité (point 3 c). Elle n'est pas une condition de ce relevé.

## Risques résiduels (Sécurité)

- **Lien de partage** : un lien neuf vaut 23 heures ; un lien existant garde son expiration, et peut ne pas expirer (documentation de l'outil `get_access_to_vercel_url`). Il est dans la transcription et les journaux du connecteur (point 1). Accepté jusqu'à la mise en public (0034, point 1), en propre : la préversion porte les **clés réelles** (0034), et le code d'accès (D22) reste la seule barrière applicative derrière le lien.
- **Relevé avec cookie** : les quatre sondes franchissent la protection de déploiement ; le cas d'un appelant sans cookie n'est couvert que par le témoin `POST x-vqs-*` sans cookie (point 2).
- **Provenance d'un 404** : bornée par les trois preuves du point 3 ; un doute arrête le relevé.
- **Fidélité au bloc versionné** : les requêtes sont recopiées, pas jouées par Playwright. L'écart est borné par la suite du point 6.

## Alternatives écartées

- **Workflow GitHub manuel, jeton en secret d'environnement** : c'est la voie la plus sûre pour le jeton, mais elle demande un nouveau workflow, une décision d'environnement, un test probablement à déposer par Samuel, `owner-approved`, puis la création et la copie du jeton par Samuel. C'est plus long, pour un relevé que la méthode retenue fait sans jeton.
- **Session d'agent qui reçoit le jeton** : le jeton serait collé dans le fil, où il resterait lisible. C'est contraire à l'intention de 0063.

## Conséquences

- 0063 porte en tête la mention « Amendée par 0069 », qui cite la phrase « relevé humain » de l'amendement P0r3c-5 (point 4) ; son texte n'est pas réécrit.
- **Textes périmés**, corrigés par la PR de test du point 6 : commentaire de tête de `tests/e2e/p0-flux.e2e.spec.ts` (l. 21-23 et 27 : « relevé humain », critère 401 ou 403) et son `test.skip` et son critère (l. 162 et 168) ; commentaire de `tests/unit/confinement/listes/process.ts` (l. 171, « relevé humain »).
- **Liste de contrôle de l'essai réel** : document `essai-reel/checklist-essai.md` du dossier partagé du projet, hors du dépôt ; la Sécurité y retire B6 (Samuel) et fait d'A6 un relevé de la Sécurité, sans PR.
- Note de version suivante : lister 0069.
