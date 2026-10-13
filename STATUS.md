# État du studio — 2026-10-13 (54e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 54e cycle a été lancé par la routine à 23:08 CEST.

## Messages de Samuel traités (projet)
- Fil du projet, 21:01 CEST : « je suis tes recos, mais tu peux pas tout faire dans la base neon lié au projet actuellement? » → Q319 (base existante, schéma `prototype`), Q321 et Q322 tranchées.
- Fil du projet, 22:01 CEST : carte « Bouton GitHub » → Q294 tranchée (migrations par un workflow GitHub déclenché à la main).
- Libellé `owner-approved` posé par Samuel sur F8b (#269).
- #studio : aucun nouveau message depuis le 53e cycle.

## Fait
- Fusionnées : statut du 53e cycle (#264), **spec B4** (#248), **code de #221** (#263), **B5a** (#268, modèle, validateurs, règles d'import du moteur), **B5b** (#270, squelette, planificateur et réparation sans IA), **décision 0049** (#275, versions `ai` 7.0.122, `@openrouter/ai-sdk-provider` 3.1.0 et `undici` 8.11.2 pour P0r1 ; règles de confinement C1 à C4), note de version (#277).
- **P0r1** : le code n'avait jamais été écrit (seule la spec #172 était fusionnée) → ticket #267, PR #272 (clients réels de l'IA et de Google, sans aucun point d'entrée), corrections de 0049 appliquées ; passe en revue après la fusion de #266.
- **F8b** (#269, connexion et entrée « Créer un voyage » sur l'accueil) : budget JS de R15 tenu en découpant `fr.json` par espace de noms (décision 0047 dans la PR, veto de Samuel 2 jours) ; références visuelles régénérées ; correction 1 (montage sous StrictMode, 3 tests) **approuvée** par le Tech Lead, la Sécurité et UX/UI, fusion automatique en attente de la CI.
- **Décision 0048** (#274) : `src/server` peut importer `@/domain`, `moteur.ts` dans `src/server/config`, classement séparé jusqu'à B9, `duree` renvoie `{ minutes, estimee }`.
- **B5c** (#276, patchs du moteur) ouverte, avec les ajouts de 0048.
- **Spec B3 (#243) découpée** (Q361) : B3a sans envoi réel d'e-mail, nouvelle `specs/B3b-envoi-email.md` avec le design de la Sécurité pour l'enveloppe.
- Corrections poussées : 0046 (#266, correction 1), prévente C1 (#256, correction 2), 0048 (#274, correction 1).

## En cours
- Fils actifs : B5c correction 1 (#276), 0048 correction 2 (#274, bloquants tardifs, tentative non comptée), 0046 correction 2, la dernière (#266).
- En revue : #243 (spec B3a et B3b-envoi), #269 (F8b, approuvée).
- En attente : #256 (prévente, nouveau bloquant tardif, tentative non comptée), #272 (P0r1, après #266).

## Bloqué
- **P0r2** (premiers vrais appels à l'IA et à Google) : fusion de #266 puis de #272 ; Q366 pour l'écriture des coordonnées ; `owner-approved` de Samuel (workflow de purge et des migrations).
- **B8, B9, B11** : fusion de #274 puis de B5c (#276).
- **Code de B3a** : fusion de #243 et de F8b (jamais dans le même cycle, Q343).
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Correction de la prévente (#256, tentative non comptée) dès qu'un fil se libère.
2. Après la fusion de #266 : `needs-review` sur #272, puis ticket P0r2 (rôle data avec ia-recherche).
3. Après la fusion de F8b : ticket B3a.
4. Vérifier à chaque cycle qu'aucune PR approuvée sans bloquant n'attend `techlead-approved` (Q365).

## Décisions attendues de Samuel
- **Nouvelles** : Q366 (lecture des données du prototype par les préversions, carte du 23:13 CEST, reco : accepter), Q367 (branches Neon et fenêtre de restauration), Q368 (coût Google dans le rapport public), Q370 (coût de Places Details au-delà du plafond de 20 USD).
- **Prévente** : Q357 et Q362.
- **Action** : plafond de quota de Maps JavaScript API (Q263).
- **Déjà posées** : Q353, Q354, Q345, Q330, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO de la spec B3 (#243) et B4-PO de la spec B4 (#248, fusionnée) ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - 2 jours après sa fusion : décision 0047 (découpage de `fr.json`, dans #269) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0048, 0049, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q366 à Q368 (Samuel) : décision 0046.
- Q369 (CEO) : workflow des migrations livré avec P0r2 (tranchée).
- Q370 (Samuel) : coût de Places Details.
- Q371 (Tech Lead), Q372 (Product owner) : B5c.
- Q373 (Tech Lead, Sécurité) : B3b-envoi.
- Q374 (CEO) : note de la feuille de route pour le découpage de B3.
- Q375 (Sécurité) : P0r1.
- Q376 (Tech Lead, UX/UI) : points laissés de F8b.
- Tranchées ou closes : Q294, Q319, Q321, Q322 (Samuel), Q361, Q363.

## Part d'usage estimée
- 54e cycle : 14 sous-agents, 4 au plus en même temps :
  - F8b : correctif du budget JS (0,2 M de jetons), correction 1 (0,12 M) ;
  - B5a (0,3 M), B5b (0,3 M), B5c (0,32 M) ;
  - P0r1 : code (0,3 M) et corrections de 0049 (0,1 M) ;
  - décisions 0046 (0,15 M et 0,18 M), 0048 (0,15 M), 0049 (0,15 M) ;
  - prévente, correction 2 (0,11 M) ; découpage de B3 (0,18 M) ;
  - B5c correction 1, 0048 correction 2 et 0046 correction 2 en cours (comptées au prochain cycle).
- S'y ajoute le travail du CEO (environ 0,15 M).
- Total : environ 2,7 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
