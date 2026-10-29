# État du studio — 2026-10-29 (220e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-28 18:55 UTC « C'est où mes voyages ? » (fil projet) : répondu avec le lien `/voyages` du site d'essai (connexion requise).
- 2026-10-28 18:55 UTC : Samuel a fusionné la mise en ligne #816 ; `p0-reel` est à 7b989b4 (nouveaux prompts, site officiel, parcours sans allers-retours). Un seul lien (`/voyages/nouveau`) envoyé à 19:00 UTC.
- 2026-10-28 19:07 UTC « J'ai besoin de partager rapidement [le voyage de Tokyo] à une amie » : impossible aujourd'hui (le partage F10c est fermé hors démonstration, décision 0039 F10-TL-7, et la page demande une session). Réponse : captures d'écran ce soir ; ticket #825 ouvert, PR #827 (lien signé sans connexion, décision 0135) en revue.
- 2026-10-28 19:26 UTC « il a eu des générations pour tokyo foirée » : cause lue dans les journaux Vercel : Google répond 429 (`upstream_rate_limited`) depuis 19:13 UTC, quota journalier de la clé de Samuel atteint ; lancements de 19:16 (planification) et 19:23 (ancrage) arrêtés ; la lecture du voyage de Tokyo échoue aussi (`p0.read_unavailable`, encore à 20:06 UTC sur toutes les pages du voyage). Répondu : relever le quota dans la console Google ou attendre la remise à zéro (vers 08:00 heure suisse). Ticket #826 ouvert, PR #828 en revue.
- 2026-10-28 19:45 UTC (fil « Lister ce qui manque pour le MVP ») « ok bah go hein, tu vas me développer, par le biais des routines TOUS jusqu'a l'étape 9, on parlera de la mise en ligne publique à la fin » : **feu vert pour les étapes 1 à 9 du MVP** (la mise en ligne publique sera discutée à la fin). Plan écrit et fusionné (#829, `docs/plans/mvp-etapes-1-9.md`, `specs/M1a-chaine-inversee-api.md`) ; premières tâches lancées (voir « En cours »).

- 2026-10-28 22:30 UTC : aucun nouveau message. Lien de la mise en ligne main → p0-reel (PR #837 : voyage lisible sans Google, partage par lien) envoyé à Samuel dans le fil du cycle ; fusion attendue de lui.
- 2026-10-29 00:15 UTC : aucun nouveau message (#studio et fil du cycle). La carte Q634 à Q641 reste sans réponse ; #837 reste à fusionner.
- 2026-10-29 02:15 UTC : aucun nouveau message. Lien de la PR #853 (B4b-ci, approuvée, libellé `owner-approved` réservé à Samuel) envoyé dans le fil du cycle, avec le rappel de #837.
- 2026-10-29 04:10 UTC : aucun nouveau message. #853 et #837 restent à lui ; carte Q634 à Q641 sans réponse.

## Fait
- **Statut du 219e cycle** (#856) fusionné.
- **M1a-2 génération de la chaîne inversée** (#851) : PR #854 fusionnée à 02:54 UTC (f7f8dce) après une correction (workflow `generateProgramme` étapes `a` et `e`, `CHAINE_APERCU` encore à `"ancienne"`, récit non écrit, erratum en tête de 0136 : `places/rome-chaine-inversee.json` et cinq attentes étendues, `retenirApercu` exporté).
- **M1f-D migration des compteurs de l'autocomplétion** (#855) : PR #857 fusionnée à 02:53 UTC (migration 0021 `autocomplete_daily_counts`, rôle `vadrouille_autocomplete_counter`, descente sans suppression ; non appliquée sur Neon : ligne `MIGRATIONS_APPROUVEES` par M1i).
- **B4b écrans du déblocage** (#831) : PR #836 fusionnée à 00:54 UTC (0bfaedb) après la fusion de `main` (seul conflit : imports de `src/adapters/index.ts`) et une nouvelle revue.
- **M2a envoi réel par Resend** (#849) : PR #850 fusionnée à 01:06 UTC (798e0a6) après une correction (chemin d'avant-transport partagé `src/server/mail/avant-transport.ts`, événement `email.purge_failed`, purge après le transport, test de la descente de 0020, `GRANT INSERT (day)`). Migration 0020 non appliquée sur Neon : ligne `MIGRATIONS_APPROUVEES` par M1i.
- **Décision 0138 M2-S** (#838) : PR #840 fusionnée (384af78) après une correction (Resend par API HTTPS, clé admise en préversion Vercel seule, compteur dans une table dédiée, rôle `vadrouille_mail_counter`).
- **Décision 0139 M1-S** (#841) : PR #844 fusionnée (50cc7c9) après une correction (S1 à S5, événement `generation.programme_written`, table `CHAMPS_ADMIS_PAR_EVENEMENT` dans `log.ts`, amendements de 0122 pour `api`).
- **M1a-1 code partagé** (#842) : PR #847 fusionnée (96d45af) après une correction (`src/server/programme/`, `src/domain/apercu.ts` avec `retenir`, listes P0 de `imports.test.ts`).
- **Partage d'un voyage réel** (#825) : PR #827 fusionnée à 21:18 UTC (décision 0135, bouton « Partager » sur un voyage débloqué, lien `/p/…` sans connexion, carte Google seule).
- **Google indisponible** (#826) : PR #828 fusionnée à 21:11 UTC (décision 0137 : 429 écrit en `upstream_unavailable`, lecture d'un voyage existant sans Google, libellé de cause, `failureCode` dans `p0.read_unavailable`).
- **Spec B3d envoi réel par Resend** (#830) : PR #833 fusionnée à 21:36 UTC après deux corrections (questions Sécurité M2-S-1 à M2-S-8, point 8 confinement complet).
- **Décision 0136 M1-TL** (#832) : PR #835 fusionnée à 21:50 UTC après deux corrections (module pur `src/domain/apercu.ts`, listes P0 de `imports.test.ts`, tableau des lecteurs de `trip_versions.snapshot`, en-tête : amende 0115 § 5.2, 0011 § 7, 0087 § 2 et 0081 B9-TL-3 point 1 pour la chaîne inversée seule ; exception « une tâche = une spécification » accordée par le CEO pour M1a-1 à M1a-3).
- **Note de version v2026.10.28-22** (#839, Release) fusionnée à 21:39 UTC : couvre #824, #827, #828, #829 ; état des migrations corrigé (0019 appliquée le 2026-10-25 10:25 UTC, 0016 le 2026-10-22 11:48 UTC ; 0017 et 0018 « application non vérifiée par la Release »).
- **Mise en ligne main → p0-reel** : PR #837 ouverte par le CEO à 22:28 UTC (56 fichiers, aucune migration, aucun workflow, aucune variable nouvelle) ; fusion réservée à Samuel.
- **Mineurs de #809** (#822) : PR #824 fusionnée à 18:58 UTC (composant lien partagé, captures, 0122 § 2.2 condition 5) ; 6 nouveaux mineurs laissés pour plus tard.
- **Plan MVP étapes 1 à 9** (#829, Product Owner) fusionné : étape 1 = chaîne inversée dans la vraie app (`api`, session better-auth, schéma principal, barrière B9-TL-8), 4 fils par dossier, une seule tâche de migration par cycle, actions de Samuel S1 à S7 datées par tâche. 8 questions pour Samuel (Q634 à Q641).

## En cours
- **Voyage de Zakynthos absent de « Mes voyages »** : enquête ; attend la capture de la page des lancements par Samuel.
- **Audit UX « séduire les nouveaux clients »** (#801 à #804, #813) : tout est fusionné et sur le site d'essai depuis la mise en ligne #816 (18:55 UTC).
- **MVP étape 1 (génération)** : M1-S (#844), M1a-1 (#847) et M1a-2 (#854) fusionnées. **M1a-3** = ticket #858 (backend avec frontend : badge « à confirmer » à la lecture, filtres des lecteurs de `trip_versions.snapshot`, voyages simulés de Rome, `CHAINE_APERCU` passée à `"inversee"`, critères 9 et 15 ; récit non envoyé tant que Q636/Q645 sont sans réponse ; agent lancé 04:25 UTC). **M1f-TL** = ticket #859 (Tech Lead, décision 0141 : table et rôle de #857 actés, seuils, débit par session par `action_rate_limits`, purge et conservation d'au moins 40 jours, coûts Google dérivés des compteurs (option A, CEO), Q626 rappelée au Product Owner ; agent lancé 04:25 UTC). Puis M1f (code), M1b, M1e, M1g, M7a, M4-spec et M5-spec. Pas de M1-D (0136 T5).
- **MVP étape 1 (paiement)** : B4b (#836) fusionnée. **B4b-ci** = PR #853 (#843, `ci.yml` : 404 du webhook simulé sans drapeau, refus de démarrer avec le drapeau sur l'image, exception A26 testée) : **techlead-approved** 01:15 UTC, attend le libellé `owner-approved` de Samuel (décision 0035) ; ferme #831 après fusion. B4c-TL = PR #848 (#845, décision 0140) : correction 2 (dernière) poussée 02:28 UTC (`deced8b`) ; revue 02:16 UTC : **Tech Lead approuve**, Sécurité 1 bloquant tardif non compté (reprise après panne sans session limitée à 120 s après la création de la ligne : règle (a) retenue) et 8 mineurs ; **correction lancée** 04:15 UTC. Puis B4c.
- **MVP étape 2 (e-mails)** : M2-S (#840) et M2a (#850) fusionnées. Action S1 de Samuel quand M1h sera fusionnée (§ 11 du plan). M7a (e-mail « aperçu prêt », Mailpit) après M1a-3.
- **Mise en ligne main → p0-reel (#837)** : attend la fusion par Samuel ; ensuite un seul réglage Vercel (protection des préversions, 0135 § 9 : contournement ciblé `/p/` de préférence) pour que son amie ouvre le lien, puis le lien du voyage de Tokyo.
- **Réglages fins du programme (#800)** : en ligne depuis #816. Reste à lire : le journal du prochain lancement de Samuel une fois le quota Google rétabli (`sitesUnchecked`, `retoursDeQuartier`). Questions Q630 à Q633.
- **#527 `[data]`** (`coords-purge`) : bloqué sur Q438 (Samuel) ; toujours en échec (dernier passage 20:16 UTC).
- Toujours en attente : #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595), Q618. Q261 et Q262 sont à réconcilier avec F13.

## Bloqué
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** : Q438.

## Prochain cycle
1. Revues : #848 (0140, bloquant tardif corrigé) ; #858 M1a-3 et la décision 0141 (#859) quand elles sont ouvertes. #853 : fusion automatique dès le libellé de Samuel. Après #848 : B4c (backend, sans compte). Après 0141 : M1f (backend). Après #858 : M1b, M1e, M1g, M7a (Mailpit), M4-spec et M5-spec (Product Owner), puis M1c (question 5 de #829) et M1h.
2. #837 : dès la fusion par Samuel, vérifier le déploiement `p0-reel`, puis lui demander un seul réglage Vercel (lien de partage) et lui envoyer le lien du voyage de Tokyo.
3. Lire les réponses de Samuel aux questions Q634 à Q641 (carte « Je suis tes recos ») ; Q638 bloque M1c ; Q645 (extension de Q636) bloque M1h.
4. Zakynthos absent de « Mes voyages » : toujours en attente de la capture de Samuel. #527 : Q438.

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
- Q662 à Q664 (M1f-D #857 : découpage des compteurs et débit par session pour le Tech Lead, rôle dédié et conservation pour la Sécurité, comptage des coûts Google tranché par le CEO : option A, dérivés des compteurs ; les trois sont portées par la décision 0141 en cours). Q626 (62 villes) rappelée au Product Owner : elle bloque M1f.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
