# État du studio — 2026-10-14 (64e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 18:43 à 18:48 CEST (fil du cycle) : « je comprends pas tout », « jhe dois faire quoi dans la PR ? », « je vois pas le lien », « franchement je comprends rien » ; réponses simplifiées : rien à faire maintenant, un seul lien avec un seul bouton le moment venu. Les messages à Samuel suivent désormais ce format.
- 2026-10-14, 18:49 CEST (projet) : « il reste des token, lance un cycle » ; 64e cycle lancé à la demande.
- #studio : aucun nouveau message de Samuel.

## Fait
- Fusionnées depuis le 63e cycle : **plafonds de l'essai** (#324), **spec B6** (#308, troisième tentative bornée, sans découpage), **décision 0057** (relevé `db-releve`, #315), statut du 63e cycle (#325).
- **P0r3c-3** (#326) : correction 1 poussée ; moteur de recherche web fixé (`exa`, le modèle de l'étape n'a pas de recherche native), filtre des requêtes, test sentinelle sur le logement.
- **Décision 0059** (#328, ticket #327) : découpage de B6 (B6a, B6b) et de B8 (B8a, B8b, B8c) ; B8c n'attend ni B7a ni B7c.
- **Région `fra1`** (#322) : branche remise à jour pour relancer la relecture, restée sans suite sur le même head.

## En cours
- **Workflow des migrations et du relevé** (data) : `db-migrate.yml`, `db-releve.yml` et harnais de la seconde base jetable ; proposition pour Q419 à trancher par le Tech Lead à la revue.
- En revue : région `fra1` (#322), P0r3c-3 (#326), décision 0059 (#328).

## Bloqué
- **Premier essai réel** : réponse de Samuel sur la recherche web par Exa (Q427, carte du 18:55 CEST) ; P0r3c-4 (`p0Run`, paquet `workflow` 5.1.0) après #326 ; P0r3d ; PR de `main` vers `p0-reel` après #322, fusionnée par Samuel (D23) ; relevé de la Sécurité.
- **Workflow des migrations** : `owner-approved` de Samuel après la revue ; Q387 (a) et (b).
- **Purge `p0-purge`** : en échec toutes les 6 heures tant que ses secrets sont vides (attendu, Q387).
- **B6a** : B3b. **B8a** : B7a, B7c, P0r3c-3. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Après #322 : ouvrir la PR de `main` vers `p0-reel` et envoyer le lien à Samuel.
2. Après #326 : lancer P0r3c-4.
3. Revue du workflow des migrations ; `owner-approved` de Samuel.
4. Après #328 : premier ticket de code prêt (B8c).

## Décisions attendues de Samuel
- **Nouvelle** : Q427 (recherche web de l'essai par Exa, service américain ; reco : accepter pour les essais).
- **Rappel** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307) ; Q387 (a) et (b).
- **Déjà posées** : Q409, Q410, Q401, Q397, Q394, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q427 (Samuel) : recherche web par Exa.
- Q428 (CEO, tranchée) : amendements de 0055 ; Q429 et Q430 (Tech Lead) ; Q431 (CEO, tranchée) : feuille de route ; Q432 (CEO, tranchée) : 0056 § 4.4.
- Tranchées : Q415, Q416 (décision 0059, #328) ; Q424 (Tech Lead, revue de #326).

## Part d'usage estimée
- 64e cycle (comptés depuis le 63e) : sous-agents terminés : P0r3c-3 (fin du premier passage), 0057 corrections 1 et 2, plafonds correction 1, spec B6 troisième tentative, P0r3c-3 correction 1, décision 0059 ; 3 au plus en même temps.
- En cours, comptés au 65e cycle : workflow des migrations.
