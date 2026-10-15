# 0069 — Relevé de la route de flux sur la préversion de `p0-reel` : méthode et sonde témoin (amendement de 0063, point 8)

Statut : décision déléguée (exigence de sécurité : Sécurité, décideur du point 8 de 0063), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel 6 heures après sa fusion (0068). Aucune dépense, aucun compte externe, aucune clé nouvelle, aucune donnée personnelle : rien n'est réservé à Samuel.

Date : 2026-10-15 · Autrice : Sécurité · Validée par le CEO (option (iii) de la section 0.3 de la liste de contrôle de l'essai réel) · Amende 0063, point 8 (condition du premier lancement réel, dont son critère : 404 prouvé admis, point 3), et la phrase du point 4 de son amendement P0r3c-5 qui en fait un « relevé humain » · Numérotation : `main` va jusqu'à 0068 ; aucune PR ouverte n'ajoute 0069.

## Contexte

0063 point 8 fait de l'e2e de la route de flux, joué sur la préversion de `p0-reel`, une **condition du premier lancement réel**. Toute requête directe à `/.well-known/workflow/v1/flow` doit être refusée par la plateforme (401 ou 403), avec et sans en-têtes `x-vqs-*`, et avec un CloudEvent binaire de `@vercel/queue`. Le bloc « préversion » de `tests/e2e/p0-flux.e2e.spec.ts` attend le jeton « Protection Bypass for Automation » (`E2E_P0_REEL_BYPASS`), « non accessible aux agents ». Le relevé revenait donc à Samuel.

Deux constats changent la situation :

1. **Samuel travaille dans le cloud seulement.** Lancer Playwright avec un jeton depuis sa machine n'est pas une voie possible. Les autres voies sont plus lourdes :
   - un workflow GitHub demande un nouveau workflow, un secret d'environnement, `owner-approved` et un test ;
   - une session d'agent qui recevrait le jeton demande de le coller dans le fil.
2. **Le critère peut passer à tort.** Le bloc versionné accepte 401 ou 403 sans vérifier que la protection de déploiement de Vercel a bien été franchie. Avec un jeton faux, expiré ou ignoré, c'est cette protection qui répond 401, avant toute fonction. Le relevé passerait alors sans rien prouver sur la protection des files (« Consumer function security »).

## Décision

1. **Méthode.** Le relevé de 0063 point 8 est fait par la **Sécurité**, en lecture, depuis le bac à sable de sa session :
   - **Accès** : un lien de partage de la préversion, obtenu par le connecteur Vercel déjà relié (`get_access_to_vercel_url`). Le lien pose un cookie d'accès, que la session réutilise pour les requêtes.
   - **Requêtes** : celles du bloc « préversion », recopiées de `tests/e2e/p0-flux.e2e.spec.ts` (mêmes chemins, en-têtes et corps), sans suivre aucune redirection.
   - **Jeton d'automatisation** : il n'est ni créé ni lu. Samuel n'a rien à faire.
   - **Le lien et le cookie** ne sont écrits dans aucun fichier, aucun journal, aucun commentaire ni aucune description. Seuls les codes de réponse sont consignés.
2. **Sonde témoin, obligatoire et en premier.** Avec le même accès, `GET /prototype/executions` doit rendre **200** et le formulaire de saisie. Sinon, la protection de déploiement n'est pas franchie, et le relevé est nul : on ne conclut rien des sondes suivantes. Aucune action n'est soumise (ni saisie de code, ni lancement).
3. **Sondes et critère élargi.** Ce sont les quatre sondes du bloc versionné vers `/.well-known/workflow/v1/flow`. Les trois `POST` portent le corps `{"runId": "wrun_01FORGE…"}`, qui vise une exécution forgée :
   - `GET` sans en-têtes ;
   - `POST` sans en-têtes ;
   - `POST` avec les en-têtes `x-vqs-*` du bloc ;
   - `POST` avec les en-têtes du CloudEvent binaire du bloc.

   Les trois `POST` passent avant le `GET`. **Une sonde est conforme si elle rend :**
   - **401 ou 403** : refus de la plateforme (critère de 0063) ;
   - **ou 404 servi sans invocation de fonction.** La route de file n'est alors pas exposée en HTTP : c'est un refus plus strict que 401 ou 403. La preuve est exigée pour chaque sonde :
     - (a) l'en-tête `x-matched-path` est relevé : il vaut `/404` ou il est absent ; il ne nomme jamais la route de flux ;
     - (b) le journal d'exécution du déploiement, lu avec le connecteur Vercel sur la fenêtre du relevé, est vide pour ce chemin.

   **Toute autre réponse** arrête le relevé et bloque le déverrouillage et le premier lancement, en attendant la décision de la Sécurité. C'est le cas pour 400 ou 500, 405, un 2xx ou une redirection. C'est aussi le cas pour un 404 dont la preuve manque, ou s'il existe le moindre signe que le gestionnaire a tourné : une ligne de journal sur la route de flux, ou un `x-matched-path` qui la nomme.

   Ce critère élargi (401, 403, ou 404 prouvé) est rédigé par la Sécurité, sur l'avis du CEO, après le premier relevé du 2026-10-15 à 15:11 UTC (#369). Ce relevé avait rendu 404 au `POST` sans en-têtes, après le témoin en 200. Un `GET` de cette route avait aussi rendu 404 au relevé de 0065 § 7 : page 404 statique, `x-matched-path: /404`.
4. **Moment.** Le relevé se fait **avant le déverrouillage** (0056 § 4). Une requête forgée acceptée ne pourrait alors rien lancer :
   - l'exécution visée est inconnue ;
   - chaque étape de `p0Run` exige d'abord une exécution réservée en base (`verifierGardeEtape`, sinon `run_refused`, avant toute clé et tout appel) ;
   - seule l'action de lancement réserve une exécution, et elle est refusée tant que S8 tient (`verrouS8Leve`).

   Le relevé est refait à toute mise à jour de `p0-reel` qui change la version du Workflow SDK, de `@vercel/queue` ou du runtime.
5. **Consignation.** Le relevé est consigné sur la PR qui a mis `p0-reel` à jour, comme pour 0062 § 8 et 0065 § 7. On y écrit le déploiement, le commit, la méthode, et pour chaque sonde son code de réponse, avec la preuve du point 3 pour un 404. On n'écrit ni corps de réponse, ni lien, ni cookie.
6. **Suite.** Une PR de test ajoutera la sonde témoin au bloc versionné de `tests/e2e/p0-flux.e2e.spec.ts`. C'est un test e2e, revu par le Tech Lead et la Sécurité, et ce n'est pas une condition de ce relevé. Le bloc reste jouable par Samuel avec `E2E_P0_REEL_BYPASS` s'il le souhaite. La même PR aligne le critère du bloc sur le point 3. Un 404 n'y est accepté qu'avec `x-matched-path` égal à `/404` ou absent ; la lecture du journal reste faite par la Sécurité.

## Risques résiduels (Sécurité)

- **Lien de partage** : il donne un accès de 23 heures à la préversion, et un lien déjà existant peut durer plus longtemps (documentation de l'outil). C'est le même mécanisme que `web_fetch_vercel_url`, déjà employé pour le relevé de 0065 § 7. La préversion reste fermée sans code d'accès (D22), et le lien n'est publié nulle part. Accepté jusqu'à la mise en public (0034, point 1), comme le risque S-4 point 2 de 0055.
- **Fidélité au bloc versionné** : les requêtes sont recopiées, pas jouées par Playwright. L'écart est borné par la suite du point 6.

## Alternatives écartées

- **Workflow GitHub manuel, jeton en secret d'environnement** : c'est la voie la plus sûre pour le jeton, mais elle demande un nouveau workflow, une décision d'environnement, un test probablement à déposer par Samuel, `owner-approved`, puis la création et la copie du jeton par Samuel. C'est plus long, pour un relevé que la méthode retenue fait sans jeton.
- **Session d'agent qui reçoit le jeton** : le jeton serait collé dans le fil, où il resterait lisible. C'est contraire à l'intention de 0063.

## Conséquences

- 0063 porte en tête la mention « Amendée par 0069 » ; son texte n'est pas réécrit.
- Liste de contrôle de l'essai réel : B6 (Samuel) est retiré ; A6 devient un relevé de la Sécurité.
- Note de version suivante : lister 0069.
