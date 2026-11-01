# État du studio — 2026-11-01 (258e cycle)

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
- 2026-10-30 16:45 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 18:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 20:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-30 22:15 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 00:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 02:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 04:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 attend toujours son `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 06:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 et la PR de workflow #977 attendent leur `owner-approved` (troisième rappel envoyé le 31 à 04:32 UTC) ; carte Q634 à Q641 sans réponse.
- 2026-10-31 08:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 10:10 UTC : aucun nouveau message de Samuel (#studio : note de version v2026.10.31-09 postée par la routine Release à 09:55 UTC). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 12:12 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 14:08 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 16:10 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 18:08 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 20:08 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-10-31 22:08 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641 sans réponse.
- 2026-11-01 00:09 UTC : aucun nouveau message (#studio : seule la note de release v2026.10.31-21 ; fil du cycle vide). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641, Q814 et Q815 sans réponse.
- 2026-11-01 02:08 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641, Q814, Q815 et Q818 sans réponse.
- 2026-11-01 04:08 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641, Q814, Q815 et Q818 sans réponse.
- 2026-11-01 06:08 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641, Q814, Q815 et Q818 sans réponse.
- 2026-11-01 08:08 UTC : aucun nouveau message (#studio et fil du cycle). #866 et #977 attendent toujours leur `owner-approved` ; carte Q634 à Q641, Q814, Q815 et Q818 sans réponse. Message envoyé à Samuel à 08:40 UTC dans le fil du cycle : ajouter le contrôle `db` aux contrôles requis de la règle de `main` (Q827).

## Fait
- **Statut du 233e cycle** (#925) fusionné.
- **M4-C** (#918) fusionnée : contrat `transfer` (`TransferItemSchema`, borne `estimatedMinutes` 600), `Trip.cities`, `MAX_CITIES = 3`, cas « recopié tel quel » de `patch.ts` et `calculs.ts`, `transfer` retiré de la vue partagée et de sa projection, jeu `mock` Rome puis Florence.
- **M4a** (#921) fusionnée : prompt `programme` v5 multi-villes, entrée v5 stricte, champ `jours[].dureeEstimeeMinutes` contrôlé (20 à 600), jeu d’évaluation simulé ; rien n’est branché avant M4b.
- **Décision 0151** (#924, Tech Lead) fusionnée : compléments du contrat (borne, liste fermée complétée, paramètre `voisins` levé, parcours de `Day.items` pour M4b, règle `no_option` provisoire, condition T-M4S-2).
- **Spécification M4-suite** (#916, Product Owner) fusionnée après deux corrections : règles de la journée du changement de ville (départ estimé 10:00 au plus tôt, créneau 180 min, marges, long changement de ville, bandeau de chevauchement en `status`), aide de l’écran 1, carte à plusieurs villes posée à l’UX/UI (décision 0150), quatre tâches de code. Répond à Q710, Q726, Q728, Q729.
- **Statut du 257e cycle** (#1027) fusionné.
- **M6c** (#1024, ticket #1021, backend) fusionnée après une correction : rappels la veille (accord et retrait, workflow durable `rappelsVeille`, relais tous les 7 jours borné à 24 essais, e-mails par le port, interrupteur dans le Séjour, limite `rappels-accord`, durées injectables `RAPPELS_ACCELERATION` en `local` et `ci`, test de bout en bout sur le monde local du Workflow SDK), garde `RAPPELS_ENVOI_REEL` à faux : aucun envoi réel avant Q798 et Q799 ; Sécurité et UX/UI approuvées (U2 et U3 définitives, 0093).
- **#1019** (#1022, data) fusionnée après une correction : contrat aligné sur la base, aucune migration, `toConfirm` dérivée des horaires Google à la lecture ; **décision 0159** (sens de l'alignement, Tech Lead avec le PO) fusionnée avec elle.
- **M8-spec** (#1026, ticket #1025, Product Owner) fusionnée après une correction : `specs/M8-apres-le-voyage-api.md` (écran 16 « Après le voyage », avis rapide M8a, adresse découverte M8b, mémoire des goûts sur accord révocable M8c ; tâches M8-TL, M8-C, M8-D, M8a, M8b, M8c-1, M8c-2 ; répond à Q717).
- **Décision U3** (#1030, UX/UI, Q819) fusionnée : texte élargi de la limite de création d'un lien privé porté dans M6 § 7 ; U2 et U3 des rappels marquées définitives.
- **Statut du 256e cycle** (#1023) fusionné.
- **M6a** (#1018, ticket #1013, backend) fusionnée après deux corrections : lien privé sur `api` (`share_links`, création et révocation, limites `partage-lien` et `partage-vue`), vue `/p/` sans carte (Q814) ouverte en `local` et `ci` seulement tant que M1h n'a pas posé `TRUSTED_IP_HEADER`, en-tête de comptage signé, tests de base et de bout en bout ; Sécurité et UX/UI approuvées ; la décision U3 (Q819) reste à prendre.
- **Statut du 255e cycle** (#1020) fusionné.
- **M6c-D** (#1015, ticket #1014, data) fusionnée après correction 1 : migration `0024_rappels` (tables `reminder_consents` et `reminder_sends`, `INSERT` par colonnes, `withdrawn_at` posé par la base, trois politiques par personne, clé vers `memberships`, purge de 0015 étendue, descente partielle), empreinte `5218eb24…9248` ; Sécurité et Tech Lead approuvés ; mineurs 1, 3 et 4 repris par M6c.
- **Statut du 254e cycle** (#1017) fusionné.
- **Correctif CI** (#1016, ticket #1012, qa, non compté) fusionné : `main` est de nouveau vert sur le job `db` (le scénario `api` de `calendrier-api.api.spec.ts` joint maintenant le cookie de session `Secure` et ne suit plus les redirections).
- **Statut du 253e cycle** (#1010) fusionné.
- **M6b** (#1007, ticket #1005, backend avec frontend) fusionnée après correction 1 : ajouter au calendrier, fichier `.ics` par `GET /api/v1/voyages/[id]/calendrier`, `instantLocal`, limite `calendrier` (30 par heure et par voyage), bouton du Séjour (U1/U3 définitifs, 0093). **Fusionnée avec le job `db` rouge** (scénario `api` de `calendrier-api.api.spec.ts`) : correctif #1016 (ticket #1012, non compté) en revue.
- **M6a-D** (#1011, ticket #1009, data) fusionnée : migration `0023_lien_prive_partage` (0157 T5 et T9 ; 0158 § 2 : droit par colonnes sur `entitlements`, politique `entitlements_fn_share_views`, vues `shared_trip` / `shared_trip_version`, `.down.sql`), tests 0158 § 4.1 ; 0158 amendée (« Correction 2 », quatre mineurs). Sa ligne `MIGRATIONS_APPROUVEES` (`1e5ba834…b3e1`) attend la PR de workflow (après #866, même fichier).
- **Statut du 252e cycle** (#1006) fusionné.
- **Décision 0158** (#1004, ticket #1002, Sécurité avec le Tech Lead) fusionnée après correction 1 : option (a), condition `EXISTS` sur `entitlements` `kind = 'tripUnlocked'` dans `shared_trip` / `shared_trip_version`, `GRANT SELECT (organization_id, trip_id, kind)` et politique `entitlements_fn_share_views` pour `vadrouille_fn_share_views`, même suite de requêtes puis 404 ; migration portée par M6a-D ; 4 mineurs renvoyés à M6a-D.
- **Release v2026.10.31-21** (#1008) fusionnée.
- **Statut du 251e cycle** (#1003) fusionné.
- **Décision 0157** (#987, ticket #986, Tech Lead) fusionnée après scission (Q813) : T1 à T9 (option A `share_links` sur `api`, `.ics` par `GET /api/v1/voyages/[id]/calendrier`, un workflow de rappels par accord, retrait d’un rappel et désactivation d’un lien jamais refusés par les limites), S1 à S7 confirmées par la Sécurité, Q678 confirmée ; le refus de `/p/` pour un voyage reverrouillé est renvoyé à 0158. Débloque M6b ; M6a attend 0158 et M6a-D ; M6c attend M6c-D et M6b.
- **Statut du 250e cycle** (#1001) fusionné.
- **Statut du 249e cycle** (#999) fusionné.
- **Dette Q810** (#1000, ticket #998, backend) fusionnée : `ajoutVerrouille` dans `src/server/versions/formes.ts` partagée par `estUnAjout` et `formeAdmise` ; aides `Issue`/`refus`/`conflit` regroupées dans `src/server/versions/issue.ts` (copies retirées de cinq fichiers) ; aucun changement de comportement.
- **Statut du 248e cycle** (#997) fusionné.
- **M5d-6** (#996, ticket #994, backend avec frontend) fusionnée après une correction : `undoAddPlace` (0155 § 4.1), contrat strict `AddPlaceUndo`, cas d’usage `annulerAjout` (réutilise `moteurDuRetour`), « Annuler » du toast sur `api`, alignements du handover front § 12, de `specs/M5-retouches.md` l. 216 et du commentaire `Refus` ; limite connue : le rejeu ne rend pas les lignes « À faire » (comme `applyRevert`).
- **Budget JS** (#992, ticket #991, frontend) fusionnée : `GoogleMapRenderer` chargé à la demande, échec de l’`import()` en état « erreur » avec « Réessayer » ; R-ajouter 193 270 o, R12 190 103 o, R11 189 807 o (gain > 5 000 o par route).
- **Statut du 247e cycle** (#995) fusionné.
- **Statut du 246e cycle** (#989) fusionné.
- **Release v2026.10.31-09** (#993, routine Release) : note de version de 1f626c9 à 64b0b32 (38 commits, dont 14 de code), déploiement `READY`.
- **M5d-5b, cause du refus d’ajout à l’écran** (#990, ticket #988, frontend) fusionnée le 2026-10-31 : textes de 0154 § 1 par cause (`place_not_found`, `place_closed`) dans le bandeau `noOption`, `place_added` (`method: "button"`) envoyé une fois après une application aboutie, `ADDED_STOP_NAME_MAX` de `@/contracts/values` ; R-ajouter 198 384 o, R12 195 230 o, R11 194 939 o gzip.
- **Statut du 245e cycle** (#983) fusionné.
- **M5d-4, relecture du lieu réinjecté** (#980, ticket #976, backend) fusionnée le 2026-10-31 après une correction : segments autour du lieu réinjecté au mode du brief, « Temps libre » réécrit seulement aux bornes du lieu ou d’une ligne retirée (0156 § 2), `ligneDuJourCoherente` (ordre et chevauchement limités aux paires contenant un lieu réinjecté, structure sur tout le jour), événement de journal `recalcul.lieux_a_soi` approuvé par la Sécurité.
- **M5d-3, entrées restantes de « Ajouter un lieu »** (#973, ticket #969, frontend) fusionnée le 2026-10-31 après une correction : « Choisir » sur un repas pas encore choisi, `?idee=` (recherche préremplie, 0154 § 6), second ajout sur `mock` en mémoire de page par la pose partagée `src/lib/pose-ajout.ts` (0156 § 1), rendu de « Choisir » écrit dans F7 ; R11 190 564 o, R12 190 855 o, R-ajouter 193 486 o avant la fusion de `main`.
- **Décision 0156** (#984, ticket #981, Tech Lead) fusionnée le 2026-10-31 : moyen du second ajout sur `mock` (mémoire de page, pose unique dans `src/lib`, aucune arête nouvelle vers `src/domain`), amendement de 0155 § 2.2 et § 2.3, cause en portée `complete` renvoyée à Q332 (fait nouveau : cette portée refuserait tout ajout de lieu).
- **Spécification M6 « pendant le voyage » sur `api`** (#985, ticket #982, Product Owner) fusionnée le 2026-10-31 : lien privé par `share_links` (jeton haché, révocable, fin du voyage + 30 jours), calendrier `.ics` (nom maison seulement), rappels (e-mail la veille à 18 h sur accord, workflow durable avec `sleep`) ; tâches M6a, M6b, M6c ; questions T1 à T9, S1 à S6, U1 à U4.
- **Statut du 244e cycle** (#978) fusionné.
- **M4-suite-carte** (#974, ticket #968, frontend) fusionnée le 2026-10-31 après une correction : carte d’ensemble à plusieurs villes et carte de la Journée d’un changement de ville (0150), `CityLabel`, choix des villes, `buildDayRoute` calculé une fois, recentrage borné à 1 s ; R11 194 675 o, R12 194 920 o, R-ajouter 197 418 o gzip ; les lignes 404 des pages `/dev/carte/villes` sont dans la PR de workflow #977 (attend Samuel).
- **M5d-5a** (#979, ticket #975, backend) fusionnée le 2026-10-31 : `ApiError.cause` (`no_room`, `place_not_found`, `place_closed`) décidée après la relecture et avant le moteur, `NO_OPTION_CAUSES` et `ADDED_STOP_NAME_MAX` dans `@/contracts/values`, `etatDuLieuAjoute` dans le domaine, tests DB des trois états de fiche.
- **Statut du 243e cycle** (#971) fusionné.
- **« Déplacer une étape » sur `api`** (#953, ticket #947) fusionnée le 2026-10-31 après une troisième tentative bornée : déplacement par le moteur et la relecture (0153), feuille « Déplacer » avec l’état « points indisponibles » consigné dans la spécification ; R11 190 360 o, R12 190 606 o.
- **Décision 0155** (#972, ticket #970, Tech Lead avec Sécurité) fusionnée le 2026-10-31 : `ApiError.cause` (`no_room`, `place_not_found`, `place_closed`) avec `no_option` seulement, fiche illisible → `provider_error` ; tâches M5d-5a (serveur) et M5d-5b (écran), M5d-4 (relecture du lieu réinjecté) et M5d-6 (`undoAddPlace`), toutes prérequis de M1h sauf M5d-5b ; `?idee=` admis au regard de S2 sous quatre conditions.
- **Statut du 242e cycle** (#966) fusionné.
- **Décision 0153** (#959, ticket #957, Tech Lead) fusionnée le 2026-10-31 : « Déplacer une étape » sur `api` passe par le moteur et la relecture ; deux relectures par déplacement abouti ; la contrainte « aucun appel payant » du ticket #947 est écartée pour une raison technique, à confirmer par Samuel (Q776).
- **Décision 0154** (#967, ticket #965, Product Owner avec UX/UI) fusionnée le 2026-10-31 : un texte de refus par cause pour « Ajouter un lieu », `no_option` affiche « Pas de place à ce moment-là… » tant que le contrat ne porte pas la cause, écart à F7-PO-11 accepté, tâches de suivi « cause du refus d’ajout », M5d-3 et M5d-4 (les deux premières et M5d-4 prérequis de M1h) ; proposition à Samuel (Q332, Q771) : refuser un lieu introuvable ou fermé.
- **M5d-2, écran « Ajouter un lieu »** (#964, ticket #961, frontend) fusionnée le 2026-10-31 après une correction : recherche, moment et heure proposée, aperçu, application, toast, « Ajouté par toi. », route R-ajouter (192 811 o), e2e et a11y ; sur `api` la recherche reste fermée (barrière).
- **Statut du 241e cycle** (#962) fusionné.
- **M4-suite-front** (#963, ticket #960, frontend) fusionnée le 2026-10-31 : bandeau de chevauchement de la Journée (`kind` `overlap` de `StatusBanner`, chargé à la demande), aide de l’écran 1, région « Événements du jour » focalisable, jeu simulé `mock_trip_chevauchement` ; R11 189 420 o, R12 189 458 o.
- **Statut du 240e cycle** (#958) fusionné.
- **M4c, écrans à plusieurs villes** (#945, ticket #941) fusionnée le 2026-10-30 à 20:52 UTC, après la fusion de `main` et une nouvelle revue.
- **Addendum 0147 § 4** (#952, ticket #950) fusionné le 2026-10-30.
- **Statut du 239e cycle** (#951) fusionné.
- **Budget JS** (#956, ticket #949, Tech Lead, Q760 et Q768) fusionnée : R11 188 207 o et R12 188 507 o gzip (plus de 11 000 o de marge, limite inchangée) ; pages d’erreur sans `Button`/`Slot`, `buttonVariants` séparé, espace de noms `plaque.json` ; décision 0152 (chargement différé, définitive à la fusion selon 0093). Le retour à l’accueil depuis une page d’erreur recharge la page (à citer dans la note de version).
- **Critère 22** (#955, ticket #954, backend) fusionnée : un ajout de lieu à soi sur une étape verrouillée est refusé `no_option` (`src/domain/patch.ts` : l’exception B5-PO-6 ne vaut que pour un verrou déjà présent dans la version de base) ; tests du moteur et de base.
- **Statut du 238e cycle** (#948) fusionné.
- **M5d-1** (#943, ticket #939) fusionnée après deux corrections : lieu à soi côté serveur (client Text Search et son double, compteurs `lieux` et plafonds, action `lieu.recherche`, aperçu et application `[add, lock]`, réinjection des étapes de la personne avant R3 dans `etapes-revision.ts`, tests de base). Sécurité approuvée. Mineurs reportés à M5d-2 (Q765).
- **Décision 0150** (#930, ticket #927, UX/UI) fusionnée après une correction et deux bloquants tardifs : carte à plusieurs villes (une position par ville, étiquettes placées par `placerEtiquettes` sans recouvrement des terminus, des marqueurs d’étape, de « Retour » et « Partager », relèvement du panneau réservé au focus clavier). À citer dans la prochaine note de version.
- **Statut du 237e cycle** (#946) fusionné.
- **M5b** (#938, ticket #934) fusionnée après une correction et deux bloquants tardifs : écran des versions, retour à une version avec aperçu « Ce qui change », plafond de 200 versions, refus `trop` ramenant à la liste, `chargement` remis à faux si un autre geste interrompt la lecture.
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
- **MVP étape 1 (génération)** : M1a (#847, #854, #862), M1b (#875), M1e (#882), M1g (#877) et M1f (#885) fusionnées. **M1i** = PR #866 (#864) : approuvée, attend l’`owner-approved` de Samuel puis S3 (troisième rappel le 31 à 04:32 UTC). **M4** : tout fusionné ; la PR de workflow #977 (lignes 404 de `/dev/carte/villes`) est approuvée par le Tech Lead et attend l’`owner-approved` de Samuel. **M5** (décision 0147) : tout fusionné, M5d-6 (#996) et la dette Q810 (#1000) comprises. **Budget JS** : #992 fusionnée ; Q807 (addendum à 0152) et Q808 (mesure avec une clé factice) restent au Tech Lead. M1c attend Q638 ; M1h attend M1c, Q645 et Q696 (et doit poser `TRUSTED_IP_HEADER` sur `mvp-essai`, 0157).
- **MVP étape 1 (paiement)** : B4b (#836), B4b-ci (#853), 0140 (#848), B4c (#867), B4d reçu simulé (#884) et B4d-TL (#890, décision 0144) fusionnées. **B4e** = ticket #887 (data puis back, migration d’abord) : la partie `data` part au prochain cycle libre de `db/migrations`, après la fusion de #866 (0144 § 7).
- **MVP étape 6 (pendant le voyage)** : tout est fusionné : spécification M6 (#985), décisions 0157 (#987), 0158 (#1004) et U3 (#1030), **M6b** (#1007), **M6a-D** (#1011), **M6c-D** (#1015), **M6a** (#1018), **#1019** (#1022), **M6c** (#1024), correctif CI #1016. **CI de `main` rouge sur le projet Playwright `api`** depuis #1018 et #1024, fusionnées automatiquement avec leur job `db` rouge (le job `db` n'est pas un contrôle requis de la règle de `main` : Q827, Samuel) : deux correctifs en revue, **#1031** (ticket #1028 : le test de lecture exclut explicitement l'interrupteur des rappels, propre à `api` ; approuvé par le Tech Lead) et **#1032** (ticket #1029 : Next.js retirait l'en-tête de préchargement avant le proxy de `/p/`, `skipProxyUrlNormalize` dans `next.config.ts`, à confirmer par le Tech Lead). Reste pour l'étape 6 : décision du Tech Lead sur le relais des rappels (Q821, table `reminder_relays`, tâche à ouvrir) ; M1h doit poser `TRUSTED_IP_HEADER` sur `mvp-essai` pour ouvrir `/p/` hors `local` et `ci`. Lignes `MIGRATIONS_APPROUVEES` de 0022, 0023 et 0024 : une PR de workflow après #866. Questions pour Samuel : Q814, Q815, Q818.
- **MVP étape 8 (après le voyage)** : **M8-spec** (#1026) fusionnée. **M8-TL** = ticket #1033 (Tech Lead, décision 0160 : T1 à T8) ; en cours. Ensuite M8-C et M8-D (une tâche par cycle sur `db/migrations`), puis M8a, M8b, M8c-1, M8c-2 (Q826). Le CEO doit reporter dans le plan § 8 les tâches M8-TL, M8-C, M8-D et la coupe de M8c (PR docs à venir). Questions Q824 (Samuel) et Q825 (Tech Lead, Sécurité, UX/UI).
- **MVP étape 2 (e-mails)** : M2-S (#840), M2a (#850) et M7a (#873) fusionnées. Action S1 de Samuel quand M1h sera fusionnée (§ 11 du plan).
- **Mise en ligne main → p0-reel (#837)** : attend la fusion par Samuel ; ensuite un seul réglage Vercel (protection des préversions, 0135 § 9 : contournement ciblé `/p/` de préférence) pour que son amie ouvre le lien, puis le lien du voyage de Tokyo.
- **Réglages fins du programme (#800)** : en ligne depuis #816. Reste à lire : le journal du prochain lancement de Samuel une fois le quota Google rétabli (`sitesUnchecked`, `retoursDeQuartier`). Questions Q630 à Q633.
- **#527 `[data]`** (`coords-purge`) : bloqué sur Q438 (Samuel) ; toujours en échec (dernier passage 20:16 UTC).
- Toujours en attente : #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595), Q618. Q261 et Q262 sont à réconcilier avec F13.

## Bloqué
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** : Q438.

## Prochain cycle
1. Revues : #1031 et #1032 (correctifs CI de `main`, projet `api`), PR de M8-TL (#1033) dès son ouverture ; #977 et #866 attendent Samuel. Après #1032 : vérifier que le job `db` de `main` repasse au vert sur la première PR suivante. Après M8-TL : M8-C (contrats) puis M8-D (migration 0025). Décision du Tech Lead sur le relais des rappels (Q821) : ticket à ouvrir. M1h doit poser `TRUSTED_IP_HEADER` sur `mvp-essai` (0157 § 2.1 point 3) ; M1h reste bloquée par M1c (Q638), Q645 et Q696. Après #866 : B4e-data (#887) et la PR de workflow `MIGRATIONS_APPROUVEES` pour 0022, 0023 et 0024. Questions du Tech Lead encore ouvertes : Q807, Q808 (budget).
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
- Q827 (Samuel : ajouter `db` aux contrôles requis de la règle de `main`), Q828 (Tech Lead : confirmer `skipProxyUrlNormalize`, #1032). Q819 tranchée (#1030). Q822 et Q823 closes par la fusion de #1024 (0093). Q826 tranchée au 257e cycle.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
