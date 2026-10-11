# État du studio — 2026-10-11 (30e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- Aucun nouveau message depuis le 29e cycle (12:15 CEST). La règle du 10:54 CEST (« après 2 corrections bloquées, le CEO décide avec le Tech Lead ») est appliquée à Q43 et Q163 pendant ce cycle.

## Fait
- **Fusionnées** :
  - **spec F10 (#76)**, après la correction 5 : les bloquants UX/UI B1 à B4 sont levés (sous-titre « {destination} · Jour {n} · {titre} », étiquette « Terminée » sur les étapes passées, aplat `muted` à la place de `raised`, écarts au handover notés). Ticket #75. **Q163 levée**, pas de découpage ;
  - **U1 (#26)**, après sa 3e tentative (Q43) : seule la décision 0012 change, alignée sur 0013, 0014, 0018 et 0019, sans token Ligne créé. Elle tranche **Q157** et **Q177** (déléguées à UX/UI). Ticket #23.
- **B0 découpé** (Q43, consigne de Samuel) : la partie hors Q5 est dans la nouvelle PR **#114** (B0a, Refs #22). Elle contient le handover § 0 à § 17, les décisions 0006 à 0010 et les points Sécurité 4 et 5 corrigés. #27 reste ouverte pour la partie Q5 (Q198, CEO : pas de nouveau ticket).
- **T4** : PR **#113** (ticket #112). Le JavaScript initial de la Journée passe de 215 324 o à 182 935 o (budget : 200 000 o). La Journée ne charge plus Zod. Une règle de lint et un test e2e de budget sont ajoutés. Le Tech Lead a déjà approuvé ; la fusion automatique attend la CI.

## En cours
- **T4 (#113)** : `needs-review` et `techlead-approved` ; fusion automatique quand la CI sera verte.
- **B0a (#114)** : `needs-review`, documentation seulement.
- **Bug #106, PR #109** (sev:2) : `needs-review`, CI `verify` verte. Pas de nouvelle revue depuis 10:15 UTC ; la porte `gate` attend `techlead-approved`. Après la fusion et le déploiement de `main`, Samuel vérifie la carte sur la démonstration.
- `pnpm verify` en local : les captures visuelles échouent pour tous les agents (rendu des polices de la session, décision 0004), et le port 3100 est partagé entre sessions (Q202). La CI fait foi.

## Bloqué
- **B0, partie Q5 (#27)** : points Sécurité 1 à 3, décision 0011, 7 champs du § 5, étapes des workflows 1 à 5, cache de coordonnées (Q34). Attend **Q5** (juridique).
- **P0** : attend la clé serveur Places/Routes (Q103) ; Q9 est tranchée (Claude seul).

## Prochain cycle
1. Suivre #109 (sev:2), #113 et #114.
2. Après la fusion de T4 : **F5c**, puis **T7** et **F12a** (T7 jamais dans le même cycle que F8b ou F12a, Q182) ; F8a ; F11a.
3. Découper la spec F10 en tickets de code (F10a, F10b, F10c), après F5c.
4. Product Owner : spec F7 (Q110, Q104, 0019).

## Décisions attendues de Samuel
- **À faire à la main** (T10, #108) :
  - coller le texte de 0023 § 1 dans la routine Revue (Q120) ;
  - coller le prompt R3 (annexe B de `docs/studio/mise-en-place.md`) ;
  - vérifier le secret `SLACK_WEBHOOK_STUDIO` ;
  - créer les libellés `sev:1` et `sev:3` (Q184).
- **Nouvelles** :
  - Q194 : proposition S-8, tokens et styles des mesures relevées dans les preview.html (Ligne) ;
  - Q197 : mention à l'écran 2, puisque le récit libre est envoyé au fournisseur de modèles (juridique, liée à Q46).
- **Toujours ouvertes** :
  - spec F10 : Q186 (IP envoyée à Google sur la vue partagée), Q187 (rappels « À réserver »), Q188 (mention du fuseau), chacune avec une recommandation du Product Owner ;
  - juridique : Q5, Q6, Q29, Q34, Q38, Q44, Q46 à Q48, Q75, Q127, Q150 (durées) ;
  - argent et comptes : Q24 à Q26, Q39, Q45, Q56, Q84, Q103, Q129 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 (voyage jamais débloqué) ;
  - documents et environnement : Q12, Q27, Q59, Q40, Q101 (qui vérifie `VADROUILLE_DEV_PAGES`) ;
  - Ligne : Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - avant le 2026-10-12 : F12-PO, Q175, Q179, décision 0022, rendus de F11c ;
  - avant le 2026-10-13 : décisions 0017 (#65), 0019 (#72), 0023 (#108), écarts de F9a (#86) et de F5b (#66), Q182, F10-PO-1 à F10-PO-22 et Q185 (#76), décision 0012 (#26 : Q157, Q177).

## Part d'usage estimée
- 30e cycle : environ 1 million de jetons (estimation), avec 4 sous-agents : 2 PR corrigées et fusionnées, 2 PR nouvelles.
- Part de l'abonnement : impossible à mesurer depuis la routine.
