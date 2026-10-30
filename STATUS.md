# État du studio — 2026-10-30 (237e cycle)

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
- 2026-10-29 05:44 UTC « Tout est fait » (fil du cycle) : Samuel a fusionné #837 (`p0-reel` à 8a928a7, déploiement vérifié prêt à 05:29 UTC) et posé `owner-approved` sur #853 (fusionnée). Répondu 05:55 UTC avec le seul réglage Vercel à faire pour le lien de son amie (exception de protection pour le domaine du site d'essai, décision 0135 point 9) et la marche à suivre « Partager » → « Créer un lien » sur le voyage de Tokyo. Carte Q634 à Q641 toujours sans réponse.
- 2026-10-29 08:15 UTC : aucun nouveau message (#studio et fil du cycle). Carte Q634 à Q641 sans réponse ; lien de partage de Tokyo : pas de retour de Samuel.
- 2026-10-29 10:10 UTC : aucun nouveau message (#studio et fil du cycle). Carte Q634 à Q641 sans réponse ; lien de partage de Tokyo : pas de retour.
- 2026-10-29 12:15 UTC : aucun nouveau message. #866 (M1i) approuvée par le Tech Lead et la Sécurité : demande d'`owner-approved` et marche à suivre S3 (rejeu de `roles.sql`, puis workflow `db-migrate`) envoyées à Samuel dans le fil du cycle à 12:20 UTC.
- 2026-10-29 14:15 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-29 16:15 UTC : aucun nouveau message (#studio : seule l’annonce automatique de la version v2026.10.29-09 ; fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-29 18:10 UTC : aucun nouveau message (#studio et fil du cycle). Rappel envoyé à Samuel à 18:25 UTC pour l’`owner-approved` de #866 puis S3 (un message). Carte Q634 à Q641 sans réponse.
- 2026-10-29 20:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` (rappel de 18:25 UTC) ; carte Q634 à Q641 sans réponse.
- 2026-10-29 22:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 00:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` (rappel du 29 à 18:25 UTC) ; carte Q634 à Q641 sans réponse.
- 2026-10-30 02:10 UTC : aucun nouveau message (#studio : seule l’annonce automatique de la version v2026.10.29-21 ; fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 04:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 06:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 08:10 UTC : aucun nouveau message (#studio et fil du cycle). Second rappel envoyé à Samuel à 08:35 UTC dans le fil du cycle : poser `owner-approved` sur #866 puis lancer S3. Carte Q634 à Q641 sans réponse.
- 2026-10-30 10:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 12:20 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 14:40 UTC : aucun nouveau message (#studio : seule l’annonce automatique de la version v2026.10.30-09 ; fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.

## Fait
- **Statut du 233e cycle** (#925) fusionné.
- **M4-C** (#918) fusionnée : contrat `transfer` (`TransferItemSchema`, borne `estimatedMinutes` 600), `Trip.cities`, `MAX_CITIES = 3`, cas « recopié tel quel » de `patch.ts` et `calculs.ts`, `transfer` retiré de la vue partagée et de sa projection, jeu `mock` Rome puis Florence.
- **M4a** (#921) fusionnée : prompt `programme` v5 multi-villes, entrée v5 stricte, champ `jours[].dureeEstimeeMinutes` contrôlé (20 à 600), jeu d’évaluation simulé ; rien n’est branché avant M4b.
- **Décision 0151** (#924, Tech Lead) fusionnée : compléments du contrat (borne, liste fermée complétée, paramètre `voisins` levé, parcours de `Day.items` pour M4b, règle `no_option` provisoire, condition T-M4S-2).
- **Spécification M4-suite** (#916, Product Owner) fusionnée après deux corrections : règles de la journée du changement de ville (départ estimé 10:00 au plus tôt, créneau 180 min, marges, long changement de ville, bandeau de chevauchement en `status`), aide de l’écran 1, carte à plusieurs villes posée à l’UX/UI (décision 0150), quatre tâches de code. Répond à Q710, Q726, Q728, Q729.
- **Statut du 236e cycle** (#940) fusionné.
- **M4b** (#932, ticket #928) fusionnée après une correction : génération v5 branchée pour les voyages à deux villes ou plus, révision multi-villes sur la v3, « Temps libre » depuis la fin occupée, tests des critères 6, 9, 11 et de la règle du patch (CI relancée une fois, Q756).
- **M4-suite-back** (#944, ticket #942) fusionnée : journée du changement de ville côté serveur (départ estimé 10:00 au plus tôt, créneau 180 min, marges, long changement de ville, bandeau de chevauchement en `status`).
- **Statut du 235e cycle** (#936) fusionné.
- **Amendement de la décision 0148** (#937, ticket #935, Tech Lead) fusionné : prompt v5 réservé aux voyages à deux villes ou plus (prédicat unique `briefAPlusieursVilles`, `src/server/programme/forme.ts`), départ par défaut du jour de changement de ville à 10:00, critère 8 de la spécification M4 aligné.
- **Statut du 234e cycle** (#929) fusionné.
- **M4a-2** (#931, ticket #926) fusionnée : prompt `revision` v3 multi-villes (la v2 du site d’essai inchangée), entrée v3 stricte sans libellé de billet ni récit (refus avant toute requête, quel que soit `RECIT_API_AUTORISE`), lecture commune de la durée estimée (v5 et v3), jeu d’évaluation simulé `evals/revision-v3/`, paramètre facultatif `{ recit }` de `projectionBriefV5` pour M4b.
- **M5a** (#923, ticket #919) fusionnée après une correction : verrou sur `api` (R3 rejouée sur la révision M1b, défaut réel corrigé dans `etapes-revision.ts` : rien n’est écrit si R3 est violée ; M1c tenait), fiche à `commitment` en lecture seule sur `api` (`mock` inchangé), trois tests d’écran, « Annuler » gardé avec le plafond de 200 versions, captures simulées `docs/ux/captures/923/`.
- **Version v2026.10.30-09** (#933, routine Release) fusionnée.
- **Statut du 232e cycle** (#917) fusionné.
- **Décision 0149** (#915, Sécurité) fusionnée : S-M4-1 à S-M4-5 acceptés sous conditions (le libellé du billet de changement de ville ne part jamais au modèle ; durée estimée lue seulement si nombre JSON entier de 20 à 600 ; `transfer` retiré de la vue partagée et de sa projection ; heures de fin projetées champ par champ). Répond à Q725. M4a, M4b et M4c débloquées côté Sécurité ; l’usage réel reste conditionné à Q636, Q645, Q731.
- **M5e** (#908) fusionnée : liste « À faire avant de partir » écrite à la génération et suivie à chaque version.
- **Statut du 231e cycle** (#911) fusionné.
- **M4-TL** (#907, décision 0148) fusionnée après la correction 2 : forme `transfer`, durée estimée par l’IA sous contrôle, un forfait par voyage, 3 villes au plus, couche des règles du changement de ville dans le code (`changement-de-ville.ts`, `moteur.json`), vérification par ville (`zoneDe(lieu)`), ville d’un engagement déduite par l’heure. Elle répond à Q703, Q712 et Q718.
- **Statut du 230e cycle** (#910) fusionné.
- **M5c** (#909, ticket #904) fusionnée : signaler une erreur sur une étape (`reportStop`, feuille accessible, confirmation, lien « Remplacer », plafonds 20 par voyage et par jour UTC et 10 par minute par adresse IP, événement `voyages.stop_reported`), captures `docs/ux/captures/904/`, références visuelles régénérées.
- **Statut du 229e cycle** (#906) fusionné.
- **Statut du 228e cycle** (#901) fusionné.
- **M5-C** (#900, ticket #895) fusionnée : contrats des retouches (`Change` étendu, `changements()` sans `removed` pour un remplacement, `not_unlocked`, `StopReport`, recherche de lieu, `ChecklistItem.kind`), test du remplacement sur l’aperçu M1g d’`api`.
- **M4-spec** (#876, ticket #872) fusionnée : spécification « plusieurs villes », avec les points reportés à M4-TL par le CEO (Q703, Q712, Q718) et les mineurs restants à reporter à M4-TL ou M4-suite.
- **PR docs du CEO** (#898) fusionnée : plan aligné (M5-C, M5-D, M5d-1/M5d-2, M5e, M1e/M1h, M4-suite, B4e), CONTEXT.md principe 1, 0078 § 2 et 0097 (Q661).
- Version v2026.10.29-21 (#902).
- **Statut du 227e cycle** (#897) fusionné.
- **M5-D** (#899, ticket #896) fusionnée : migration 0022 (`feedback` durcie : `request_id`, index uniques partiels, `CHECK`, `REVOKE UPDATE` ; colonne `lieux` des compteurs), Tech Lead et Sécurité approuvés sans correction ; ligne `MIGRATIONS_APPROUVEES` par une PR de workflow séparée après #866 (Q713).
- **Statut du 226e cycle** (#894) fusionné.
- **M5-TL** (#893, ticket #891, décision 0147) fusionnée : T1 à T11, S1 à S5 confirmés par la Sécurité, découpage M5-C ∥ M5-D → M5e → M5a → M5b/M5c → M5d-1 → M5d-2 ; exception « une spécification, plusieurs tâches » accordée pour M5.
- **B4d-TL** (#890, ticket #886, décision 0144) fusionnée : option B pour le reçu Stripe, motif à hôte contigu, `.npmrc` `minimum-release-age`.
- **Statut du 225e cycle** (#892) fusionné.
- **M1g** (#877, ticket #869, décision 0145) fusionnée : aperçu de révision avec `candidateId`, journée touchée replanifiée.
- **M1f** (#885, ticket #880, décision 0146) fusionnée : ville par autocomplétion sur `api`, textes `hors_table`.
- **Statut du 224e cycle** (#889) fusionné.
- **M5-spec retouches** (#874) : PR #881 fusionnée à 12:25 UTC (6bd8a6b) après deux corrections et une troisième tentative bornée (Q691) : `specs/M5-retouches.md` (verrou, retour à une version comme exception nommée, lieu à soi, signalement, « À faire ») ; questions T1 à T11 et S1 à S5 reprises par M5-TL (#891).
- **M1e photos du tri sur `api`** (#879) : PR #882 fusionnée à 13:03 UTC (93ee49a) après une correction et un bloquant tardif : décision 0143 (barrière fermée, lieu lu en base, cadence `photo-tri`, attribution Google, client branché par M1h sous condition de la réponse de Samuel à F13-Q4, Q696).
- **Statut du 223e cycle** (#888) fusionné.
- **M1b « Pas pour moi » sur `api`** (#868) : PR #875 fusionnée à 10:51 UTC (c241ef4) après une correction : la révision réutilise `publier` (contrôle `ecrireSi`), profil de forfait `revision`, décision 0142 (erratum de 0136 : § 4.4, règle « une révision », limites, verdict Sécurité). Questions Q692 à Q694.
- **B4d reçu simulé** (#878, partie 1) : PR #884 fusionnée à 11:15 UTC (89e4bd5) après une correction (captures 390×844 sous `docs/ux/captures/878/`, heure de Zurich) : page `/voyages/[id]/debloquer/recu`, liens « Voir le reçu », contrat `Receipt`, méthodes facultatives du port. Le reçu Stripe suit (#886 puis #887).
- **Statut du 222e cycle** (#871) fusionné.
- **M1f-TL décision 0141** (#859) : PR #861 fusionnée à 08:30 UTC (9abf68e) après la troisième tentative bornée (Q675) : autocomplétion de ville sur `api`, `SEUILS_AUTOCOMPLETION_VALIDES = false`, crochet `accesReelApi()` toujours faux jusqu'à M1h, § 8 ter (politique et rôle de 0021, liste fermée de 0007 amendée).
- **M7a e-mail « propositions prêtes »** (#870) : PR #873 fusionnée à 08:51 UTC (56a560f) : quatrième étape du workflow `etapeApercuPret`, idempotence par écriture conditionnelle de `updated_at` (aucune migration), événement `email.notification_failed`, texte dans `src/i18n/fr/emailApercu.json`. Questions Q677 à Q679.
- **Note de version v2026.10.29-09** (#883, Release) fusionnée à 09:54 UTC (e428115).
- **Statut du 221e cycle** (#865) fusionné.
- **M1a-3 lecture et bascule de la chaîne inversée** (#858) : PR #862 fusionnée à 06:47 UTC (8b89995) après une correction (option 1 du Tech Lead : erratum de tête de 0136 pour le seul voyage non débloqué d'Édimbourg, journées 3 à 6 en page introuvable sur `api` ; attente du test `generation-api` corrigée : jours verrouillés « à débloquer »). **M1a est complète : la chaîne inversée tourne sur `api`, en simulé.**
- **B4c adaptateur Stripe en mode test** (#863) : PR #867 fusionnée à 07:52 UTC (a936717 ; `stripe` 23.0.0, webhook `/api/v1/webhooks/stripe` signé, session en trois étapes, reprise 120 s, lignes de confinement, option A, C7 ; 0006 et 0020 amendées, spec B4 corrigée ; Tech Lead et Sécurité approuvent, 7 mineurs en suivi pour B4d, dont le bruit `libc:` du lockfile et le garde `objet` dupliqué). L'essai réel C6 attend Q26, Q353, S5 et M1h.
- **Mise en ligne #837** fusionnée par Samuel (`p0-reel` à 8a928a7 : voyage lisible sans Google, partage par lien signé, décision 0135).
- **B4b-ci** (#843) : PR #853 fusionnée vers 05:45 UTC après le libellé `owner-approved` de Samuel (b62e7b8 ; `ci.yml` : 404 du webhook simulé sans drapeau, refus de démarrer avec le drapeau, exception A26). Note à reporter dans 0078 § 2 et 0097 (Q661).
- **B4c-TL décision 0140** (#845) : PR #848 fusionnée à 05:53 UTC (121acd0) après une troisième tentative bornée décidée par le CEO avec le Tech Lead (pas de découpage possible pour une décision ; le bloquant 1 venait du correctif tardif) ; les 4 mineurs de la dernière revue sont repris par le ticket B4c.
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
- **MVP étape 1 (génération)** : M1a (#847, #854, #862), M1b (#875), M1e (#882), M1g (#877) et M1f (#885) fusionnées. **M1i** = PR #866 (#864) : approuvée, attend l’`owner-approved` de Samuel puis S3 (second rappel le 30 à 08:35 UTC). **M4** : spec (#876), 0148 (#907) et son amendement (#937), 0149 (#915), M4-C (#918), M4a (#921), 0151 (#924), M4-suite (#916), M4a-2 (#931), M4b (#932) et M4-suite-back (#944) fusionnées. **M4c** = PR #945 (ticket #941, écrans multi-villes) : `techlead-approved`, fusion automatique armée, CI en cours ; marge du budget JS réduite à 155 o sur R11 et R12 (tâche Tech Lead/QA avant M4-suite-front, Q760). **M4-suite-UX** = PR #930 (ticket #927, décision 0150) : approuvée par le Tech Lead, bloquant tardif (règle de non-chevauchement des libellés) en correction, non compté. Ensuite M4-suite-front (dès M4c et la tâche budget), puis M4-suite-carte au cycle suivant (avec la coupe de `buildDayRoute`, 0151 § 4). **M5** (décision 0147) : M5-D (#899), M5-C (#900), M5c (#909), M5e (#908) et M5a (#923) fusionnées ; **M5b** = PR #938 (ticket #934, versions) : Tech Lead approuvé, bloquants tardifs en correction (texte `chargement`, retour à la liste de « trop », reprise des captures), non comptés ; **M5d-1** = PR #943 (ticket #939, lieu à soi côté serveur) : correction 1 en cours (réinjection des étapes de la personne avant R3 dans `etapes-revision.ts`, tests manquants, tâche `db`). Ensuite M5d-2 (dès M5d-1), « Déplacer une étape sur `api` » (Q721, dès M5b). M1c attend Q638 ; M1h attend M1c, Q645 et Q696.
- **MVP étape 1 (paiement)** : B4b (#836), B4b-ci (#853), 0140 (#848), B4c (#867), B4d reçu simulé (#884) et B4d-TL (#890, décision 0144) fusionnées. **B4e** = ticket #887 (data puis back, migration d’abord) : la partie `data` part au prochain cycle libre de `db/migrations`, après la fusion de #866 (0144 § 7).
- **MVP étape 2 (e-mails)** : M2-S (#840), M2a (#850) et M7a (#873) fusionnées. Action S1 de Samuel quand M1h sera fusionnée (§ 11 du plan).
- **Mise en ligne main → p0-reel (#837)** : attend la fusion par Samuel ; ensuite un seul réglage Vercel (protection des préversions, 0135 § 9 : contournement ciblé `/p/` de préférence) pour que son amie ouvre le lien, puis le lien du voyage de Tokyo.
- **Réglages fins du programme (#800)** : en ligne depuis #816. Reste à lire : le journal du prochain lancement de Samuel une fois le quota Google rétabli (`sitesUnchecked`, `retoursDeQuartier`). Questions Q630 à Q633.
- **#527 `[data]`** (`coords-purge`) : bloqué sur Q438 (Samuel) ; toujours en échec (dernier passage 20:16 UTC).
- Toujours en attente : #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595), Q618. Q261 et Q262 sont à réconcilier avec F13.

## Bloqué
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** : Q438.

## Prochain cycle
1. Revues : #945 (M4c) : vérifier la fusion automatique ; #943 (M5d-1, correction 1 ; si encore bloquée, correction 2, dernière) ; #938 (M5b) et #930 (0150) : bloquants tardifs, relabel dès la poussée ; #866 attend Samuel. Dès M4c et M5b : tâche budget JS (Tech Lead/QA, Q760), puis M4-suite-front ; dès 0150 et M4c : M4-suite-carte au cycle suivant (`sejour.json`, coupe de `buildDayRoute`). Dès M5b : « Déplacer une étape sur `api` » (Q721) ; dès M5d-1 : M5d-2 (avec l’addendum 0147 § 4, Q758). 0150 à citer dans la prochaine note de version. Après #866 : B4e-data (#887) et la PR de workflow `MIGRATIONS_APPROUVEES` pour 0022.
2. Vérifier que Samuel a posé `owner-approved` sur #866 et lancé S3 (rappels du 29 à 18:25 UTC et du 30 à 08:35 UTC ; pas de troisième rappel avant le 31). Vérifier le lien de partage de Tokyo. Vercel a de nouveau refusé les déploiements de préversion le 30 à 06:41 UTC (« api-deployments-free-per-day » ; le statut Vercel n’est pas requis pour la fusion) ; à signaler à Samuel si cela gêne un lien d’essai (Q727).
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
- Q757 à Q764 (Sécurité : coût du Text Search Pro dans `plafonds` pour le lieu à soi, `resultId` non revérifié, seau `no-trusted-ip` à M1h. Tech Lead : addendum 0147 § 4 sur les relectures de l’ajout ; fixtures serveur à deux villes pour le critère 23 sur `api`, villes dans `GenerationStatus`, extension du motif ESLint ; marge du budget JS de 155 o ; marges d’`appliquerPatch` (0151 § 5.2) et `end` dans `Day.events`. Product Owner : fin du terminus à 22:30, persistance du `mock` de M5d-1 ; textes `chargement` et `revenirNomme` de M5b et sortie unique de l’aperçu avec l’UX/UI). Arbitrages du CEO : la coupe de `buildDayRoute` va à M4-suite-carte ; correction 1 de M5d-1 avec la réinjection avant R3 ; bloquants tardifs de M5b et 0150 non comptés ; tâche budget JS avant M4-suite-front.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
