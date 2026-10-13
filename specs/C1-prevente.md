# C1 — Préparer la prévente (volet commercial de G0)

Rôle : `commercial` (décision 0043) · Ticket : à ouvrir par le CEO · Livrables dans `docs/commercial/`, documents seulement, aucun code.

## Objectif
Donner à Samuel tout ce qu'il faut pour vendre des préventes du voyage complet, **en libre-service et sans intervention humaine** (décision 0043 § 4), et mesurer le volet commercial de G0 (`docs/roadmap.md`, décision 0044) : 300 visites de la page de prévente, 10 réponses au questionnaire, au moins 5 achats ou préventes payés dont au moins 3 hors cercle proche. Samuel publie et encaisse ; le studio prépare.

## Références
- `docs/produit/cadrage-v5.md` : § 2 (promesse, concurrence, benchmark), § 3.1 (parcours : on découvre avant de payer), § 4 (produit en libre-service, prix à tester), § 5 (saisonnalité, acquisition initiale, page d'offre avec un vrai prix), § 11 (budget), § 12 (risques), § 13 (suivi).
- `QUESTIONS.md` : Q1 (nom « Vadrouille », domaine à proposer à Samuel), Q2 (29 CHF, révisable).
- Démonstration existante de l'application (spec D1) et maquettes `docs/ux/maquettes/`.

## À livrer
1. **`docs/commercial/offre-prevente.md`** : l'offre en une page. Le voyage complet en libre-service à 29 CHF (Q2) ; ce qui est inclus (cadrage § 4, « Voyage complet ») ; date à partir de laquelle l'achat est utilisable ; remboursement si le produit n'est pas livré à temps ; voyages visés (printemps 2027 : Pâques 28 mars, Ascension 6 mai, Pentecôte 16 mai) ; destinations mises en avant (D3). Recommandation éventuelle d'un prix de lancement pour la prévente, posée comme question à Samuel.
2. **`docs/commercial/page-prevente.md`** : textes complets de la page de prévente (titre, promesse, démonstration, ce qui est inclus, prix, questions fréquentes, appel à l'achat), avec le vocabulaire de `docs/handovers/frontend.md`. Un vrai prix et un vrai paiement, pas une liste d'attente (cadrage § 5). Aucune promesse d'aide humaine.
3. **`docs/commercial/questionnaire.md`** : un questionnaire en ligne de 5 questions au plus, proposé après l'achat ou en sortie de page (voyage prévu, dates, destination, comment la personne organise d'habitude, ce qui l'a décidée ou retenue) ; il remplace les entretiens du cadrage § 5.
4. **`docs/commercial/diffusion.md`** : où se faire connaître sans démarchage individuel : groupes et forums de voyageurs francophones (Suisse romande d'abord) avec leurs règles sur les publications commerciales, créateurs spécialisés, réseau personnel de Samuel. Un texte de publication par type de lieu. Aucune donnée personnelle (voir `.claude/agents/commercial.md`).
5. **`docs/commercial/demo-avant-apres.md`** : script de la démonstration avant/après (cadrage § 2 et § 5) : même brief d'Édimbourg dans un assistant généraliste et dans Vadrouille, les quatre points de différence (fiabilité, sélection, actualité, adaptation), captures à produire.
6. **`docs/commercial/reseaux-sociaux.md`** : recommandation d'un ou deux canaux au plus, ligne éditoriale, 8 premiers brouillons de publications et calendrier sur 4 semaines, coût éventuel dans l'enveloppe de 100 CHF (cadrage § 11).
7. **`docs/commercial/suivi.md`** : tableau de suivi hebdomadaire (cadrage § 13, sans les lignes de temps humain par dossier) : visites de la page, achats et préventes, provenance, réponses au questionnaire, dépenses d'acquisition ; seuils G0 en regard.

## Critères d'acceptation
- Chaque chiffre (prix, budget, seuil, date) cite sa source dans le dépôt (section du cadrage, question, décision) ; aucun n'est inventé.
- Toute affirmation sur un concurrent ou un lieu de diffusion porte sa source et sa date de consultation.
- Aucun livrable ne prévoit d'entretien, d'appel, de pilote accompagné ni de vérification humaine pour les particuliers.
- Aucune adresse e-mail, aucun numéro, aucun nom de personne privée dans le dépôt.
- Chaque choix réservé à Samuel est posé comme une question avec une recommandation, dans la description de la PR, et n'est pas présenté comme tranché.
- Rien n'est envoyé, publié, acheté ni ouvert hors du dépôt.
- `pnpm verify` vert.

## Hors périmètre
- La page de prévente dans l'application, le questionnaire et le lien de paiement : tâche `frontend` ou `backend` ultérieure, après les réponses de Samuel (paiement réel = Q26).
- Le business plan détaillé au-delà du cadrage § 4 et § 11 : seulement si Samuel le demande.
- Le volet agences (reporté par Samuel, décision 0043 § 4).

## Questions ouvertes (Samuel)
1. ~~Seuils commerciaux de G0~~ : **tranchée par Samuel** (2026-10-13, décision 0044) : 300 visites de la page de prévente, 10 réponses au questionnaire, 5 achats ou préventes dont 3 hors cercle proche.
2. Comment encaisser une prévente avant le paiement réel de l'application (Q26) : lien de paiement TWINT ou carte ouvert par Samuel ? Qui l'ouvre et quand ?
3. Achat du domaine (Q1, environ 30 CHF au cadrage § 11) : quand ?
4. Quels réseaux sociaux ouvrir, au nom de qui, et qui publie ?
5. Conditions de prévente (remboursement, délai de livraison) : relecture juridique légère sur la réserve du budget ?
