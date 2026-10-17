# Captures F8c (390 × 844)

Écran 5 et bandeaux de `R-lancer`, non maquettés (Q12). Les PNG de ce répertoire sont des copies locales pour la PR ;
les références de la CI sont dans `tests/visual/__screenshots__` (décision 0004), publiées par `visual-update`
(commit 580fe72, `--update-snapshots=all`).

## Références nouvelles (6)

| Référence | État |
|---|---|
| `preparation-en-cours.png` | écran 5, 5 propositions prêtes sur 8 |
| `preparation-pret.png` | écran 5, aperçu prêt (ouverture directe) |
| `preparation-incomplet.png` | écran 5, 2 propositions sans lieu compatible |
| `preparation-erreur.png` | écran 5, erreur réparable avec « Réessayer » |
| `lancement-conflit.png` | `R-lancer`, aperçu déjà en préparation |
| `lancement-erreur.png` | `R-lancer`, création refusée avec « Réessayer » |

## Références existantes réécrites (6)

Aucune n'est expliquée par le diff de F8c. Les specs de ces captures et leurs aides sont inchangées. Les écrans
concernés (`LodgingScreen`, formulaire de connexion, révision) et les tokens (`globals.css`) ne sont pas modifiés :
`provisoire.css` et `creation.json` ne reçoivent que des ajouts. Le saut de l'écran 4 dans `connexion/page.tsx`
ne s'applique qu'avec une session et `suite=R-lancer`, ce qui n'est le cas d'aucune de ces captures. Un rendu local
des captures `logement: aucun quartier` et `connexion: étape code`, sur la base de `main` (beb2e48) puis sur F8c,
donne des images identiques au pixel près.

| Référence | Pixels différents | Écart max. (sur 255) | Lecture |
|---|---|---|---|
| `connexion-code.png` | 2 236 (0,68 %) | 238 | lissage du texte des liens et des cases du code, sans déplacement : bruit de rendu |
| `connexion-code-faux.png` | 2 192 (0,67 %) | 238 | lissage du texte des liens « Renvoyer le code » et « Changer d'adresse » : bruit de rendu |
| `connexion-trop-d-essais.png` | 2 192 (0,67 %) | 238 | idem : bruit de rendu |
| `revision-deplacer-jours.png` | 189 | 2 | bruit de rendu |
| `revision-deplacer-points.png` | 13 | 1 | bruit de rendu |
| `logement-aucun-quartier.png` | 5 986 (1,82 %) | 241 | le message « Aucun quartier à te proposer pour l'instant. » passe d'un texte foncé plus grand à 14 px gris (`text-corps-s text-ink-soft`, ce que demande `LodgingScreen`) ; le bouton remonte de 2 px |

Les cinq premières restent sous la tolérance de 1 % (`maxDiffPixelRatio`). `--update-snapshots=all` les réécrit
quand même (Q232). `logement-aucun-quartier` la dépasse, alors que la CI de `main` (beb2e48) passait avec
l'ancienne référence. La nouvelle image correspond au code, et le rendu local aussi (base et F8c). L'ancienne
semble donc avoir été prise dans un état transitoire. Il faut surveiller une capture instable : question au
Tech Lead et à QA dans la PR #432.
