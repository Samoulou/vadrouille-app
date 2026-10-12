# État du studio — 2026-10-12 (37e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- **2026-10-12 07:12** : pas d'Anthropic direct ; modèles via OpenRouter (`OPENROUTER_API_KEY`, plafond de crédit, fournisseurs qui entraînent sur les données exclus) et l'AI SDK, modèle choisi par configuration ; clé serveur Google `GOOGLE_MAPS_SERVER_KEY` limitée à Places et Routes. Consigné dans la **décision 0026** ; Q9 remplacée, Q46 en partie couverte, Q234 mise à jour. Spec P0 (#149) corrigée en conséquence.
- **2026-10-12 08:47** : les clés sont en place, hors du dépôt et côté serveur dans Vercel, avec un quota Google plafonné ; « Tu peux lancer P0 ». Ajouté à 0026 (point 7) ; Q103 close. Intégré à la correction 2 de #149. Le code P0 (P0a1, P0b1) démarre dès la fusion de la spec.
- Les messages de 07:03 avaient été traités au 36e cycle (#150). #150 n'a pas été fusionnée (pas de revue) : cette PR la remplace et reprend son contenu.

## Fait
- **Fusionnées depuis le 36e cycle** :
  - **F2c (#143)** : 3e correction autorisée par le CEO avec la revue du Tech Lead (Q240, règle Q43), qui portait sur la référence `dev-composants.png` reprise de la CI et le message de l'`OtpInput` en `ink`.
  - **T17 (#148)** : après la correction 1, le workflow `visual-update.yml` a deux jobs (le jeton n'est jamais exposé au code de la PR), retire `techlead-approved` avant le push et a un test de régression (26 cas).
- Tickets fermés : #138 (F2c), #146 (T17). Ticket créé : **#151 (F11a)**.
- **F11a (#151, PR #152)** : Mes voyages `/voyages`, réouverture au dernier onglet, `TripSummary`, `listTrips`, deux voyages simulés, entrée de démonstration. Q207 réglée : le préchargement de `/voyages` ne tombe plus en 404. Journée à 181 722 o, Séjour à 181 373 o, présentation à 177 940 o, Mes voyages à 170 401 o. CI verte, en revue.
- **Spec P0 (#149)** : correction 1 (13 points du Tech Lead, OpenRouter) puis correction 2 (bloquants Sécurité B1 à B3 : garde SSRF, portée des clés, aucun cache des données Google ; réserves R1 à R10). CI verte, en revue.

## En cours
- **#149 (spec P0)** : en revue après sa 2e et dernière correction. Si la revue demande encore des changements, le CEO décide avec le Tech Lead (Q43).
- **#152 (F11a)** : première revue.
- `pnpm verify` en local : vert sauf les captures visuelles (polices, 0004). Tests e2e instables en session chargée, verts seuls et en CI (Q244).

## Bloqué
- **B0, partie Q5 (#27)** : attend **Q5** (juridique), ou la fermeture que Samuel doit confirmer (Q237).
- **Exécutions réelles de P0 (P0a2, P0a3, P0b2)** : attendent les montants (Q234, P0-Q2), le juridique propre à P0 (Q236, P0-Q5), la portée de la clé Google (Q249) et la protection des préversions (Q250). Le code sans clé (P0a1, P0b1) n'attend que la fusion de #149.

## Prochain cycle
1. Suivre #149 et #152 ; reposer `needs-review` après toute correction (Q220).
2. Après #149 : **P0a1** et **P0b1** (fichiers distincts).
3. Après #152 : F7a, F8a, puis F10a (#140, avec la règle 1 de la réouverture, Q248). Ces tâches partagent `fr.json` : une seule à la fois. Ensuite, la tâche des points 1 et 5 de 0012 (avec Q243).
4. Premier essai réel du workflow `visual-update.yml` sur la prochaine PR d'écran (Q238).

## Décisions attendues de Samuel
- **Nouvelles (P0)** :
  - **Q234 / P0-Q2** : montants (3 USD par exécution, crédit OpenRouter de 40 USD par mois, Google 20 USD par mois) et quotas quotidiens Google ;
  - **Q249** : clé Google dans tout l'environnement « vadrouille » ou seulement dans la routine IA-recherche des exécutions réelles ?
  - **Q250** : préversions Vercel protégées ? clés limitées à Preview et Development ?
  - **Q241** : horaires planifiés comme résultat maison dans un programme commité ;
  - **Q235, Q236** : mode d'exécution, grille G0, briefs et 10 incontournables d'Édimbourg, OpenRouter hors UE pour P0 (P0-Q5).
- **Q245** : protéger `.github/workflows/` (CODEOWNERS ou règle de branche).
- **Q237** : fermer #27 et garder la partie Q5 dans le ticket #22 ?
- **Q214** (sous Q45) : plafond global des écrans 2 et 3. Ne bloque pas la phase 0.
- **Après le déploiement de `main`** : vérifier la carte du jour 1 sur https://vadrouille-app-ten.vercel.app/voyages/mock_trip_edimbourg_debloque/jour/1 (bug #106 corrigé).
- **À faire à la main** (T10, #108) : Q120, prompt R3, libellés `sev:1` et `sev:3` (Q184), accès Vercel des routines (403).
- **Rappelées** : Q48, Q27, Q129 (B0a).
- **Toujours ouvertes** :
  - F10 : Q186, Q187, Q188 ;
  - Ligne et juridique : Q194, Q197 ;
  - juridique : Q5, Q6, Q29, Q34, Q38, Q44, Q46 à Q48, Q75, Q127, Q150 ;
  - argent et comptes : Q24 à Q26, Q39, Q45, Q56, Q84, Q129 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q27, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : « Évolution » de 0004 (#148) ; décisions déléguées P0-PO-2, 3, 5 à 8 et 11 (#149, si fusionnée) ;
  - avant le 2026-10-14 : décision 0025 (#134) ;
  - avant le 2026-10-13 : décisions 0017, 0019, 0023, 0024, écarts de F9a et de F5b, Q182, F10-PO-1 à F10-PO-22 et Q185, 0012, F7-PO-20 et F7-PO-21, F8-PO-18 à F8-PO-22.

## Part d'usage estimée
- 37e cycle : environ 1,2 million de jetons (estimation) pour 5 sous-agents : 4 corrections et 1 tâche nouvelle. 2 PR fusionnées (#143, #148) et 2 PR prêtes pour la revue (#149, #152).
- Part de l'abonnement : impossible à mesurer depuis la routine.
