# Questionnaire en ligne — 5 questions

Rôle : `commercial` · Spécification : `specs/C1-prevente.md` (livrable 3) · Rédigé le 2026-10-13.

Il remplace les entretiens voyageurs du cadrage § 5 (décision 0043 § 4 : ni entretien ni appel pour les particuliers). Il compte pour le seuil G0 de **10 réponses** (décision 0044).

## Où il apparaît
1. **Après le paiement** de la prévente (message de confirmation, `page-prevente.md` § 6).
2. **En sortie de page**, pour qui n'a pas précommandé : un lien discret en bas de page, « Pas pour cette fois ? Dis-nous ce qui t'a retenu, en deux minutes. » Jamais de fenêtre qui bloque la lecture.

Une seule version, avec une branche à la question 4 selon que la personne a précommandé ou non.

## Règles
- 5 questions au plus, toutes facultatives ; durée visée : deux minutes.
- **Aucune donnée personnelle demandée** : ni nom, ni e-mail, ni numéro. Pas de champ libre obligatoire. Les champs libres portent la mention « N'indique ni nom, ni adresse, ni numéro. »
- Réponses rattachées au paiement seulement par un identifiant technique, jamais par l'identité, si la tâche backend le permet ; sinon réponses anonymes.
- Hébergement des réponses : dans l'application (tâche `frontend` ou `backend` ultérieure, Postgres en région UE, `docs/CONTEXT.md`, « Principes techniques »). Un outil de formulaire externe serait un compte externe et un sous-traitant de données : réservé à Samuel (`docs/CONTEXT.md`, « Qui décide quoi »).
- Vocabulaire et ton : `docs/handovers/frontend.md` § 10.

## Les questions

**Introduction** : Deux minutes pour nous aider à préparer Vadrouille. Toutes les questions sont facultatives.

### 1. Ton prochain voyage
« Où pars-tu, et quand ? »
- Destination : champ court (ville, région ou pays).
- Période : choix unique — Pâques 2027 · Ascension 2027 · Pentecôte 2027 · Un autre moment du printemps 2027 · Plus tard · Pas encore de date.
  (fenêtres du printemps : cadrage § 5)

### 2. Le voyage
« Combien de jours, et avec qui ? »
- Durée : moins de 5 jours · 5 à 10 jours · plus de 10 jours.
- Avec : en couple · en famille · entre amis · seul ou seule.
  (cible du MVP, couples, 5 à 10 jours : cadrage § 1)

### 3. Comment tu organises d'habitude
« Comment as-tu préparé ton dernier voyage ? » (plusieurs choix)
- Guides et blogs · Avis en ligne et cartes · Un assistant comme ChatGPT ou Gemini · Une application de voyage · Une agence · Je n'organise presque rien · Autre (champ court).
- Puis : « Qu'est-ce qui t'a pris le plus de temps ? » (champ libre court, facultatif)
  (reprend les deux premières questions des entretiens, cadrage § 5)

### 4. Ce qui t'a décidé, ou retenu
- **Si précommande** : « Qu'est-ce qui t'a décidé ? » (plusieurs choix) — Les adresses sourcées · Les événements pendant mon séjour · Pouvoir remplacer une étape facilement · Le prix · Le gain de temps · La démonstration · Autre (champ court).
- **Sinon** : « Qu'est-ce qui t'a retenu ? » (plusieurs choix) — Le prix · Pas de voyage prévu · Je préfère attendre que ce soit disponible · Un assistant gratuit me suffit · Je ne suis pas sûr ou sûre que ce soit fiable · Ma destination n'est pas couverte · Autre (champ court).
  (dernière question des entretiens, « demander une décision d'achat », cadrage § 5 ; risque « les voyageurs ne paient pas face aux outils gratuits », cadrage § 12)

### 5. Comment tu as connu Vadrouille
« Comment as-tu découvert Vadrouille ? » (choix unique)
- Je connais personnellement la personne qui crée Vadrouille · Par un ami ou une amie · Sur un forum ou un groupe de voyage · Sur Instagram · Par un ou une créatrice de contenu · Autre.
- Sert à compter les achats « hors cercle proche » (G0, décision 0044) en recoupant avec le paramètre de provenance du lien (`suivi.md`). Formulation qui ne demande aucun nom.

**Fin** : Merci. Tes réponses nous servent à choisir les destinations et à améliorer le produit.

## Lecture des réponses
- Chaque semaine, le nombre de réponses et la répartition des questions 1, 4 et 5 entrent dans `suivi.md`.
- Destinations (question 1) : base de la proposition D3 (cadrage § 1, 2 à 3 destinations selon la demande).
- Freins (question 4, branche « retenu ») : si « Le prix » domine, c'est un signal pour Samuel sur Q2 ; si « Un assistant gratuit me suffit » domine, c'est le risque critique du cadrage § 12. Le studio rapporte, Samuel décide.
