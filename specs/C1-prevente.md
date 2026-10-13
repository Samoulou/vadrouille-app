# C1 — Préparer la prévente (volet commercial de G0)

Rôle : `commercial` (décision 0043) · Ticket : à ouvrir par le CEO · Livrables dans `docs/commercial/`, documents seulement, aucun code.

## Objectif
Donner à Samuel tout ce qu'il faut pour obtenir le volet commercial de G0 : 30 prospects voyageurs contactés, au moins 10 échanges approfondis, au moins 5 achats ou préventes payés dont au moins 3 hors cercle proche (`docs/roadmap.md`, cadrage § 5). Samuel envoie, publie et encaisse ; le studio prépare.

## Références
- `docs/produit/cadrage-v5.md` : § 2 (promesse, concurrence, benchmark), § 3.1 (parcours), § 4 (offre, pilote assisté, prix, agences), § 5 (validation et ventes, saisonnalité, questions d'entretien, acquisition initiale), § 11 (budget), § 12 (risques), § 13 (suivi et prochaines actions).
- `QUESTIONS.md` : Q1 (nom « Vadrouille », domaine à proposer à Samuel), Q2 (29 CHF, révisable).
- Démonstration existante de l'application (spec D1) et maquettes `docs/ux/maquettes/`.

## À livrer
1. **`docs/commercial/offre-prevente.md`** : l'offre de prévente en une page. Ce qui est vendu (voyage complet ou pilote assisté), prix proposé avec recommandation entre 29 CHF (Q2) et le pilote assisté 49 CHF (cadrage § 4), date de livraison promise, remboursement si non livré, voyages visés (printemps 2027 : Pâques 28 mars, Ascension 6 mai, Pentecôte 16 mai), destinations mises en avant (D3).
2. **`docs/commercial/page-prevente.md`** : textes complets de la page de prévente (titre, promesse, démonstration, ce qui est inclus, prix, questions fréquentes, appel à l'achat), avec le vocabulaire de `docs/handovers/frontend.md`. Une page avec un vrai prix et un vrai paiement, pas une liste d'attente (cadrage § 5).
3. **`docs/commercial/guide-entretien.md`** : guide d'entretien voyageur (questions du cadrage § 5, ordre, relances, moment de la proposition d'achat) et version courte pour les agences (cadrage § 4, Validation) ; fiche de compte rendu d'une page.
4. **`docs/commercial/prospection.md`** : où trouver 30 prospects. Lieux de prospection publics et nommés (groupes et forums de voyageurs francophones, Suisse romande d'abord, avec leurs règles sur les sollicitations ; créateurs spécialisés ; agences indépendantes romandes par nom commercial). Trois messages de premier contact (proche, groupe, agence). Aucune donnée personnelle (voir `.claude/agents/commercial.md`).
5. **`docs/commercial/demo-avant-apres.md`** : script de la démonstration avant/après (cadrage § 2 et § 5) : même brief d'Édimbourg dans un assistant généraliste et dans Vadrouille, les quatre points de différence (fiabilité, sélection, actualité, adaptation), captures à produire.
6. **`docs/commercial/reseaux-sociaux.md`** : recommandation d'un ou deux canaux au plus, ligne éditoriale, 8 premiers brouillons de publications et calendrier sur 4 semaines, coût éventuel dans l'enveloppe de 100 CHF (cadrage § 11).
7. **`docs/commercial/suivi.md`** : tableau de suivi hebdomadaire (cadrage § 13) : contacts, échanges, offres, achats et préventes, provenance, temps passé ; avec les seuils G0 en regard.

## Critères d'acceptation
- Chaque chiffre (prix, budget, seuil, date) cite sa source dans le dépôt (section du cadrage, question, décision) ; aucun n'est inventé.
- Toute affirmation sur un concurrent ou un lieu de prospection porte sa source et sa date de consultation.
- Aucune adresse e-mail, aucun numéro, aucun nom de personne privée dans le dépôt.
- Chaque choix réservé à Samuel est posé comme une question avec une recommandation, dans la description de la PR, et n'est pas présenté comme tranché.
- Rien n'est envoyé, publié, acheté ni ouvert hors du dépôt.
- `pnpm verify` vert.

## Hors périmètre
- La page de prévente dans l'application et le lien de paiement : tâche `frontend` ou `backend` ultérieure, après les réponses de Samuel (paiement réel = Q26).
- Le business plan détaillé au-delà du cadrage § 4 et § 11 : seulement si Samuel le demande.
- Le pilote avec des agences (phase 3).

## Questions ouvertes (Samuel)
1. Quelle offre vendre en prévente : le voyage complet à 29 CHF, le pilote assisté à 49 CHF, ou les deux ? (recommandation dans `offre-prevente.md`)
2. Comment encaisser une prévente avant le paiement réel de l'application (Q26) : lien de paiement TWINT ou carte ouvert par Samuel ? Qui l'ouvre et quand ?
3. Achat du domaine (Q1, environ 30 CHF au cadrage § 11) : quand ?
4. Quels réseaux sociaux ouvrir, au nom de qui, et qui publie ?
5. Conditions de prévente (remboursement, délai de livraison) : relecture juridique légère sur la réserve du budget ?
