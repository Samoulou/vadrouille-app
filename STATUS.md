# État du studio — 2026-10-13 (46e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 46e cycle est le cycle planifié de 08:07 CEST.

## Messages de Samuel traités (projet)
- 09:00 CEST : « je suis toutes tes recos » sur P0-Q16 à P0-Q18 (Q268 à Q270 tranchées ; à reporter dans la spec P0-suite-2, #173) ; Vercel passé en Pro (la limite de 100 déploiements par jour ne s'applique plus).
- 09:01 CEST : `owner-approved` posé sur #188 et #199 ; les 3 vieilles branches supprimées.
- #studio : aucun nouveau message.

## Fait
- Fusionnées :
  - **décision 0038 (#210)** après sa correction 1 : Q301 tranchée ;
  - **T18 (#199)** : `owner-approved` exigé pour toute PR qui modifie `.github/workflows/` ;
  - statut du 45e cycle (#213).
- **Décision 0039 (#214)** : le Tech Lead tranche F10-TL (Q144, Q146, Q284, Q306) et entérine les écarts de F10b. En revue.
- **F10b (#212)**, correction 1 : fusion de `main`, C26 émis par le service worker, lint resserré, C20 aligné sur 0039, références visuelles régénérées par la CI, mineurs UX/UI. Sa fusion attend 0039.
- **P0a1 bis (#216, ticket #195)** : test d'imports de P0 durci (39 cas négatifs). En revue, verdict Sécurité requis.
- **P0c1 (#217, ticket #215)** : régime de confinement des capacités (356 tests). En revue ; écarts A1 à A8 à trancher par le Tech Lead et la Sécurité (Q309).
- **B1 (#188)** : fusion de `main` (`773b7cb`), avec une exception nominative à `ligne/require-server-only` pour les modules de P0 (Q308). Revue relancée.

## En cours
- **Code de B2 (ticket #196)** : en construction.
- En revue : #188, #212, #214, #216, #217.

## Bloqué
- **Fusion de F10b (#212)** : décision 0039 (#214).
- **P0c2** : réponse de Samuel à P0c-Q2 (texte de la routine de revue R2).
- **Exécutions réelles de P0** : P0c1 et P0c2, puis P0-suite-2 (#173).

## Prochain cycle
1. Suivre les revues de #188, #212, #214, #216, #217 et du code de B2 ; fusionner `main` dans #212 après 0039.
2. Mettre à jour la spec P0-suite-2 (#173) avec Q268 à Q270 (rôle `product-owner`).
3. F7a, puis F10c après F10b.
4. Ordre des fusions P0 : #216 puis #217 (Q312).

## Décisions attendues de Samuel
- **Actions** :
  - plafond de quota de Maps JavaScript API (Q263) ;
  - **#188 (B1)** : après la fusion de `main` (`773b7cb`), la porte demande que Samuel retire puis repose `owner-approved` une fois la nouvelle revue approuvée.
- **Nouvelles** : aucune.
- **Déjà posées** : Q296 (texte de la routine de revue R2, recommandation a), Q297 (règle `owner-approved` dans `CLAUDE.md`), Q294, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et son amendement (#211), 0037, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-15 : décisions B2-PO de la spec B2 (#198) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q308 (Tech Lead) : `server-only` et modules de P0 (B1).
- Q309 (Tech Lead et Sécurité) : écarts A1 à A8 de P0c1.
- Q310 (Tech Lead) : zone `src/prototype/**` dans P0c1.
- Q311 (Sécurité) : `VADROUILLE_PROTOTYPE_DIR` dans `prototype-loader.ts`.
- Q312 (CEO, tranchée) : #216 avant #217.
- Q268 à Q270 tranchées par Samuel ; Q301 tranchée par 0038 ; Q144, Q146, Q284, Q306 tranchées par 0039 à sa fusion.

## Part d'usage estimée
- 46e cycle : 6 sous-agents, 3 au plus en même temps :
  - décision 0039 (0,21 M de jetons) ;
  - correction 1 de F10b (0,17 M) ;
  - P0a1 bis (0,14 M) ;
  - P0c1 (0,5 M) ;
  - fusion de `main` dans B1 (0,10 M) ;
  - code de B2 (en cours).
- S'y ajoute le travail du CEO (environ 0,1 M).
- Total : environ 1,2 M de jetons hors B2 (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
