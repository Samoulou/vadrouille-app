# 0134 — Formulaire de création guidé : étape visible, idées pour le récit, mots simples

Statut : **acceptée** · Date : 2026-10-28 · Décideur : UX/UI (rendus et textes des écrans de création, 0018 § 14 à 16) · Ticket : #813 · Définitive à sa fusion (0093). À lister dans la prochaine note de version (« Décisions prises par le studio »).

## Contexte
Audit UX du 2026-10-28 demandé par Samuel (fil « Rendre l'app séduisante pour les nouveaux clients »), lot 3 : https://claude.ai/artifact/2gYGfXxf8XkmYeAajEGKLF. Une nouvelle personne ne savait pas combien d'écrans restaient, se retrouvait devant une zone de texte vide et lisait « brief », un mot de métier.

## Décision
1. **Étape visible (remplace 0018 § 14, « Pas d'indicateur »).** Écrans 1 à 3 : « Étape {n} sur {total} » à droite de « Retour », sur la même ligne, `corps-s` 600 `ink-soft`, chiffres tabulaires. Lu après « Retour », avant le titre ; texte simple, sans région live.
   - Le nombre varie (raison du refus de 0018) : `total` vaut 3 si une ville n'a pas encore de réponse au logement ou a répondu « Pas encore », 2 sinon (`stepTotal`). L'écran 1 le recalcule à chaque réponse ; l'écran 3, répété pour chaque ville « Pas encore », reste « Étape 3 sur 3 ».
   - Connexion, code d'accès du site d'essai, lancement et écran 5 n'en ont pas : ce ne sont pas des étapes du formulaire.
2. **Exemple de récit.** La zone de texte de l'écran 2 porte un texte indicatif (`placeholder`, `ink-soft`) qui commence par « Par exemple : ». Le nom et l'aide du champ ne changent pas.
3. **Idées à ajouter.** Sous le compteur, un groupe « Idées à ajouter » (titre de niveau 2, aide) de huit `Chip`. Toucher une idée ajoute sa phrase à la fin du récit ; la toucher encore la retire. Une idée est « choisie » (`aria-pressed`) tant que sa phrase est dans le récit. Rien n'est ajouté si le récit dépasserait 1 000 caractères. Le récit reste le seul texte envoyé ; les idées ne contiennent aucune donnée personnelle.
4. **Mots simples.** « brief » disparaît de l'interface de création :
   - « Préparer mon brief » → « Continuer avec mon récit » ; site d'essai : « Vérifier mon brief » → « Vérifier mes envies » ;
   - « Vérifie ton brief » → « Vérifie tes envies » ; titre du document « Nouveau voyage · Tes envies » ;
   - attente « On lit ton récit… », erreurs et aides alignées (« remplis tes envies toi-même ») ;
   - messages de reprise du site d'essai : « puis réessaie ».
5. **« Déjà réservé ».** La section « Engagements déjà pris » devient « Déjà réservé » (mot imposé, handover § 10, « Réservations ») ; « Ajouter une réservation », « Réservation {n} », « Type de réservation » (Vol, Table ou activité, Billet : « Réservation » n'est plus une option, pour ne pas répéter le titre), aide « Un vol, une table, un billet : on les garde tels quels dans ton programme. »

## Hors décision
- 2 adultes par défaut au lieu d'un : réservé au Product Owner (valeur de départ du brief). Question dans la PR.
- Le mot « brief » reste dans le code, les contrats et l'outil interne du prototype.

## Conséquences
- Références visuelles de la création régénérées (décision 0004).
- Captures 390 × 844 dans `docs/ux/captures/813/`.
