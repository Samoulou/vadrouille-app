# État du studio — 2026-10-28 (216e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-28 18:55 UTC « C'est où mes voyages ? » (fil projet) : répondu avec le lien `/voyages` du site d'essai (connexion requise).
- 2026-10-28 18:55 UTC : Samuel a fusionné la mise en ligne #816 ; `p0-reel` est à 7b989b4 (nouveaux prompts, site officiel, parcours sans allers-retours). Un seul lien (`/voyages/nouveau`) envoyé à 19:00 UTC.
- 2026-10-28 19:07 UTC « J'ai besoin de partager rapidement [le voyage de Tokyo] à une amie » : impossible aujourd'hui (le partage F10c est fermé hors démonstration, décision 0039 F10-TL-7, et la page demande une session). Réponse : captures d'écran ce soir ; ticket #825 ouvert, PR #827 (lien signé sans connexion, décision 0135) en revue.
- 2026-10-28 19:26 UTC « il a eu des générations pour tokyo foirée » : cause lue dans les journaux Vercel : Google répond 429 (`upstream_rate_limited`) depuis 19:13 UTC, quota journalier de la clé de Samuel atteint ; lancements de 19:16 (planification) et 19:23 (ancrage) arrêtés ; la lecture du voyage de Tokyo échoue aussi (`p0.read_unavailable`, encore à 20:06 UTC sur toutes les pages du voyage). Répondu : relever le quota dans la console Google ou attendre la remise à zéro (vers 08:00 heure suisse). Ticket #826 ouvert, PR #828 en revue.
- 2026-10-28 19:45 UTC (fil « Lister ce qui manque pour le MVP ») « ok bah go hein, tu vas me développer, par le biais des routines TOUS jusqu'a l'étape 9, on parlera de la mise en ligne publique à la fin » : **feu vert pour les étapes 1 à 9 du MVP** (la mise en ligne publique sera discutée à la fin). Plan écrit et fusionné (#829, `docs/plans/mvp-etapes-1-9.md`, `specs/M1a-chaine-inversee-api.md`) ; premières tâches lancées (voir « En cours »).

## Fait
- **Statut du 215e cycle** (#823) fusionné.
- **Mise en ligne #816** (main → p0-reel) fusionnée par Samuel à 18:55 UTC ; déploiement `p0-reel` 7b989b4 prêt ; premier lancement avec le nouveau prompt à 19:23 UTC : 46 sites proposés, 46 vérifiés, 15 retirés, 31 gardés (10 274 jetons de sortie) avant l'arrêt Google.
- **Mineurs de #809** (#822) : PR #824 fusionnée à 18:58 UTC (composant lien partagé, captures, 0122 § 2.2 condition 5) ; 6 nouveaux mineurs laissés pour plus tard.
- **Plan MVP étapes 1 à 9** (#829, Product Owner) fusionné : étape 1 = chaîne inversée dans la vraie app (`api`, session better-auth, schéma principal, barrière B9-TL-8), 4 fils par dossier, une seule tâche de migration par cycle, actions de Samuel S1 à S7 datées par tâche. 8 questions pour Samuel (Q634 à Q641).
- **Note de version v2026.10.28-10** (#817, `docs/releases/v2026.10.28-10.md`) publiée par la routine Release ; mise en ligne main → p0-reel = PR #816, en attente de la fusion par Samuel.
- **Note de version v2026.10.25-21** (#771) publiée. Erreur relevée : elle dit la migration 0019 non appliquée et demande à Samuel de lancer `db-migrate` ; c'est faux, Samuel l'a appliquée le 2026-10-25 à 10:25 UTC (run 40184687008). À corriger dans la prochaine note.
- **Revue hebdomadaire, semaine 43** (#769, `docs/releases/hebdo-2026-43.md`) fusionnée et postée dans #studio.
- **Recherche de ville Google** : #763 `[back]` fusionnée (recherche toujours montée sur le site d'essai, refus journalisés `p0.ville_refusee`, décision 0131) ; report #766 fusionné par Samuel (2026-10-25 15:22 UTC) ; page `/voyages/nouveau` du site d'essai vérifiée à 15:23 UTC (champ de recherche présent sans paramètre). Lien de test envoyé à Samuel.
- Rappel : l'essai de Samuel du 2026-10-24 à 15:24 UTC a écrit son programme (8 jours) sans erreur, après #749 et #750.

## En cours
- **Voyage de Zakynthos absent de « Mes voyages »** : enquête ; attend la capture de la page des lancements par Samuel.
- **Audit UX « séduire les nouveaux clients »** (fil projet de Samuel, 2026-10-28 05:47 UTC, fil « Rendre l'app séduisante pour les nouveaux clients », hors routine du cycle) : fusionnés #805 (écran 1, calendriers bornés, #801), #810 (page d'accueil, #802), #811 (« Mes voyages », bouton « Créer un voyage », #803), #812 (tri, première carte d'abord, #804), #814 (formulaire guidé, #813) ; #808 (CI : Ubuntu 24.04 épinglé, #807, owner-approved par Samuel). Ces changements ne sont pas encore sur le site d'essai `p0-reel` : la prochaine note de version les emportera avec #809.
- **MVP étape 1 (génération)** : #832 M1-TL, décision du Tech Lead sur T1 à T8 de `specs/M1a-chaine-inversee-api.md` (agent lancé 20:02 UTC, branche `claude/832-m1-tl-decision`) ; suivront M1-S (Sécurité, S1-S5), M1-D (migration si exigée) et M1a (backend).
- **MVP étape 1 (paiement)** : #831 B4b, écrans du déblocage branchés sur `api` avec le paiement simulé (agent backend lancé 19:59 UTC, branche `claude/831-b4b-deblocage-api`).
- **MVP étape 2 (e-mails)** : #830 M2-spec = PR #833 (`specs/B3d-envoi-reel-resend.md`, plafond 100 envois par jour, notifications arrêtées à 80, code `email_cap_reached`, expéditeur `onboarding@resend.dev`). Revue 20:08 UTC : 6 bloquants (environnements admis, amendement de 0098 § 4 obligatoire, transfert hors UE à reformuler pour Samuel, atomicité du plafond commun, chemin de l'erreur dans better-auth, confinement de `fetch`), 8 mineurs ; correction 1 à lancer au prochain créneau libre. Puis M2-S (Sécurité) et M2a (backend). Réponse CEO à C1 : M2c (écran 4) après M2a sur le fil e-mails.
- **Partage d'un voyage réel (#825)** : PR #827 (Tech Lead, décision 0135 : jeton signé `v1.<voyage~organisation~dernier-jour>.<HMAC>` dérivé de `P0_RUN_TOKEN`, lien créé avec cookie d'accès valide et voyage débloqué, carte Google seule sinon aucune). Revue 19:51 UTC : Sécurité et UX approuvent, Tech Lead 3 bloquants (clause de veto à retirer, tests de `shareButtonVisible`, assertion de la mention Google en e2e) ; **correction 1 lancée** 20:12 UTC. Après fusion et mise en ligne : demander à Samuel un seul réglage Vercel (protection des aperçus, décision 0034) pour qu'une amie puisse ouvrir le lien.
- **Google indisponible (#826)** : PR #828 (429 écrit en arrêt externe `upstream_unavailable`, libellé de cause, `failureCode` dans `p0.read_unavailable`). Revue 19:59 UTC : Sécurité approuve ; Tech Lead 1 bloquant de gouvernance (décision écrite amendant 0046 D24, 0079 § 6, 0092 § 4, avec l'effet sur la relance), 7 mineurs ; **correction 1 lancée** 20:13 UTC, avec vérification de ce que voit l'utilisateur quand la lecture échoue (journal du 20:06 UTC : toutes les pages du voyage de Tokyo en `p0.read_unavailable`).
- **Réglages fins du programme (#800)** : #809 et #816 fusionnés, en ligne sur le site d'essai depuis 18:55 UTC. Reste à lire : le journal du prochain lancement de Samuel une fois le quota Google rétabli (`sitesUnchecked`, `retoursDeQuartier`). Questions Q630 à Q633.
- **#527 `[data]`** (`coords-purge`) : bloqué sur Q438 (Samuel).
- Toujours en attente : #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595), Q618. Q261 et Q262 sont à réconcilier avec F13.

## Bloqué
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** : Q438.

## Prochain cycle
1. Revues : #827 et #828 après leur correction 1 (deux corrections au plus) ; correction 1 de #833 dès un créneau libre ; décision M1-TL (#832) puis lancer M1-S (Sécurité) et, selon la décision, M1-D ; B4b (#831) en revue.
2. Après la fusion de #827 et #828 : mise en ligne main → p0-reel (note de version avec #824, 0135 et la décision de #828 ; corriger l'état des migrations 0016 à 0019), fusion par Samuel, puis un seul réglage Vercel à lui demander pour le lien de partage, puis un seul lien.
3. Lire les réponses de Samuel aux questions Q634 à Q641 (carte « Je suis tes recos ») ; Q638 (vérifier les 8 propositions seulement) bloque M1c.
4. Zakynthos absent de « Mes voyages » : toujours en attente de la capture de Samuel. #527 : Q438 (action S4 du plan, avant le premier essai déployé du MVP).

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (fait : 0011 et 0012 appliquées le 2026-10-20), fusion de #580 (`main` → `p0-reel`), Q525 (réserve Google et plafonds Places de la tâche A2), Q527 (barrière des appels réels de l'aperçu), Q529 (option (a) de la question 4 de 0102, refusée par la Sécurité sans amendement de S4), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Q634 à Q644 (plan MVP #829 : 8 questions à Samuel ; PR #828 : code d'arrêt propre au 429, écran 5 générique ; PR #833 : adresses de tiers vers Resend hors UE).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
