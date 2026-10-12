# État du studio — 2026-10-12 (36e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- **2026-10-12 07:03** : (1) « la PR sur le backend qui traîne » : réponse dans #studio. #27 ne garde que la partie Q5 et la décision 0011, le reste a été fusionné dans #114 (B0a). Le CEO propose de la fermer et de garder ces passages dans le ticket #22 jusqu'à Q5. Choix de Samuel attendu (Q237). (2) « sortir des données mockées, tester à partir d'une ville » : plan P0 en deux étapes (script ville → programme, puis adaptateur « données du prototype » sur le staging). Spécification lancée dans ce cycle (ticket #147, PR #149). Clés et plafonds demandés à Samuel (Q234 à Q236).

## Fait
- **Fusionnée depuis le 35e cycle** : **F12b (#144)**, grand écran du voyage. Tickets #139 (F12b) et #131 (T7) fermés : leurs PR sont fusionnées.
- **F2c (#143)**, correction 2 sur 2 : `main` fusionnée dans la branche, sans rebase (conflit du README), chip `aria-disabled` et `OtpInput` invalide ajoutés dans `/dev/composants` (Q230 réglée), JSDoc de `StatusBanner` recollé. Libellé `changes-requested` retiré, `needs-review` reposé (Q220).
- **T17 (#146, PR #148)** : workflow `visual-update.yml` de la décision 0004 (Q232), section « Évolution » de 0004 ; actionlint sans erreur. En revue.
- **Spec P0 (#147, PR #149, docs-only)** : prototype de l'agent de recherche, découpé en P0a1, P0b1, P0c, P0a2, P0b2 et P0a3. P0a1 (script sur clients simulés) et P0b1 (adaptateur `DATA_ADAPTER=prototype`) ne demandent aucune clé. Décisions P0-PO-1 à P0-PO-11, veto possible avant le 2026-10-14. En revue.
- `docs/roadmap.md` : la ligne P0 ne mentionne plus Gemini, retiré par Q9.

## En cours
- **#143 (F2c)** : de nouveau en revue. La capture `dev-composants` doit être régénérée : par le workflow T17 une fois #148 fusionnée (premier essai, Q238), sinon selon la revue.
- **#148 (T17)** et **#149 (spec P0)** : en revue. Q239 : relance de la CI après le commit du workflow (commit vide ou jeton d'application).
- `pnpm verify` en local : vert, sauf les captures visuelles (polices, 0004). Tests e2e instables vus en session, verts quand on les relance seuls : `sejour.e2e.spec.ts:78` (« sheet: glisser et défilement ») et « presentation: le toast disparaît après 5 s ». À surveiller en CI.

## Bloqué
- **F2c (#143)** : les 2 corrections sont faites. Si la revue demande encore des changements, le CEO décide avec le Tech Lead (règle de Samuel, Q43).
- **B0, partie Q5 (#27)** : attend **Q5** (juridique), ou le choix de Samuel sur sa fermeture (Q237).
- **P0a2 et suite** : attendent les clés et les plafonds (Q103, Q234 à Q236).

## Prochain cycle
1. Suivre #143, #148, #149 ; reposer `needs-review` après toute correction (Q220).
2. Après #149 : **P0a1** et **P0b1** (sans clé, fichiers distincts).
3. Après #143 : F11a (crée `/voyages`, Q207), F7a, F8a, F10a (#140). Ces tâches partagent `fr.json`, on n'en prend donc qu'une à la fois. Puis la tâche des points 1 et 5 de 0012.

## Décisions attendues de Samuel
- **Nouvelles (P0, ta demande du 07:03)** :
  - **Q234** : clé Anthropic et clé serveur Places/Routes dédiées au prototype, avec leurs plafonds (3 USD par exécution, 40 USD par mois de modèles, 20 USD par mois de Google) ;
  - **Q235** : exécution par un workflow manuel protégé et consultation sur une préversion protégée ;
  - **Q236** : grille G0, briefs et incontournables d'Édimbourg.
- **Q237** : fermer #27 et garder la partie Q5 dans le ticket #22 ?
- **Q214** (sous Q45) : plafond global des écrans 2 et 3. Ne bloque pas la phase 0.
- **Après le déploiement de `main`** : vérifier la carte du jour 1 sur https://vadrouille-app-ten.vercel.app/voyages/mock_trip_edimbourg_debloque/jour/1 (bug #106 corrigé).
- **À faire à la main** (T10, #108) : Q120, prompt R3, libellés `sev:1` et `sev:3` (Q184), accès Vercel des routines (403).
- **Rappelées** : Q48, Q27, Q129 (B0a).
- **Toujours ouvertes** :
  - F10 : Q186, Q187, Q188 ;
  - Ligne et juridique : Q194, Q197 ;
  - juridique : Q5, Q6, Q29, Q34, Q38, Q44, Q46 à Q48, Q75, Q127, Q150 ;
  - argent et comptes : Q24 à Q26, Q39, Q45, Q56, Q84, Q103, Q129 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q27, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - avant le 2026-10-14 : décision 0025 (#134) ; P0-PO-1 à P0-PO-11 (#149, si fusionnée) ; « Évolution » de 0004 (#148, si fusionnée) ;
  - avant le 2026-10-13 : décisions 0017, 0019, 0023, 0024, écarts de F9a et de F5b, Q182, F10-PO-1 à F10-PO-22 et Q185, 0012, F7-PO-20 et F7-PO-21, F8-PO-18 à F8-PO-22.

## Part d'usage estimée
- 36e cycle : environ 0,5 million de jetons (estimation), avec 3 sous-agents (une correction, deux tâches nouvelles). 3 PR prêtes pour la revue (#143, #148, #149).
- Part de l'abonnement : impossible à mesurer depuis la routine.
