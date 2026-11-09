# 0168 — Précommande : la page d'accueil devient la page de prévente

Statut : **décidée par le CEO**, sur mandat de Samuel (fil du projet, 2026-11-09 22:24 et 22:25 UTC : « Je te donne les pleins pouvoirs », « un MVP fonctionnel, prêt aux précommandes », « une landing, la totale », « rien ne demande mes mains »). Samuel peut la remettre en cause à tout moment.

Date : 2026-11-09 · Rédacteur : CEO · Répond à Q357 (encaissement, conditions, prix) pour ce qui suit.

## Décision

1. **Interrupteur.** `PREVENTE=1` (exactement) : la page d'accueil affiche l'offre de précommande (`docs/commercial/page-prevente.md`) : prix, garantie, questions fréquentes, bouton « Précommander pour {prix} ». « Créer un voyage » disparaît, le produit n'étant pas ouvert ; la démonstration sur données simulées reste. Sans la variable, rien ne change.
2. **Paiement.** Un lien de paiement hébergé par Stripe (`PREVENTE_LIEN_PAIEMENT`, hôte `buy.stripe.com` seulement, HTTPS, sans identifiants ni port). L'application ne lit aucune clé, ne reçoit aucun webhook et ne garde aucune donnée personnelle : paiement, reçu et adresse e-mail restent chez Stripe. Lien absent ou invalide : page « La précommande ouvre très bientôt », jamais d'erreur. Le prix affiché vient de `OFFER_CONFIG` (0020 § 4) ; le lien Stripe doit porter le même montant.
3. **Provenance.** `?src=` (lettres minuscules, chiffres, tirets, 30 au plus) suit le bouton et part en `client_reference_id` : le compte « hors cercle proche » (0044) se lit dans Stripe.
4. **Conditions affichées.** Ouverture le **1er février 2027** ; remboursement intégral si le voyage complet n'est pas prêt à cette date ; remboursement sur simple demande avant l'ouverture. Prix : 29 CHF (Q2).
5. **Confinement.** Deux lignes nominatives (`src/adapters/prevente.ts` et son test) pour l'hôte du lien, et la lecture des deux variables, non secrètes. Verdict de la Sécurité à la revue de la PR.

## Reste à faire avant d'encaisser

- Créer le lien de paiement Stripe (29 CHF, TWINT et carte, adresse de retour `/precommande/merci`) et poser les deux variables sur la production.
- Mentions du vendeur (nom, adresse de contact) sur la page : informations à fournir par Samuel.
- Offre Vercel : l'offre gratuite interdit l'usage commercial (0163) ; à régler avant le premier paiement réel.
- Questionnaire en ligne et compteur de visites (seuils de 0044) : demandent une base en production.
