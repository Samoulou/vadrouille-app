# 0034 — Clés OpenRouter et Google sur Production, et identifiant propriétaire Neon sur les préversions, jusqu'à la mise en public

Statut : accepté pour le maintien des clés et de l'identifiant Neon (réponses de Samuel citées ci-dessous) ; la lecture de « on laisse » reste à confirmer par Samuel (description de #182) · Date : 2026-10-12 · Décideur : Samuel (fil « Correction spec P0 » du projet Claude « Vadrouille », 2026-10-12 13:49 CEST) · Consigné par le CEO (40e cycle) · Ticket #181 · Citations lues dans le fil par le CEO le 2026-10-12

Numérotation : 0029 est prise par la PR #165 (ticket #164), fusionnée sur `main` le 2026-10-12 à 12:46 UTC (vérifié par le CEO le 2026-10-12 à 17:20 CEST, `git ls-tree origin/main docs/decisions/`) ; 0031 est réservée par #172 et 0033 par #177. 0034 est le prochain numéro libre. Cette décision vaut indépendamment de la fusion de #172 et de #177.

## Contexte
Le 2026-10-12, le studio a vérifié l'environnement Vercel du projet et constaté deux écarts :
- l'intégration Neon–Vercel, ajoutée par Samuel le 2026-10-12 à 11:34 CEST, pose l'identifiant propriétaire de la base (droits complets) sur les préversions ; c'est la question P0-Q19 de la spec #172 ;
- les clés `OPENROUTER_API_KEY` et `GOOGLE_MAPS_SERVER_KEY` sont aussi posées sur l'environnement Production. Or la décision 0028 § 1 (Q250) dit : « clés OpenRouter et Google seulement en Preview et Development, pas en Production ».

La revue consolidée de #172 (head `a7a042b`, bloquant 6) demande une décision écrite. Celle-ci cite **mot pour mot** les questions du studio et les réponses de Samuel.

## État vérifié (CEO, 2026-10-12 à 13:20 CEST)
Sources : API Vercel (`GET /v10/projects/{id}/env`, liste des déploiements `target=production`, domaines du projet) et requête HTTP sur le domaine de production, appelées par le CEO depuis sa session. Cette vérification précède la carte P0-Q19 (13:26 CEST), la question sur les clés (13:40 CEST) et les réponses de Samuel (13:49 CEST). L'état n'a pas été revérifié après ces réponses ; Samuel ayant choisi de laisser les réglages en place, il est présumé inchangé.
- **Neon** : les 16 variables de l'intégration visent Development et Preview, et `POSTGRES_USER` vise Development seulement. **Aucune ne vise Production.**
- **Clés** : `OPENROUTER_API_KEY` et `GOOGLE_MAPS_SERVER_KEY` existent sur Development, Preview et Production.
- **Production** : Vercel déploie automatiquement `main` en production par l'intégration Git (déploiements de #149, #27 et #175). Le domaine de production `vadrouille-app-ten.vercel.app` répond **sans authentification** (HTTP 200), car la protection Vercel est en mode « tout sauf les domaines de production ». Les préversions, elles, restent protégées.
- **Code** : aucun fichier de `src/` sur `main` ne lit `OPENROUTER_API_KEY` ni `GOOGLE_MAPS_SERVER_KEY`. Le déploiement de production ne les utilise donc pas aujourd'hui.

## Questions du studio et réponses de Samuel, citées mot pour mot

### 1. Identifiant propriétaire Neon (P0-Q19)
Carte de décision posée par le studio à 13:26:46 CEST :

> Limiter dès maintenant le lien Neon–Vercel aux tests (Development) ?
>
> P0-Q19. Aujourd'hui, le lien entre Neon et Vercel donne à toutes les préversions (y compris celles des PR claude/...) un accès complet à la base. Les clés OpenRouter et Google, elles, tu avais accepté ce risque (Q250), mais pas pour la base. Rien de ce qui est en cours n'en a besoin avant la tâche base de données (P0r2). Le réglage se fait dans Vercel, intégration Neon, environnements.
>
> Oui, limiter : Les préversions n'ont plus accès à la base ; on le rouvrira proprement avec P0r2. · Non, garder : Toutes les préversions gardent un accès complet à la base jusqu'à P0r2. (Recommandé : oui ; « Accès complet inutile aujourd'hui, et le dépôt est public. »)

Samuel a demandé « mais pourquoi? Neon sera utiliser en prod aussi ». Le studio a répondu à 13:47:09 CEST :

> Oui, Neon servira partout : en préversion, puis en production. Ce n'est pas Neon qu'on retire, c'est la **clé maître** que Vercel a posée d'office, celle qui peut tout effacer.
>
> La tâche B1 crée des accès limités : l'application peut lire et écrire ses données, mais pas supprimer la base ni contourner les protections. Ces accès-là iront sur Preview, puis sur Production quand tu ouvriras la production.
>
> Donc décocher Preview, c'est provisoire : juste le temps que B1 pose les bons accès.

Réponse de Samuel, 13:49:15 CEST :

> ok je comprends pas tout, pour l'instant on laisse en prod, car notre prod n'est pas sensible, c'est une chose à consolidé avant une release public, mais en gros tant qu'on est pas en pbulic on est ok, on fera la sécu quan dla release sera en pbulic

Lecture du CEO, **à confirmer par Samuel** : « on laisse » répond à la proposition de retirer Preview, donc l'état est laissé tel quel, sur Development et Preview. Rien n'est ajouté sur Production.

### 2. Clés OpenRouter et Google sur Production
Question du studio, 13:40:32 CEST :

> **Une surprise à trancher.** Les clés OpenRouter et Google sont aussi posées sur « Production ». Tu avais décidé « Preview et Development seulement » (Q250). Je n'y ai pas touché. Veux-tu que la ligne Production de ces deux clés soit supprimée ? Je recommande oui.

Réponse de Samuel, 13:49:46 CEST :

> pareil pour ça on garde partout eton adaptera avant la mise en public

## Ce que cela change
- **Q250, 0028 § 1 et 0026** (« jamais utilisées en production ») sont amendées sans être réécrites (comme dans 0019). Jusqu'à la mise en public, les deux clés restent sur Development, Preview **et Production**. D'ici là, cette décision prime sur 0028 § 1 et sur cette phrase de 0026.
- **P0-Q19** est close. L'identifiant propriétaire Neon reste sur Development et Preview jusqu'à la mise en public. Il n'est pas posé sur Production.
- **`docs/CONTEXT.md`** : il y a une tension avec la ligne « Phase en cours », qui interdit « comptes et services payants (tout engagement de dépense externe), clés de production, mise en production » tant que G0 n'est pas franchie. Des clés posées sur Production et une production déployée automatiquement s'y opposent. Les clés et la mise en production sont réservées à Samuel (« Qui décide quoi »), et sa réponse vaut dérogation pour les clés seulement, jusqu'à la mise en public. La tension sur le déploiement automatique en production lui est remontée (section « Écart constaté avec le plan » et description de #182).
- **Garde préalable à toute fusion** : production est déployée automatiquement et publique. Aucun code qui lit `OPENROUTER_API_KEY`, `GOOGLE_MAPS_SERVER_KEY` ou une variable Neon ne fusionne sans une garde qui refuse tout client réel et toute connexion quand `VERCEL_ENV=production`. Cette garde doit être testée dans la même PR. C'est l'exigence du bloquant 7 de #172, étendue à toute PR.
- **Plafonds** : les plafonds de Q249 et Q252 (100 requêtes par jour et par API, alerte à 20 USD, 0028) et les budgets mensuels de Q234 (0027 § 2) sont censés borner le coût tant que les clés sont sur Production ; la portée exacte du quota reste ouverte (P0-Q14), et leur existence réelle est à vérifier (point 5 de la liste ci-dessous). Ils ne sont pas relâchés avant la mise en public. Il s'agit de la clé Google limitée à Places et Routes, des quotas journaliers et des budgets mensuels de 0027.

## Passe de sécurité avant la mise en public
**Mise en public** : premier accès au produit pour une personne extérieure au studio et à Samuel (testeur, prospect, bêta), ou annonce d'une adresse du produit. Le prototype parcouru par Samuel seul n'en est pas une.

**Responsables** : le CEO l'inscrit au plan dès qu'une mise en public est prévue ; le rôle Sécurité la mène et rend un verdict écrit ; Samuel exécute les réglages Vercel et Neon et donne son accord. Elle doit être faite avant la mise en public.

**Liste de contrôle minimale** :
1. Retirer l'identifiant propriétaire Neon de Preview et le remplacer par les rôles à moindre privilège (0007, créés par B1).
2. Limiter les clés OpenRouter et Google aux environnements prévus, puis faire tourner les deux clés, puisqu'elles ont été exposées aux préversions et à Production.
3. Vérifier la protection des préversions et de la production : mode de protection, domaine public.
4. Vérifier que les PR de forks ne reçoivent aucun secret d'environnement (le dépôt est public) : protection des forks de Vercel et de GitHub Actions.
5. Vérifier dans les consoles Google Cloud et OpenRouter que les quotas et plafonds de Q249, Q252 et Q234 existent réellement et sont toujours en place.
6. Avant tout réglage, relever l'état par environnement via l'API Vercel (variables, déploiements de production, domaines, protection) et le joindre au verdict.

## Ce qui ne change pas
- `CLAUDE.md`, « Jamais » : « Utiliser une clé de production ou committer un secret » et « Promouvoir quoi que ce soit en production ». La fusion automatique déploie aujourd'hui `main` en production sans promotion (voir l'écart ci-dessous) ; aucun agent ne déclenche de déploiement de production.
- Aucune exécution réelle n'a lieu avant P0r3, exigences d'entrée vérifiées (0031, PR #172).

## Écart constaté avec le plan, remonté à Samuel
`docs/studio/mise-en-place.md` prévoit « `main` déployé automatiquement sur le staging ; production promue à la main » (l. 20) et « Vercel déploie `main` sur le staging » (l. 49), et `CONTEXT.md` réserve la mise en production à Samuel. L'état vérifié montre que chaque fusion sur `main` est déployée en **production**, sur un domaine public sans authentification. Cet écart est un réglage du projet Vercel, qui relève de Samuel. Il lui est remonté (description de #182, 2026-10-12) : faut-il que la production cesse d'être déployée automatiquement ? Cela ne bloque pas cette décision. En revanche, la garde `VERCEL_ENV=production` ci-dessus reste exigée tant que l'écart dure.

## Quand revoir cette décision
Avant toute mise en public, ou plus tôt si Samuel le demande, ou si l'un des plafonds de Q252 est atteint.
