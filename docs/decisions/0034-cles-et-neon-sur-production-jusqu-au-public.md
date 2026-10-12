# 0034 — Clés OpenRouter et Google sur Production, et identifiant propriétaire Neon sur les préversions, jusqu'à la mise en public

Statut : accepté · Date : 2026-10-12 · Décideur : Samuel (fil « Correction spec P0 » du projet Claude « Vadrouille », 2026-10-12 13:49 CEST) · Consigné par le CEO (40e cycle) · Ticket #181 · Citations lues dans le fil par le CEO le 2026-10-12

Numérotation : 0029 est prise par #164 (fusionnée), 0031 est réservée par #172 et 0033 par #177. 0034 est le prochain numéro libre. Cette décision vaut indépendamment de la fusion de #172 et de #177.

## Contexte
Le 2026-10-12, le studio a vérifié l'environnement Vercel du projet et constaté deux écarts :
- l'intégration Neon–Vercel, ajoutée par Samuel le 2026-10-12 à 11:34 CEST, pose l'identifiant propriétaire de la base (droits complets) sur les préversions ; c'est la question P0-Q19 de la spec #172 ;
- les clés `OPENROUTER_API_KEY` et `GOOGLE_MAPS_SERVER_KEY` sont aussi posées sur l'environnement Production. Or la décision 0028 § 1 (Q250) dit : « clés OpenRouter et Google seulement en Preview et Development, pas en Production ».

La revue consolidée de #172 (head `a7a042b`, bloquant 6) demande une décision écrite. Celle-ci cite **mot pour mot** les questions du studio et les réponses de Samuel.

## État vérifié (CEO, 2026-10-12 à 13:20 CEST, API Vercel)
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

« On laisse » répond à la proposition de retirer Preview : l'état est laissé tel quel, donc Development et Preview. Rien n'est ajouté sur Production.

### 2. Clés OpenRouter et Google sur Production
Question du studio, 13:40:32 CEST :

> **Une surprise à trancher.** Les clés OpenRouter et Google sont aussi posées sur « Production ». Tu avais décidé « Preview et Development seulement » (Q250). Je n'y ai pas touché. Veux-tu que la ligne Production de ces deux clés soit supprimée ? Je recommande oui.

Réponse de Samuel, 13:49:46 CEST :

> pareil pour ça on garde partout eton adaptera avant la mise en public

## Ce que cela change
- **Q250, 0028 § 1 et 0026** (« jamais utilisées en production ») sont amendées sans être réécrites (comme dans 0019). Jusqu'à la mise en public, les deux clés restent sur Development, Preview **et Production**. D'ici là, cette décision prime sur 0028 § 1 et sur cette phrase de 0026.
- **P0-Q19** est close. L'identifiant propriétaire Neon reste sur Development et Preview jusqu'à la mise en public. Il n'est jamais posé sur Production.
- **`docs/CONTEXT.md`** (« clés de production » réservées à Samuel) n'est pas contredit : c'est Samuel lui-même qui décide, et les clés restent celles du prototype (0026). Elles ne deviennent pas des clés de production au sens de `CLAUDE.md`.
- **Garde préalable à toute fusion** : production est déployée automatiquement et publique. Aucun code qui lit `OPENROUTER_API_KEY`, `GOOGLE_MAPS_SERVER_KEY` ou une variable Neon ne fusionne sans une garde qui refuse tout client réel et toute connexion quand `VERCEL_ENV=production`. Cette garde doit être testée dans la même PR. C'est l'exigence du bloquant 7 de #172, étendue à toute PR.
- **Plafonds** : les plafonds de Q249 et Q252 restent la seule borne de coût tant que les clés sont sur Production. Ils ne sont pas relâchés avant la mise en public. Il s'agit de la clé Google limitée à Places et Routes, des quotas journaliers et des budgets mensuels de 0027.

## Passe de sécurité avant la mise en public
**Mise en public** : premier accès au produit pour une personne extérieure au studio et à Samuel (testeur, prospect, bêta), ou annonce d'une adresse du produit. Le prototype parcouru par Samuel seul n'en est pas une.

**Responsables** : le CEO l'inscrit au plan dès qu'une mise en public est prévue ; le rôle Sécurité la mène et rend un verdict écrit ; Samuel exécute les réglages Vercel et Neon et donne son accord. Elle doit être faite avant la mise en public.

**Liste de contrôle minimale** :
1. Retirer l'identifiant propriétaire Neon de Preview et le remplacer par les rôles à moindre privilège (0007, créés par B1).
2. Limiter les clés OpenRouter et Google aux environnements prévus, puis faire tourner les deux clés, puisqu'elles ont été exposées aux préversions et à Production.
3. Vérifier la protection des préversions et de la production : mode de protection, domaine public.
4. Vérifier que les PR de forks ne reçoivent aucun secret d'environnement (le dépôt est public) : protection des forks de Vercel et de GitHub Actions.
5. Vérifier que les plafonds de Q249 et Q252 sont toujours en place.

## Ce qui ne change pas
- `CLAUDE.md`, « Jamais » : aucun agent n'utilise une clé de production ni ne promeut quoi que ce soit en production. Le studio ne déclenche aucun déploiement de production. Le déploiement automatique de `main` est un réglage de Samuel (0002).
- Aucune exécution réelle n'a lieu avant P0r3, exigences d'entrée vérifiées (0031, PR #172).

## Quand revoir cette décision
Avant toute mise en public, ou plus tôt si Samuel le demande, ou si l'un des plafonds de Q252 est atteint.
