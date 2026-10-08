# État du studio — 2026-10-08 (7e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Fait
- **F3 — Composants de la ligne du jour (#30, ticket #29) : fusionnée** dès la 1re revue R2 (Tech Lead et UX/UI conformes). CI verte, références visuelles prises depuis l'artefact de la CI (pas de 403). Ticket #29 fermé avec un renvoi.
  - Écarts listés dans la PR : icônes « à pied » et « bus » omises (absentes des `preview.html`, Q51), prop `label` de `DayTabs` (règle axe `landmark-unique`), durées « 1 h 05 » (Q53), lien « Idées » souligné.
  - **Point pour Samuel** : le soulignement du lien « Idées » est la proposition S-3 de Q37, réservée à Samuel. La revue l'a accepté dans F3. À confirmer ou à retirer (Q37).
  - Choix à consigner par le Tech Lead dans `docs/decisions/` (Q52).
- **Spec F4 — Carte (#25, ticket #24) : fusionnée** après la 2e correction (précédence des états de remplacement, `config.mapId`, O1 à O6). Ticket #24 fermé avec un renvoi vers #25 et #34. Décisions F4-PO définitives sans veto de Samuel avant le 2026-10-10.
- **Roadmap à jour (#32) : fusionnée.** Elle reprend la partie roadmap de la PR de statut #28, que la porte `techlead-gate` bloquait (libellé `techlead-approved` exigé hors `STATUS.md`, `QUESTIONS.md` et `docs/releases/`). Cette PR-ci remplace #28.

## En cours
- **F4 — Carte Google Maps (PR #35, ticket #34)** : en revue R2.
  - Livré : contrat `DayMap` et `validateDayMap`, positions simulées des 6 jours, enveloppe `DayMap` (hors ligne, puis configuration absente, puis erreur de chargement), rendu Google (Maps JavaScript API seule) et carte simulée déterministe, `PlacesAttribution`, `/dev/carte`, tests de la spec.
  - CI verte (`verify` avec 8 tests visuels, `docker`). Références visuelles prises depuis l'artefact de la CI, sans 403.
  - Nouvelles dépendances en versions exactes : `@googlemaps/js-api-loader` 2.1.3 et `@types/google.maps` 3.66.4.
  - Choix soumis au Tech Lead (Q60) et à UX/UI (Q61). Aucune capture de la vraie carte : attend Q31.
- **Spec F6 — Présentation (#33, ticket #31)** : 1re correction faite (jeu simulé de l'écran 6b : J6 en préparation sans proposition, 7 propositions des jours 3 et 4 ; session = instance de la page). `needs-review` reposé, revue R2 relancée.
  - Décisions du Product Owner F6-PO-1 à F6-PO-16 : ordre du paquet, « Passer », « Tout garder pour le jour N », seuils du geste, clavier, annulation 5 s, repas, questions de préférence et de distance, catégories provisoires, contenu de la carte, écrans de fin sans prix, événements, aucune persistance en phase 0.
  - Propositions au Tech Lead F6-TL-1 à F6-TL-6 (Q58). Questions Q54 à Q57, Q59.

## Bloqué (2 tentatives de correction épuisées, étape 5 du prompt R1)
- **B0 — Handover back-end (#27, ticket #22)** :
  - 2e correction faite ce cycle : fonctions SECURITY DEFINER à rôles dédiés, purge limitée, IP de confiance, paiement en une transaction, données Google « calculées, non stockées » en base.
  - La revue R2 suivante : Tech Lead conforme, Sécurité non conforme sur 5 points.
    1. Verdicts et dates de contrôle dans l'état durable des workflows.
    2. Codes dérivés des horaires Google dans le prompt de réparation.
    3. Codes R4 et `toConfirm` stockés dans des versions non modifiables.
    4. Vues partagées `security_invoker`.
    5. Routes Better Auth exposées sans liste blanche.
  - Les points 1 à 3 relèvent de Q5, juridique (Q44). Les points 4 et 5 sont techniques.
  - En attente de Q43.
- **U1 — Décisions UX/UI déléguées (#26, ticket #23)** :
  - 2e correction faite ce cycle : `border-control` gardé, S-3 en proposition, « Conséquences » exactes, ARIA, textes.
  - La revue R2 suivante : Tech Lead conforme, UX/UI 3 points.
    1. Interlignes de `bouton` et `numero-carte`, et usage de `pastille` : à proposer à Samuel.
    2. Usage de `corps-fort`.
    3. Écart WCAG 1.4.1 du provisoire « Idées » à écrire.
  - En attente de Q43.
- P0 : attend Q9 (clé Gemini) et la clé serveur Places/Routes.
- F5 : attend F4.

## Décisions attendues de Samuel
- **Règles du studio** :
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Juridique, suit Q5** :
  - Q5 et Q6 ;
  - Q29, Q34, Q38 ;
  - Q44 : données dérivées de Google hors base, dont le prompt de réparation ;
  - Q46 : fournisseurs de modèles sans entraînement sur nos données ;
  - Q47 : IP dans les sessions, si besoin ;
  - Q48 : conservation comptable de `billing`.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 : Postgres UE, envoi des codes, Stripe test avec TWINT ;
  - Q39 et Q45 : plafonds de coût ;
  - Q56 : PostHog UE et consentement.
- **Offre** : Q57, ce que comptent les 8 propositions offertes.
- **Durées et documents** :
  - Q27 : durées de conservation ;
  - Q12 : export des maquettes ;
  - Q59 : `docs/ux/dossier-ux.md` absent du dépôt.
- **Clés et environnement** :
  - Q31 : la clé Maps accepte-t-elle les aperçus `*.vercel.app` ?
  - Q40 : Docker dans les sessions.
- **Ligne** : Q37 (S-0 à S-7), dont le soulignement du lien « Idées » déjà appliqué par F3.
- Configuration de la routine R1 sur 3 h (à faire par Samuel).
- **Veto possible avant le 2026-10-10** sur les décisions déléguées :
  - ADR 0005 (Tech Lead, F2) ;
  - PO-1 à PO-7 (spec B0) ;
  - ADR 0001, section « Évolution » (CEO) ;
  - F4-PO (spec F4, #25, fusionnée) ;
  - F6-PO-1 à F6-PO-16, si #33 est fusionnée.

## Prochain cycle
1. Suivre F4 (#35) et la spec F6 (#33) en revue R2 (au plus 2 corrections chacune).
2. Code de F6 dès que sa spec est fusionnée (prérequis F1 et F2 faits) ; F5 dès que F4 est fusionnée.
3. #26 et #27 : appliquer la réponse de Samuel à Q43.
4. Décisions déléguées en attente :
  - Tech Lead : Q33, Q36, Q52, Q58, Q60 ;
  - UX/UI : Q32, Q51, Q53 à Q55, Q61 ;
  - Product Owner : Q35, Q41, Q42, Q49, Q50, partie Product Owner de Q17.
5. ADR 0004 tranché et implémenté par le Tech Lead.

## Part d'usage estimée
- 7e cycle du 2026-10-08 : environ 1 450 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| B0, 2e correction | ≈ 200 000 |
| U1, 2e correction | ≈ 90 000 |
| Spec F4, 2e correction | ≈ 80 000 |
| F3 | ≈ 225 000 |
| Spec F6 | ≈ 200 000 |
| F4 (code) | ≈ 295 000 |
| Pilotage | ≈ 150 000 |

- Cumul de la journée : environ 5 200 000 jetons.
- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 6e cycle (17:39) : aucun.
