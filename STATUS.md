# État du studio — 2026-10-14 (65e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Aucun nouveau message de Samuel depuis le 64e cycle (projet et #studio). Carte Exa (Q427) et fusion de #330 toujours en attente.

## Fait
- Fusionnées depuis le 64e cycle : **décision 0059** (#328, correction 1 : B9 attend aussi B6b, numérotation vérifiée), statut du 64e cycle (#329), **région `fra1`** (#322).
- **PR de `main` vers `p0-reel`** ouverte (#330) : met à jour la branche des essais (exception TLS de 0058, région `fra1`). Aucun essai réel ne démarre. Fusion par Samuel seul (D23).
- **P0r3c-3** (#326) : correction 2, la dernière, poussée (3254723). Aux étapes plan et recherche, le modèle reçoit le brief **sans les logements** ; le filtre des requêtes reste comme filet (normalisation Unicode, fragments de 4 caractères, récit court). Tests en cyrillique et japonais.
- Ticket **#333** : décision 0060 du Tech Lead (port du cache de positions et purge du MVP, B8-TL-2 et B8-TL-3), préalable du ticket de B8c (0059 § 4).

## En cours
- **Décision 0060** (Tech Lead, #333).
- **Workflow des migrations et du relevé** (#332) : correction 1 (data). Un bloquant du Tech Lead (harnais cassé dès que la liste des migrations approuvées n'est plus vide) ; Sécurité : approuvé sur d647077.
- En revue : P0r3c-3 (#326, dernière correction).

## Bloqué
- **Premier essai réel** : réponse de Samuel sur la recherche web par Exa (Q427, limite précisée par la correction 2 de #326) ; fusion de #330 par Samuel ; relevé de la Sécurité sur la préversion de `p0-reel` ; P0r3c-4 après #326 ; P0r3d.
- **Workflow des migrations** : revue de la correction 1 ; puis `owner-approved` de Samuel ; Q387 (a) et (b).
- **Purge `p0-purge`** : en échec toutes les 6 heures tant que ses secrets sont vides (attendu, Q387).
- **B8c** : décision 0060. **B6a** : B3b. **B8a** : B7a, B7c, P0r3c-3. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Après la fusion de #330 par Samuel : relevé de la Sécurité sur la préversion de `p0-reel`.
2. Après #326 : lancer P0r3c-4 ; si #326 reste bloquée, troisième tentative ou découpage (CEO et Tech Lead).
3. Après 0060 : ticket de B8c (data), mise à jour de `docs/roadmap.md` (Q431) ; vérifier qu'aucune PR ouverte n'ajoute une migration dans le même cycle (0059 § 4).
4. Revue de la correction 1 de #332, puis `owner-approved` de Samuel ; décision du Tech Lead consignant ses réponses (0061 réservé).

## Décisions attendues de Samuel
- **En attente** : Q427 (recherche web de l'essai par Exa ; reco : accepter pour les essais) ; fusion de #330 (un clic).
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
- Q433 et Q434 (Tech Lead, tranchées à la revue de #332) : `SET search_path` non local, liste vide ; Q435 (Tech Lead, tranchée) : `push: main` dans une petite PR dédiée ; Q436 (Tech Lead, tranchée) : test des 600 lignes conservé.
- Q437 (Product Owner) : le filet de #326 refuse aussi des requêtes légitimes (« vieille ville » pour Édimbourg).
- Q427 précisée (correction 2 de #326) ; Q419 tranchée (voie 1).

## Part d'usage estimée
- 65e cycle : sous-agents terminés : workflow des migrations (fin du premier passage), décision 0059 correction 1, P0r3c-3 correction 2 ; 3 au plus en même temps.
- En cours, comptés au 66e cycle : décision 0060, workflow des migrations correction 1.
