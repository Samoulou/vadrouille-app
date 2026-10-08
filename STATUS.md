# État du studio — 2026-10-08 (8e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Fait
- **Spec F6 — Présentation (#33) : fusionnée** à l'issue du 7e cycle. Ticket #31 fermé avec un renvoi. Les décisions F6-PO-1 à F6-PO-16 deviennent définitives sans veto de Samuel avant le 2026-10-10.
- **T1 — Décisions déléguées du Tech Lead (#39, ticket #38) : fusionnée**, ADR 0013.
  - Q33 et Q60 : choix de F4 consignés (`DayMap`, `@googlemaps/js-api-loader` 2.1.3, `CarteProvider`, `validateDayMap(day, map, tripId)`). `0003-versions.md` et le handover front § 2 et § 8 sont à jour.
  - Q52 : API de F3 acceptée.
  - Q58 : propositions F6-TL-1 à F6-TL-6 tranchées (`category`, réducteur pur, `src/analytics` sans envoi réseau, Pointer Events, `@radix-ui/react-dialog` 1.2.0 sans `vaul`).
  - Q36 : pas de sous-mode de transport pour l'instant.
  - Ces décisions sont définitives sans veto de Samuel avant le 2026-10-10.

## En cours
- **F4 — Carte Google Maps (PR #35, ticket #34)** : 1re correction poussée, `needs-review` reposé, revue R2 relancée. CI verte sur fddd7f3.
  - E1 : le jour actif de `/dev/carte` est visible.
  - E2 : le texte hors ligne devient « Carte indisponible hors ligne. La liste reste utilisable. » (F4-PO-8).
  - E3 : une région live persistante est ajoutée dans `DayMap`.
  - La spec est alignée sur la signature à 3 paramètres.
  - En production, `/dev/carte` n'utilise jamais la configuration de l'environnement.
  - Références visuelles : elles sont prises depuis la CI. Pour cela, un commit volontairement rouge a retiré les 4 anciennes références (le workflow `update-snapshots` de l'ADR 0004 n'existe pas encore).
  - Non traités, listés dans la PR : CSP, `gm_authFailure` global.
- **Spec F5 — Séjour, Journée, Fiche (PR #40, ticket #37)** : en revue R2.
  - Décisions du Product Owner F5-PO-1 à F5-PO-18, dont la partie Product Owner de Q17. Écart assumé : pas de bouton « Garder » (cadrage § 3.1).
  - Propositions au Tech Lead F5-TL-1 à F5-TL-8 (Q65). Questions Q62 à Q66.

## Bloqué
- **B0 — Handover back-end (#27, ticket #22)** et **U1 — Décisions UX/UI (#26, ticket #23)** : 2 tentatives de correction épuisées. En attente de Q43, sans changement depuis le 7e cycle (voir les détails dans #36).
- **Code de F6** : prêt (spec fusionnée, ADR 0013), mais il n'est pas pris ce cycle. Il touche `src/contracts`, `src/adapters` et `src/i18n/fr.json`, que F4 (#35) modifie aussi. Il démarre dès la fusion de F4.
- **F5 (code)** : attend F4, puis le code de F6 (Q66).
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes.

## Décisions attendues de Samuel
- **Règles du studio** :
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Juridique, à la suite de Q5** :
  - Q5 et Q6 ;
  - Q29, Q34, Q38, Q44 ;
  - Q46, Q47, Q48.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE.
- **Offre** :
  - Q57 : ce que comptent les 8 propositions offertes ;
  - **Q63 (nouvelle)** : ce que montre un voyage non débloqué au-delà de l'aperçu.
- **Durées et documents** :
  - Q27 : durées de conservation ;
  - Q12 : maquettes ;
  - Q59 : Dossier UX absent.
- **Clés et environnement** :
  - Q31 : `*.vercel.app` ;
  - Q40 : Docker.
- **Ligne** : Q37, dont le soulignement du lien « Idées » déjà appliqué par F3.
- Configuration de la routine R1 sur 3 h (à faire par Samuel).
- **Veto possible avant le 2026-10-10** :
  - ADR 0005 ;
  - PO-1 à PO-7 (B0) ;
  - ADR 0001 « Évolution » ;
  - F4-PO ;
  - F6-PO-1 à F6-PO-16 ;
  - ADR 0013 (Q33, Q36, Q52, Q58, Q60) ;
  - Q66 (ordre F6 puis F5, CEO) ;
  - F5-PO-1 à F5-PO-18, si #40 est fusionnée.

## Prochain cycle
1. Suivre F4 (#35, 1 correction faite sur 2) et la spec F5 (#40).
2. Code de F6 dès que F4 est fusionnée (ticket à ouvrir), puis F5a, F5b, F5c (Q66).
3. PR de roadmap : y inscrire T1, la spec F5, l'ordre F6 puis F5, et « Signaler une erreur » après B11.
4. #26 et #27 : appliquer la réponse de Samuel à Q43.
5. Décisions déléguées en attente :
  - Tech Lead : Q64, Q65 ;
  - UX/UI : Q32, Q51, Q53 à Q55, Q62 ;
  - Product Owner : Q35, Q41, Q42, Q49, Q50.

## Note d'organisation
- Les sous-agents partageaient le même répertoire de travail. L'un d'eux a changé de branche pendant que les autres travaillaient, et un commit a atterri en local sur la mauvaise branche. Il a été corrigé avant le push, rien n'a été publié par erreur.
- Désormais, chaque sous-agent travaille dans son propre worktree.

## Part d'usage estimée
- 8e cycle du 2026-10-08 : environ 650 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| F4, 1re correction | ≈ 155 000 |
| Spec F5 | ≈ 245 000 |
| T1, décisions Tech Lead | ≈ 125 000 |
| Pilotage | ≈ 125 000 |

- Cumul de la journée : environ 5 850 000 jetons.
- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 7e cycle (21:10 CEST) : aucun.
