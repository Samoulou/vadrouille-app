# Exécutions réelles du prototype P0 : registre

Registre tenu par ia-recherche (spécification `specs/P0-suite-2.md`, « Page de lancement », P0S2-PO-7). Samuel lance une
exécution depuis `/prototype/executions` (préversion de `p0-reel` seulement), puis colle le texte de « Copier le
rapport » dans le fil de la tâche ; ia-recherche le recopie ici, tel quel. Le rapport ne contient aucune donnée Google
(D24, verdict P0-Q32) : ni lieu, ni identifiant, ni coût ou durée en valeur (question ouverte 8 de 0046, Q368).

## Avant le premier lancement réel

Conditions qui ne sont pas du code (décision 0063, points 7 et 8 ; 0052 § 3 ; 0056) : la page refuse tant qu'une manque
(`real_mode_unavailable`), sans rien réserver.

1. `P0RUN_COMPLET` à vrai (`src/workflows/complet.ts`), par une PR après le brief court de l'essai (#355) et la revue
   Sécurité de P0r3d.
2. Verrou S8 levé (0056) : la page le lit à chaque lancement (`EXECUTE` de `vadrouille_prototype` sur la fonction des
   positions).
3. Relevé du point 8 sur la préversion de `p0-reel` : `tests/e2e/p0-flux.e2e.spec.ts`, bloc « préversion », lancé avec
   `E2E_P0_REEL_URL` et `E2E_P0_REEL_BYPASS` ; résultat (réussi ou non, statuts rendus) consigné ci-dessous.
4. Réglages de la préversion (Q268) et accord écrit de Samuel.

## Liste d'observation du premier essai (décision 0063, point 7 et suivi de P0r3c)

À relever au premier essai d'intégration, puis à la première exécution comptée, sans donnée Google :

1. **Marqueurs `<<<DONNEES>>>…<<<FIN>>>` envoyés au moteur de recherche** (mineur 9 de la revue du head `b64b68e`) :
   effet attendu nul. Relevé : l'exécution quitte la phase `recherche` (suivi de la page) ; si elle s'arrête en
   `recherche`, son code d'arrêt. Aucun texte de requête ni résultat n'est consigné.
2. **Reprise d'une étape** (mineur 6 de la revue du head `608ee99`) : une étape redistribuée par la file après expiration
   ne repaie pas ses appels (garde d'idempotence de P0r3c-5). Relevé : dans l'observabilité Workflow de Vercel, une
   tentative par étape ; une seconde tentative, s'il y en a, s'arrête avant tout appel (`pipeline_failed`).

## Relevés

Aucun pour l'instant.
