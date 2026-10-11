# État du studio — 2026-10-11 (29e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio, 2026-10-11)
- **10:46 CEST** : réponses à Q98, Q101, Q31, Q140, Q137 à Q139, Q138, Q149, Q151, Q152, Q176, Q150, Q170, Q171. Reportées dans `QUESTIONS.md` ; celles qui touchent F10 sont appliquées à la spec (#76, correction 3).
- **10:54 CEST** :
  - nouvelle règle : après 2 corrections bloquées, le CEO décide avec le Tech Lead (3e tentative ou découpage), appliquée à Q119, Q163 et Q43 ;
  - Q157, Q177 et Q120 à Q122 sont délégués ;
  - Q118 : release automatique et correction de `techlead-gate` → T10 (#108, fusionnée) ;
  - Q9 : Claude seul, sans Gemini. Q172 : mesure sans la vraie carte. Q31 : clé ouverte à `vadrouille-app-ten.vercel.app` et `git-main` ;
  - processus des bugs → modèle et règles (#108) ;
  - bug sev:2 « Carte indisponible » → ticket #106, PR #109.

## Fait
- **Fusionnées** :
  - T8 (#72, décision 0019) et U2 (#67, correction de 0018) : la revue R2 a repris, **Q181 résolue** ;
  - T5 (#65, décision 0017, après sa 3e correction) ;
  - **F9a (#86)**, après la mise à jour avec `main` ;
  - **F5b (#66)**, après sa 3e correction ;
  - **T10 (#108)** : `release.yml` (tag, release et note dans #studio, aussi chaque heure), `techlead-gate` (échec si `changes-requested` ; retrait de `techlead-approved` à chaque push), modèle `.github/ISSUE_TEMPLATE/bug.md`, décision 0023 (Q120 à Q122) ;
  - release v2026.10.11-09 (#110).
- **Q119 levée** : la suite du code est débloquée.
- Bug #106 : la cause est dans le code, pas dans Vercel. Le voyage débloqué de la démonstration n'avait pas de positions simulées, donc la carte affichait « Carte indisponible » avec ou sans clé. La clé et l'ID de carte sont bien présents dans le JavaScript servi en Production. Correction et test de reproduction dans #109 (contenu de T6, décision 0017 § 13).

## En cours
- **Bug #106, PR #109** (`needs-review`) : correction 1 faite (8f60958). Le conflit avec F9a est résolu ; la CI `verify` est verte, captures visuelles comprises, ainsi que `docker`. Après fusion et déploiement de `main`, Samuel vérifie la carte sur la démonstration.
- **Spec F10, PR #76** :
  - correction 3 (comptée) : les 5 bloquants du Tech Lead sont levés ;
  - correction 4 : non comptée (0023 § 3), parce que Sécurité et UX/UI relisaient pour la première fois ;
  - revue de 10:11 UTC : Tech Lead et Sécurité conformes, UX/UI demande 4 bloquants (B1 à B4 : sous-titre, étapes passées, contraste de `raised`, écarts avec le handover).
  - Décision du CEO : une correction 5 au 30e cycle ; si UX/UI bloque encore, la spec sera découpée (F10a « Pendant le voyage », F10c « Partage »).

## Bloqué
- **B0 (#27) et U1 (#26)**, règle de Samuel appliquée à Q43 : #27 sera découpée (une PR pour ce qui ne dépend pas de Q5) et #26 aura une 3e tentative. À exécuter au 30e cycle, la limite de tâches du 29e étant atteinte.
- **P0** : Q9 est tranchée (Claude seul) ; il attend la clé serveur Places/Routes (Q103).

## Prochain cycle
1. Suivre #109 (sev:2) et #76.
2. **T4** (budget JavaScript de la Journée), prête depuis la fusion de F5b, en tête du code.
3. Découper #27 et faire la 3e tentative de #26 (Q43).
4. #76 : correction 5.
5. Ensuite, dans l'ordre : F5c et T7 après T4 ; T7 n'entre dans le même cycle ni que F8b ni que F12a (Q182) ; F8a ; F11a et F12a après T4.
6. UX/UI : Q157, Q177, Q183. Product Owner : spec F7 (Q110, Q104, 0019).

## Décisions attendues de Samuel
- **À faire à la main** (T10, #108) :
  - coller le texte de 0023 § 1 dans la routine Revue (Q120) ;
  - coller le prompt R3 (annexe B de `docs/studio/mise-en-place.md`) ;
  - vérifier le secret `SLACK_WEBHOOK_STUDIO` ;
  - créer les libellés `sev:1` et `sev:3` (Q184).
- **Nouvelles (spec F10)** :
  - Q186 : information du visiteur sur le chargement de Google ;
  - Q187 : texte des rappels « À réserver » ;
  - Q188 : mention du fuseau.
  - Le Product Owner donne une recommandation pour chacune.
- **Toujours ouvertes** :
  - juridique : Q5, Q6, Q29, Q34, Q38, Q44, Q46 à Q48, Q75, Q127, Q150 (durées) ;
  - argent et comptes : Q24 à Q26, Q39, Q45, Q56, Q84, Q103, Q129 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, et Q149 (voyage jamais débloqué) ;
  - documents et environnement : Q12, Q27, Q59, Q40, Q101 (qui vérifie `VADROUILLE_DEV_PAGES`) ;
  - Ligne : Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - avant le 2026-10-12 : F12-PO, Q175, Q179, décision 0022, rendus de F11c ;
  - avant le 2026-10-13 : décisions 0017 (#65), 0019 (#72), 0023 (#108), écarts de F9a (#86) et de F5b (#66), Q182 ;
  - après la fusion de #76 : F10-PO-1 à F10-PO-21 et Q185.

## Part d'usage estimée
- 29e cycle : environ 1,5 million de jetons (estimation) : 8 sous-agents, dont 6 PR mises à jour et 2 PR nouvelles.
- Part de l'abonnement : non mesurable depuis la routine.
