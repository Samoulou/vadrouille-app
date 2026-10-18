# État du studio — 2026-10-18 (101e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 17 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 15:15 UTC : carte « Lever le délai » de 6 h sur la décision 0090 (Q498) : délai levé.
- 16:17 UTC : report `main` → `p0-reel` (#497) **fusionné par Samuel** (`0d0bbaa`, déployé).
- 16:51 UTC : rapport, exécution comptée rome-1/B (`0d0bbaa`) arrêtée en `pipeline_failed` ; journal : `p0.step_failed` phase `routes`, `ErreurClientGoogle`, `upstream_rate_limited` (limite quotidienne de 1000 éléments Routes de la console de Samuel atteinte). La lecture paire par paire (#495) fonctionne.
- 16:54 UTC : carte « Ne pas compter » cette exécution (Q499) : décision 0091 (#498).
- 17:36 UTC : « on peut pas forcer un test ? » : répondu (relever la limite dans sa console Google ; le studio n'y touche pas).
- 17:54 UTC : la page du voyage `proto_rome_20261018_6` ne s'ouvre plus : l'exécution de ~17:42 UTC a **réussi**, mais chaque ouverture relit les trajets chez Google (`p0.read_unavailable`, `ErreurClientGoogle`, limite atteinte).
- 17:57 et 17:59 UTC : « on sauvegarde les temps et tant pis » puis carte **« Garder les temps »** (Q501), après avertissement sur le contrat Google : décision 0092 en cours.
- #studio : aucun message nouveau.

## Fait
- Fusionnées : lecture Routes paire par paire et `p0.step_failed` (#495, décision 0090), amendement 3 qualité du programme (#489), ancrage B8-PO-13/15 (#486), contrat de B9d (#484), décision 0089 (#494), statut du 100e cycle (#496), report `main` → `p0-reel` (#497, par Samuel).
- Premier voyage Rome complet de la journée écrit (`proto_rome_20261018_6`).

## En cours
- tech-lead : **décision 0092** (temps de trajet Routes conservés dans le schéma `prototype`, purge 30 jours, relecture sans appel Google si tout est conservé ; amende 0011, 0027 et la ligne « Jamais » de CLAUDE.md : `owner-approved` de Samuel probable).
- ia-recherche : arrêt clair « limite Google du jour atteinte » (sans changer le décompte, Q500).
- ia-recherche : code de l'amendement 3 (PO-19 à PO-28).
- #498 (0091) : `techlead-approved` ; job `docker` relancé une fois (police Google non téléchargée pendant la construction, sans rapport avec la PR ; vert sur `main`).

## Bloqué
- **Affichage des voyages sur `p0-reel`** : chaque ouverture redemande des centaines d'éléments Routes ; code après la fusion de 0092 (rôle de code, verdict Sécurité sur `db/`), puis report `main` → `p0-reel`.
- **B9b** : désormais possible (#484 fusionnée) ; place libre au prochain cycle.
- **B4a** et **B8b** : jamais dans le même cycle que B9b (0078).
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B9c réel** : Q468 ; B9d : verdict Sécurité (Q492) ; B9e : Q467.
- **Purge du MVP** : activation Q438 (Samuel).
- **`coords-purge`** en échec (3 runs) : ticket à ouvrir.

## Prochain cycle
1. Après 0092 : tâche de code (data + ia-recherche) pour conserver les temps et afficher sans erreur ; puis report `main` → `p0-reel`.
2. B9b (backend avec data).
3. Samuel ouvre son voyage Rome une seule fois après ~07:00 UTC le 2026-10-19.
4. Tickets à placer : `coords-purge`, commit affiché sur la page d'essai, police servie localement (Q484, aussi cause du job `docker` rouge), compteurs de fin d'essai (Q493), et la liste du 100e cycle.

## Décisions attendues de Samuel
- **Réponses demandées** : Q500 (un arrêt par la limite Google compte-t-il ?), Q502 (exécution de 16:57 UTC), Q497 (exécution du matin) ; extension au MVP de Q501.
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060) ; B8c est fusionnée, la purge attend cette réponse pour être activée.
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q345, Q332, Q323, Q317, Q296, Q297, Q288, P0c-Q2.
- **Prévente** : Q357 et Q362 ; les documents sont fusionnés (#256).
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO de la spec B3 (#243) et B4-PO de la spec B4 (#248) ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - avant le 2026-10-16 : décision 0047 (découpage de `fr.json`, #269) ; décisions B7-PO de la spec B7 (#288) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, 0057, 0058, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q498 à Q502.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
