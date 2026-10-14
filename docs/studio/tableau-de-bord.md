# Tableau de bord produit

Demande de Samuel du 2026-10-14 (ticket #306) : un tableau lisible par un PO ou un PM, mis à jour à la fin de chaque cycle, qui montre l'avancement des fonctionnalités en mots simples et l'état de chaque grand chantier (epic).

**Lien unique :** https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v

C'est une page Artifact privée de Samuel, qu'il ouvre depuis l'app Claude. Elle ne vit pas dans le dépôt : sa source est la version publiée elle-même. Rien ne tourne sur la machine de Samuel.

## Quand
À chaque cycle, étape 7 bis du prompt R1 (`docs/studio/mise-en-place.md`, annexe B) : après la PR « chore: status » (étape 7), avant le résumé dans `#studio` (étape 8), qui cite le lien.

## Comment
1. Lis la version publiée avec l'outil Artifact (`action: "read"`, `url` : le lien ci-dessus). Pars toujours de cette version, jamais d'une copie ancienne.
2. Reporte l'état du cycle à partir des sources de vérité : `docs/roadmap.md`, `STATUS.md`, `QUESTIONS.md` et les PR fusionnées depuis le cycle précédent, tels qu'ils sont sur `main` au moment de la lecture. La PR « chore: status » du cycle peut ne pas être encore fusionnée : le tableau reflète `main`, pas cette PR. Le tableau ne dit rien que le dépôt ne dise pas.
3. Republie avec l'outil Artifact (`action: "publish"`, même `url`, sans `icon`). Une publication sans `url` crée un autre lien : interdit sans accord de Samuel.
4. Le résumé `#studio` (étape 8) cite le lien.

## En cas d'échec
Si l'outil Artifact n'est pas disponible dans la session du cycle, si l'Artifact est introuvable ou si la lecture est refusée :
- ne republie pas et ne crée pas de nouveau lien (interdit sans accord de Samuel) ;
- signale-le dans le résumé `#studio` du cycle, avec la raison ;
- reporte-le dans `STATUS.md`, rubrique « Bloqué », par la PR « chore: status » du cycle suivant (la PR du cycle en cours est déjà ouverte) ; si l'Artifact est introuvable ou la lecture refusée, pose aussi la question à Samuel dans `QUESTIONS.md` par cette même PR ;
- continue le cycle.

## Contenu attendu
- **En-tête** : numéro du cycle, date et heure (heure suisse), et deux ou trois phrases sur ce que le produit sait faire et la prochaine grande marche.
- **Résumé des chantiers** : un tableau, une ligne par chantier, avec son état et « n sur m » fonctionnalités faites. Quatre groupes, qui couvrent tout le backlog de `docs/roadmap.md` : « Ce que le voyageur voit » (parcours F et « Signaler une erreur »), « Ce qui fait marcher le vrai produit » (P0, B0 à B12), « Vendre » (C1 et suivants) et « Autres chantiers » (tout le reste : chantiers techniques comme T1 et T4, et toute entrée qui n'entre dans aucun autre groupe). Seule colonne où les identifiants de la feuille de route (P0, B1 à B12, C1…) sont admis, pour nommer la ligne.
- **Ce qui attend de Samuel** : les réponses qui débloquent quelque chose maintenant, dans l'ordre de leur effet, chacune en une phrase avec son numéro de question ; le reste en une ligne « plus tard ».
- **Détail par chantier** : pour chaque fonctionnalité, un état et une phrase sur ce que l'utilisateur final peut faire ; pour un état « Bloqué », ce qu'on attend. Un lien discret vers la PR qui l'a livrée.
- **Conditions de passage** de la phase en cours (`docs/roadmap.md`), avec les chiffres connus.
- **Prévu au prochain cycle** : repris de `STATUS.md`, rubrique « Prochain cycle ».

## États
Quatre états, pas d'autres :
- **Fait** : fusionné dans `main` et utilisable.
- **En cours** : commencé (PR ouverte, spécification en relecture ou fusionnée, ou une partie du chantier faite). Une entrée de la feuille de route du type « Spécifiée (#40, fusionnée) » est « En cours ».
- **Pas commencé**.
- **Bloqué** : attend une décision (de Samuel ou d'un rôle) ou une autre tâche ; dire laquelle.

## Rédaction
- Mots simples, du point de vue du voyageur ou de Samuel. Pas d'identifiants internes (B7a, P0r3c, noms de fichiers) dans les phrases ; seul le résumé des chantiers nomme ses lignes par leur identifiant de feuille de route ; les numéros de PR seulement en lien discret, les numéros de question entre parenthèses.
- Pas d'estimation de durée.
- Style « Ligne » de Vadrouille (couleurs et police de la page actuelle), lisible au téléphone, en clair et en sombre.
