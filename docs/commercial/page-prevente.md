# Page de prévente — textes complets

Rôle : `commercial` · Spécification : `specs/C1-prevente.md` (livrable 2) · Rédigé le 2026-10-13.

Textes prêts à intégrer par le rôle `frontend` (tâche ultérieure, hors périmètre de C1) dans `src/i18n/fr.json`. Règles appliquées : `docs/handovers/frontend.md` § 10 (tutoiement, phrases courtes, pas de point d'exclamation, pas d'emoji ; « Débloquer », « Payer avec TWINT », « Payer par carte » ; jamais « Acheter maintenant », « Premium », « Aperçu »).

Un vrai prix et un vrai paiement, pas une liste d'attente (cadrage § 5, « Acquisition initiale »). Aucune promesse d'aide humaine (décision 0043 § 4).

Les valeurs entre crochets attendent Samuel : [DATE D'OUVERTURE] et la règle de remboursement (question 5), [N] remplacements (Q88), le moyen d'encaissement (question 2).

---

## 1. En-tête
- **Nom** : Vadrouille (Q1, tranchée le 2026-10-08)
- **Titre (h1)** : Ton voyage, de l'hôtel à la soirée.
- **Promesse** : Quoi faire, où manger et ce qui se passe pendant ton séjour. (promesse de travail, cadrage § 2 ; `docs/CONTEXT.md`)
- **Sous-titre** : Précommande ton voyage complet pour le printemps : 29 CHF, utilisable dès le [DATE D'OUVERTURE].
- **Bouton principal** : Précommander pour 29 CHF (ancre vers la section 6)

## 2. Ce que fait Vadrouille
- **Titre (h2)** : Un programme que tu peux vraiment suivre
- Tu racontes ton voyage en quelques phrases : dates, logement, envies, rythme.
- Vadrouille cherche le meilleur de la destination et l'organise jour par jour : visites, repas, soirées, temps libre.
- Tu tries les propositions : J'aime ou Pas pour moi. Le programme s'ajuste.
- Tu remplaces une étape en gardant ce qui compte, comme ton restaurant de 19:00.

(Parcours : cadrage § 3.1, écrans 2, 6, 14 ; exemple du restaurant : cadrage § 3.4.)

## 3. Pourquoi pas un assistant généraliste
- **Titre (h2)** : Ce qui change d'un itinéraire généré par un assistant
- **Fiable** : aucun lieu inventé ou fermé. Horaires et dates sont sourcés et datés. Ce qui n'est pas sûr est marqué « À confirmer ».
- **Choisi** : chaque adresse dit pourquoi elle est là pour toi, avec sa source.
- **D'actualité** : les événements réellement prévus pendant tes dates. Un événement sans source relue reste « Non confirmé ».
- **Adaptable** : tu changes une étape en quelques gestes, sans casser tes réservations ni tes horaires fixes.

(Quatre points de différenciation : cadrage § 2. Ces affirmations décrivent la cible du produit ; tant que le prototype n'a pas passé G0, la page ne publie aucun chiffre de fiabilité.)

## 4. Démonstration
- **Titre (h2)** : Le même voyage, deux résultats
- **Introduction** : Un vrai voyage à Édimbourg, fin août : arrivée à midi, le Tattoo le samedi à 21:30, une journée dans les Highlands. On a donné le même récit à un assistant généraliste et à Vadrouille.
- **Légende « avant »** : L'assistant généraliste : un itinéraire plausible, à vérifier ligne par ligne.
- **Légende « après »** : Vadrouille : les étapes sourcées, les trajets du jour, le Tattoo gardé à son horaire.
- **Mention obligatoire tant que les captures viennent des données de démonstration** : Exemple réalisé sur des données simulées. Les lieux entre crochets ne sont pas vérifiés. (même mention que `specs/D1-demo.md`)
- **Lien** : Voir la démonstration (vers la section « Démonstration » de l'accueil, `specs/D1-demo.md`)

(Script et captures : `demo-avant-apres.md`. Brief : cadrage § 2, « Benchmark ».)

## 5. Ce qui est inclus
- **Titre (h2)** : Le voyage complet
- Toutes les journées de ton voyage, repas et soirées compris
- Les événements pendant ton séjour
- Jusqu'à [N] remplacements pour ajuster ton programme
- La liste à réserver avant de partir
- Le calendrier et le partage avec tes proches
- L'accès jusqu'à 30 jours après ton retour

(Cadrage § 4, « Voyage complet » ; libellés repris de l'écran 9, `src/i18n/fr.json`, `debloquer.offre.inclus`.)

- **Phrase sous la liste** : Tout se fait dans l'application, quand tu veux. Pas de rendez-vous, pas d'appel.

## 6. Prix et paiement
- **Titre (h2)** : 29 CHF pour un voyage
- Paiement unique pour ce voyage, sans abonnement. (texte de l'écran 9, `debloquer.offre.paiementUnique` ; prix : Q2)
- Utilisable dès le [DATE D'OUVERTURE], pour un voyage de 5 à 10 jours en Europe. (cible : cadrage § 1)
- Si le voyage complet n'est pas prêt au [DATE D'OUVERTURE], tu es remboursé intégralement. (règle proposée, question 5)
- **Boutons** : Payer avec TWINT · Payer par carte (`docs/handovers/frontend.md` § 10 ; afficher seulement les moyens réellement ouverts par Samuel, question 2)
- **Après le paiement** : Merci. Ta précommande est enregistrée. Tu recevras ton accès au voyage complet le [DATE D'OUVERTURE]. Deux minutes pour nous dire où tu pars ? (lien vers le questionnaire, `questionnaire.md`)

## 7. Questions fréquentes
- **Qu'est-ce que j'achète exactement ?**
  Le voyage complet pour un voyage : toutes les journées, repas, soirées, événements, la liste à réserver et l'accès jusqu'à 30 jours après ton retour.
- **Quand pourrai-je l'utiliser ?**
  À partir du [DATE D'OUVERTURE]. Tu prépares alors ton voyage dans l'application, au moment qui te convient.
- **Et si ce n'est pas prêt à temps ?**
  Tu es remboursé intégralement, sans justification. [Règle exacte et délai : question 5.]
- **Pour quelles destinations ?**
  Les villes et régions d'Europe. Tu nous dis la tienne dans le questionnaire après la précommande : on s'en sert pour choisir les destinations mises en avant.
- **Est-ce un abonnement ?**
  Non. Un paiement, un voyage.
- **Vadrouille réserve-t-il à ma place ?**
  Non. Vadrouille te dit ce qui est « À réserver », avec le lien, et tu réserves toi-même.
- **Les adresses sont-elles vérifiées ?**
  Chaque lieu est vérifié à partir de ses sources au moment où ton programme est créé. Les horaires et les dates portent leur date de vérification ; ce qui reste incertain est marqué « À confirmer » ou « Non confirmé ». (cadrage § 2 et § 3.2 ; formulation à aligner sur le produit livré)
- **Quelqu'un relit-il mon programme ?**
  Non. Vadrouille est entièrement en libre-service : tout se fait dans l'application.
- **Que devient ce que je saisis ?**
  [Texte à fournir après la décision de Samuel sur les données personnelles et les conditions de vente : Q127 et question 5.]

## 8. Appel final
- **Titre (h2)** : Ton printemps se prépare maintenant
- Pâques, l'Ascension, la Pentecôte : les voyages de printemps se préparent de janvier à mars. (dates et saisonnalité : cadrage § 5)
- **Bouton** : Précommander pour 29 CHF

## 9. Pied de page
- Vendeur, conditions de vente, remboursement, données personnelles : [à fournir par Samuel ; Q127 (mentions avant paiement), question 5].
- Aucun lien vers des réseaux sociaux tant que les comptes ne sont pas ouverts par Samuel (question 4).

## Mesure (pour la tâche frontend)
- Compter chaque visite de la page sans donnée personnelle (décision 0044, « Conséquences » ; outil à proposer à Samuel s'il engage un compte externe).
- Lire la provenance par un paramètre de lien par lieu de diffusion (`?src=forum`, `?src=instagram`, `?src=proches`…), sans cookie ni identifiant personnel ; liste des valeurs : `suivi.md`.
- Réutiliser les événements `paywall_viewed`, `payment_started`, `payment_succeeded` (`docs/handovers/frontend.md` § 12), avec `price_variant`.
