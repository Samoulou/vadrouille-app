# Questionnaire en ligne — 5 questions, 5 saisies

Rôle : `commercial` · Spécification : `specs/C1-prevente.md` (livrable 3) · Rédigé le 2026-10-13.

Il remplace les entretiens voyageurs du cadrage § 5 (décision 0043 § 4 : ni entretien ni appel pour les particuliers). Il compte pour le seuil G0 de **10 réponses** (décision 0044).

## Où il apparaît
1. **Après le paiement** de la prévente (message de confirmation, `page-prevente.md` § 6).
2. **En sortie de page**, pour qui n'a pas précommandé : un lien discret en bas de page, « Pas pour cette fois ? Dis-nous ce qui t'a retenu, en deux minutes. » Jamais de fenêtre qui bloque la lecture.

Une seule version, avec une branche à la question 4 selon que la personne a précommandé ou non (une seule des deux listes s'affiche : une saisie).

Numérotation : « question N » renvoie à la question Q-C1-N à Samuel de la description de la PR #256 ; une question du questionnaire en ligne est toujours dite « question N du questionnaire ».

## Règles
- 5 questions au plus, toutes facultatives ; durée visée : deux minutes. **Une question = une saisie** : pas de sous-question, pas de second champ. « Autre » est une case simple, sans champ libre.
- **Aucune donnée personnelle demandée** : ni nom, ni e-mail, ni numéro. Un seul champ libre (question 1), facultatif, avec la mention « N'indique ni nom, ni adresse, ni numéro. »
- **Rattachement au paiement : non tranché, question 8 à Samuel (avec Q127).** Relier une réponse à un paiement, même par un identifiant technique, relie ces réponses à une personne identifiable (le payeur) : c'est une question de données personnelles, réservée à Samuel. Recommandation : réponses anonymes, sans rattachement ; seule la branche de la question 4 (précommande ou non) est enregistrée. Le compte « hors cercle proche » repose alors sur le paramètre `src` du paiement (`suivi.md`).
- Hébergement des réponses : dans l'application (tâche `frontend` ou `backend` ultérieure, Postgres en région UE, `docs/CONTEXT.md`, « Principes techniques »). Un outil de formulaire externe serait un compte externe et un sous-traitant de données : réservé à Samuel (`docs/CONTEXT.md`, « Qui décide quoi »).
- Vocabulaire et ton : `docs/handovers/frontend.md` § 10.

## Les questions

**Introduction** : Deux minutes pour nous aider à préparer Vadrouille. Toutes les questions sont facultatives.

### 1. Ta destination
« Où pars-tu ? » (champ court, facultatif : ville, région ou pays)

### 2. Tes dates
« Quand pars-tu ? » (choix unique) — Pâques 2027 · Ascension 2027 · Pentecôte 2027 · Un autre moment du printemps 2027 · Plus tard · Pas encore de date.
(fenêtres du printemps : cadrage § 5)

### 3. Comment tu organises d'habitude
« Comment as-tu préparé ton dernier voyage ? » (plusieurs choix) — Guides et blogs · Avis en ligne et cartes · Un assistant comme ChatGPT ou Gemini · Une application de voyage · Une agence · Je n'organise presque rien · Autre.
(reprend les deux premières questions des entretiens, cadrage § 5)

### 4. Ce qui t'a décidé, ou retenu
- **Si précommande** : « Qu'est-ce qui t'a décidé ? » (plusieurs choix) — Les adresses sourcées · Les événements pendant mon séjour · Pouvoir remplacer une étape facilement · Le prix · Le gain de temps · La démonstration · Autre.
- **Sinon** : « Qu'est-ce qui t'a retenu ? » (plusieurs choix) — Le prix · Pas de voyage prévu · Je préfère attendre que ce soit disponible · Un assistant gratuit me suffit · Je ne suis pas sûr ou sûre que ce soit fiable · Ma destination n'est pas couverte · Autre.
  (dernière question des entretiens, « demander une décision d'achat », cadrage § 5 ; risque « les voyageurs ne paient pas face aux outils gratuits », cadrage § 12)

### 5. Comment tu as connu Vadrouille
« Comment as-tu découvert Vadrouille ? » (choix unique) — Je connais personnellement la personne qui crée Vadrouille · Par un ami ou une amie · Sur un forum ou un groupe de voyage · Sur Instagram · Par un ou une créatrice de contenu · Autre.
- Sert à lire la provenance des réponses en agrégé. Elle ne recoupe un achat que si Samuel accepte le rattachement au paiement (question 8) ; sinon le compte « hors cercle proche » repose sur `src` seul (`suivi.md`, règle proposée, question 7). Formulation qui ne demande aucun nom.

Retiré de la version précédente pour tenir 5 saisies : la durée et « avec qui » (déjà fixés par la cible du MVP, couples, 5 à 10 jours, cadrage § 1), la sous-question « Qu'est-ce qui t'a pris le plus de temps ? » et les champs « Autre » à texte libre.

**Fin** : Merci. Tes réponses nous servent à choisir les destinations et à améliorer le produit.

## Lecture des réponses
- Chaque semaine, le nombre de réponses et la répartition des questions 1, 2, 4 et 5 du questionnaire entrent dans `suivi.md`.
- Destinations (question 1 du questionnaire) : base de la proposition D3 (cadrage § 1, 2 à 3 destinations selon la demande).
- Freins (question 4 du questionnaire, branche « retenu ») : si « Le prix » domine, c'est un signal pour Samuel sur Q2 ; si « Un assistant gratuit me suffit » domine, c'est le risque critique du cadrage § 12. Le studio rapporte, Samuel décide.
