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

## Références existantes

La revue de 293493b (Tech Lead, mineur 9) l'a demandé : les 5 références réécrites sans lien avec le diff de F8c
sont restaurées depuis `main`. Ce sont `connexion-code`, `connexion-code-faux`, `connexion-trop-d-essais`,
`revision-deplacer-jours` et `revision-deplacer-points`. Leurs écarts (lissage du texte, 1 à 2 niveaux sur 255)
restaient sous la tolérance de 1 %, et `--update-snapshots=all` les avait réécrites quand même (Q232).

Seule `logement-aucun-quartier.png` est gardée dans sa version publiée par 580fe72 (14 px gris,
`text-corps-s text-ink-soft`, ce que demande `LodgingScreen`). L'ancienne image (texte foncé plus grand) contredisait
le code. La capture attend désormais un état stable : « Continuer sans logement » visible et squelette retiré
(mineur 10).

## À régénérer après la correction de la revue

Ces captures F8c changent au-delà de la tolérance de 1 % avec les corrections de la revue (`test:visual` local sur
4671b38). Leurs références sont à republier (`update-snapshots`) :
- `preparation-erreur.png` : titre « Préparation interrompue » et jours non prêts « Interrompu » (mineur UX 2) ;
- `preparation-pret.png`, `preparation-incomplet.png` : la colonne d'état garde la largeur de « En préparation », et
  les mini-lignes ne sautent plus quand un jour devient prêt (mineur UX 5).

Ces deux captures changent aussi, mais sous la tolérance : `preparation-en-cours.png` (même colonne, déjà à cette
largeur) et `lancement-conflit.png` (« Voir ces propositions » en `size="sm"`, mineur UX 6).

Les PNG de ce répertoire montrent l'état d'avant ces corrections.
