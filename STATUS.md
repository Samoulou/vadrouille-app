# État du studio — 2026-10-12 (38e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- **2026-10-12 09:46** : décisions. Q214 (risque accepté en phase 0) ; Q186, Q187, Q188, Q194, Q48, Q27, Q129 (recommandations validées) ; Q197 (mention à l'écran 2) ; **Q5, règle provisoire** (aucune donnée Google dans les prompts, seul l'identifiant de lieu stocké, coordonnées 30 jours au plus ; juridique formel avant le lancement) ; Q237 (#27 gardée et finalisée sur cette règle) ; Q234 (40 USD par mois OpenRouter, 20 USD par mois Google, quotas journaliers) ; Q235 (prototype protégé, rien de public) ; T10 fait (Q120, Q184, connecteur Vercel) ; **P0 en variante B** (DeepSeek cherche, le code ancre, le Decider note, le code classe, DeepSeek rédige ; variante A mesurée une fois). Consigné dans la **décision 0027**, jointe à la spec P0 (#149) avec 0026.
- **2026-10-12 09:53** : Q236, 3 briefs de référence et 10 incontournables d'Édimbourg (0027 § 6), appliqués à la spec P0.
- **2026-10-12 09:57** : comptes externes du back-end selon B0a et recommandation Neon ou Supabase du Tech Lead : ticket **#154 (B0c)** (Q251).
- Les messages de 07:12 et 08:47 avaient été traités au 37e cycle (#153). #153 n'a pas été fusionnée : cette PR la remplace (STATUS et QUESTIONS) ; 0026 et la ligne P0 de la roadmap passent dans #149.

## Fait
- Rien de fusionné depuis le 37e cycle.
- Ticket créé : **#154 (B0c)**. Tickets en cours : #147 (spec P0), #22 (B0), #154.

## En cours
- **Spec P0 (#149, ticket #147)** : correction 3 (la revue de 07:53 UTC ne la compte pas : bloquant tardif). P0-Q2 ajoutée aux prérequis de P0b2, mineurs 2 à 14, variante B, plafonds, briefs et incontournables (0027), décisions 0026 et 0027 jointes.
- **B0, partie Q5 (#27, ticket #22)** : finalisée sur la règle provisoire de Q5 (0027 § 4), avec `main` intégrée.
- **B0c (#154)** : liste des comptes externes et recommandation Neon ou Supabase (nouveau fichier `docs/handovers/comptes-externes.md`).
- **F11a (#152)** : en revue, CI verte, aucune revue publiée depuis 07:27 UTC.
- `pnpm verify` en local : vert sauf les captures visuelles (polices, 0004). La CI fait foi.

## Bloqué
- **Exécutions réelles de P0 (P0a2, P0a3, P0b2)** : attendent Q249 (portée de la clé Google), Q250 points 2 et 3, Q241 (horaires commités, P0b2), P0-Q5 (OpenRouter hors UE pour P0) et Q252 (valeurs des quotas quotidiens). Le code sans clé (P0a1, P0b1) n'attend que la fusion de #149.

## Prochain cycle
1. Suivre #149, #27, #152 et la PR de #154 ; reposer `needs-review` après toute correction (Q220).
2. Après #149 : **P0a1** et **P0b1** (fichiers distincts).
3. F8a (prête, reportée faute de place) ; après #152 : F7a, puis F10a (#140, Q248). Ces tâches partagent `fr.json` : une seule à la fois.
4. Premier essai réel du workflow `visual-update.yml` sur la prochaine PR d'écran (Q238).

## Décisions attendues de Samuel
- **P0** : Q249 (clé Google : portée minimale recommandée) ; Q250 points 2 et 3 (clés Vercel limitées à Preview et Development) ; Q241 (horaires planifiés commités) ; Q252 (valeurs des quotas quotidiens, plafond par exécution) ; P0-Q5 (OpenRouter hors UE pour P0, `zdr` à essayer) ; P0-Q6 (seuils G0) ; P0-Q8 (relire plutôt que garder).
- **Après #154** : choix du fournisseur Postgres (Q24) et ouverture des comptes.
- **Q245** : protéger `.github/workflows/` (CODEOWNERS ou règle de branche).
- **Après le déploiement de `main`** : vérifier la carte du jour 1 sur https://vadrouille-app-ten.vercel.app/voyages/mock_trip_edimbourg_debloque/jour/1 (bug #106 corrigé).
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44 (règle provisoire en attendant), Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q24 à Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : « Évolution » de 0004 (#148) ; décisions déléguées P0-PO-2, 3, 5 à 8 et 11 (#149, si fusionnée) ;
  - avant le 2026-10-14 : décision 0025 (#134) ;
  - avant le 2026-10-13 : décisions 0017, 0019, 0023, 0024, écarts de F9a et de F5b, Q182, F10-PO-1 à F10-PO-22 et Q185, 0012, F7-PO-20 et F7-PO-21, F8-PO-18 à F8-PO-22.

## Part d'usage estimée
- 38e cycle : estimation à compléter en fin de cycle (3 fils : 2 corrections, 1 tâche nouvelle).
- Part de l'abonnement : impossible à mesurer depuis la routine.
