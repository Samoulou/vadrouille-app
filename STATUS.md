# État du studio — 2026-10-14 (57e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 57e cycle a été lancé à 06:51 CEST, à la demande de Samuel (fil du projet), avant l'heure de la routine.

## Messages de Samuel traités (projet)
- 2026-10-14, 06:10 à 06:50 CEST, fil du projet : coût d'un essai réel et économies. **Décision 0053** (#289, fusionnée) : 500 trajets Routes au plus par voyage, répartis par jour, gratuité Google réservée à ses essais, provisoire jusqu'à ses essais (Q390). **Amendement 1** (#290, en revue) : économies retenues pour P0r3 (fiches de lieux des seuls lieux de la première série de cartes, cache de positions, profil d'IA léger, tri à vol d'oiseau avant Routes) et économies en réserve (gratuité comptée dans la réserve, hausse du plafond Google, calcul de trajets open source, recherche élargie après les « j'aime »). Q329 confirmée.
- 06:51 CEST : « Tu peux démarrer le cycle » ; ce cycle.
- #studio : aucun nouveau message. Les cartes Q366 et Q383 restent sans réponse.

## Fait
- Fusionnées depuis le 56e cycle : statut du 56e cycle (#285), **B5c** (#276, moteur sans IA complet), **décisions 0050 et 0051** (#280, préalables de B3a, troisième tentative), **décision 0053** (#289).
- **P0r2** (#287, base du prototype) : approuvée par le Tech Lead et la Sécurité, CI au vert ; attend `owner-approved` de Samuel (la PR ajoute `.github/workflows/p0-purge.yml`).
- **Décision 0052** (#283) : correction 2, la dernière, poussée (migrations exécutées dans un bloc `DO`, garde du `search_path`, exception d'empreinte calculée sur les fichiers).
- **Spec B7** (#288, couche IA et recherche) : écrite par le product owner (ticket #286) ; découpage proposé en B7a, B7b et B7c.

## En cours
- Fils actifs : spec B7 correction 1 (#288, 4 bloquants du Tech Lead sur les contrats, le schéma et la liste blanche d'imports) ; 0052, bloquant tardif non compté (#283, verrou S11 contournable par un déclencheur sur `vadrouille_migrations.applied`).
- En revue : amendement 1 de 0053 (#290).

## Bloqué
- **Premier essai réel (P0r3, puis P0r4)** : `owner-approved` de Samuel sur P0r2 (#287) ; fusion de 0052 ; sur la base réelle, Q366, Q367, Q387 et Q394.
- **Code de B7** : fusion de la spec (#288), décision 0054 (découpage, Q396), puis fusion de P0r3 pour B7a.
- **Code de B3a** : levée du délai de veto (Q383) ou le 2026-10-16 ; porte de fusion Q381.
- **B8** : spec à écrire après la spec B7 (dépend de ses interfaces).
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Après la fusion de P0r2 : ticket P0r3 (ia-recherche, avec backend) avec les économies de 0053 et le client réel de recherche web dans `src/ai` (Q396).
2. Après la fusion de la spec B7 : décision 0054 (découpage) et spec B8.
3. Si #283 reste bloquée après le bloquant tardif : troisième tentative ou découpage, avec le Tech Lead.
4. Vérifier à chaque cycle qu'aucune PR approuvée sans bloquant n'attend `techlead-approved`, et que les PR en `needs-review` ont bien été relues (Q365).

## Décisions attendues de Samuel
- **Maintenant** : `owner-approved` sur P0r2 (#287) ; carte Q383 (lever le délai de veto sur le découpage de B3, reco : lever) ; carte Q366 (préversions et données du prototype, reco : accepter).
- **Nouvelles** : Q394 (relevé des secrets avant chaque lancement des migrations), Q397 (plafonds du MVP, évaluations payantes, brief de Zakynthos).
- **Prévente** : Q357 et Q362 ; les documents sont fusionnés (#256).
- **Déjà posées** : Q387, Q381, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q330, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - avant le 2026-10-16 : décision 0047 (découpage de `fr.json`, #269) ; découpage de B3 (0050) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q390 (Samuel, tranchée : décision 0053), Q391 (Product owner), Q392 et Q393 (Tech Lead) : P0r2.
- Q394 (Samuel), Q395 (Tech Lead) : décision 0052.
- Q396 (CEO, tranchée), Q397 (Samuel) : spec B7.
- Complétées : Q329 (confirmée), Q370 et Q389 (0053).

## Part d'usage estimée
- 57e cycle (comptés depuis le 56e) : 6 sous-agents, 3 au plus en même temps :
  - P0r2 (0,14 M) ;
  - 0050 et 0051 troisième tentative (0,22 M) ;
  - 0052 correction 2 (0,2 M) ;
  - spec B7 (0,31 M) ;
  - spec B7 correction 1 et 0052 bloquant tardif en cours (comptés au prochain cycle).
