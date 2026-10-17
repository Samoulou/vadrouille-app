# Captures F8c (390 × 844)

Écran 5 et bandeaux de `R-lancer`, non maquettés (Q12). Les PNG de ce répertoire sont des copies, pour la PR, des
références de la CI de `tests/visual/__screenshots__` (décision 0004), publiées par `visual-update` (580fe72, puis 58ac983,
`--update-snapshots=all`).

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

Sur demande de la revue de 293493b (Tech Lead, mineur 9), les 5 références réécrites sans lien avec le diff de F8c
sont restaurées depuis `main` : `connexion-code`, `connexion-code-faux`, `connexion-trop-d-essais`,
`revision-deplacer-jours` et `revision-deplacer-points`. Leurs écarts (lissage du texte, 1 à 2 niveaux sur 255)
restent sous la tolérance de 1 %. `visual-update` (`--update-snapshots=all`, Q232) les réécrit pourtant à chaque
passage (580fe72, puis 58ac983) ; elles sont donc restaurées de nouveau après chaque publication.

Seule `logement-aucun-quartier.png` est gardée dans sa version publiée par 580fe72 (14 px gris,
`text-corps-s text-ink-soft`, ce que demande `LodgingScreen`). L'ancienne image (texte foncé plus grand) contredisait
le code. La capture attend désormais un état stable : « Continuer sans logement » visible et squelette retiré
(mineur 10).

## Republiées après la correction de la revue (58ac983)

`visual-update` a republié les références F8c touchées par les corrections de la revue :
- `preparation-erreur.png` : titre « Préparation interrompue » et jours non prêts « Interrompu » (mineur UX 2) ;
- `preparation-pret.png`, `preparation-incomplet.png` : colonne d'état à largeur réservée (mineur UX 5) ;
- `lancement-conflit.png` (« Voir ces propositions » en `size="sm"`, mineur UX 6) et `lancement-erreur.png` : écarts
  sous la tolérance, réécrits par `--update-snapshots=all`.

`preparation-en-cours.png` est inchangée.

## Provenance et contrôle

Les PNG de ce répertoire sont des copies, sans régénération, des références de la CI publiées par `visual-update`
dans `tests/visual/__screenshots__` (commit 58ac983). La copie a été faite au commit 1d0ac3c, à la demande de la revue
du Tech Lead. L'identité a été vérifiée avec `cmp` : chaque PNG est identique octet pour octet à sa référence.

## Capture non produite

L'erreur définitive de l'écran 5 (`retryable: false`, bandeau sans « Réessayer », lien « Voir mes voyages » en
`size="sm"`) n'a pas de capture. Ce qu'elle doit dire (ce qui reste possible, sort des propositions déjà prêtes)
dépend de B9 : `retryGeneration` et conservation côté serveur. Elle sera capturée quand B9 en fixera le contenu. Elle
est couverte en attendant par le test unitaire `erreur définitive` (`PreparationView.test.tsx`, axe compris) et par
l'e2e `preparation: erreur définitive, sans « Réessayer »`.
