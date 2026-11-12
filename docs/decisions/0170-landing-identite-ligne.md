# 0170 — Page de précommande : identité tenue par la ligne, sans marques de gabarit

Statut : **forme proposée par l'UX/UI** (écran non maquetté, « Qui décide quoi »), à la demande de Samuel ; les écarts à Ligne qui restent sont des **dérogations proposées, en attente de Samuel (Q357)**, comme dans 0168. Amende 0168 § 6 (forme de la page) et retire la plupart de ses écarts. Ne change ni le prix, ni les conditions, ni le paiement ; les changements de texte sont listés au point 7 et proposés à Samuel.

Date : 2026-11-10 · Rédacteur : UX/UI · Ticket #1107.

## Demande

Samuel, fil du projet « Retirer le look IA du design », 2026-11-10 07:13 UTC : « J'aimerai que tu mettes un agent UX ui sur la landing page et l'app. C'est agent est un spécialiste de unslop les design IA ». Message reporté dans `QUESTIONS.md` (Q889).

## Décision

1. **Rôle.** `.claude/agents/ux-ui.md` reçoit une première mission : retirer ce qui fait générique. La grille est `docs/design-system/anti-generique.md`. Le rôle existait ; sa mission est élargie à la demande de Samuel citée ci-dessus, reportée dans `QUESTIONS.md` (Q889).
2. **La page est une ligne.** Un rail part d'un terminus à côté du nom, passe par un arrêt à chaque titre de section (sauf le prix, dont le titre est dans le billet) et finit au terminus du dernier appel. Blanc (`on-line`) sur `ink`, `line` sur fond clair.
3. **Retirés de la version de 0168 :** halos flous, ombres, cadre de téléphone incliné et sa pastille, cartes de destination vides en éventail, ronds numérotés, grille de quatre cartes à barrette, coches, pilules, mot du titre en jaune italique.
4. **À la place :** la journée d'exemple dans le panneau de l'application, droit, posé sur le bas de l'affiche ; les destinations en tableau des départs (plaques `dest-*`) ; les trois gestes en arrêts du rail, chacun avec un fragment de l'application, décoratif (`aria-hidden`, aucun contrôle) ; « Ce que … cherche à garantir » en légende à filets, où « À confirmer » et « Non confirmé » sont le vrai `Tag` ; le prix en billet à contour `ink`.
5. **Police de titrage.** Bricolage Grotesque (variable, largeur 85 %) remplace Fraunces : une grotesque, parente de Hanken Grotesk, sans italique. État final, fixé par 0171 et 0173 : elle sert aux titres de **toute l'application**, en graisse 600, et elle est préchargée par le layout racine (`src/app/fonts.ts`). Ce n'est donc plus un écart propre à cette page.
6. **Jaune.** `quai` seulement sur « Précommander » ; le bouton du billet passe de `ink` à `quai` (une action garde la même forme partout). L'étiquette d'ouverture n'est plus jaune (0173). L'étiquette « À réserver » du troisième geste est le `Tag` de l'application, montré dans un fragment décoratif : écart listé plus bas.
7. **Textes.** Prix, conditions, garanties et questions fréquentes : inchangés. Les changements ci-dessous sont des **propositions de forme, à valider par Samuel ou le Product Owner (Q357)** ; `docs/commercial/page-prevente.md` reste la source et n'est pas modifié ici (il appartient au rôle commercial), comme pour les écarts de 0168 :
   - destinations découpées en trois colonnes « Départ / Destination / Durée » (mêmes mots ; clés `quand`, `duree` au lieu de `infos`), trois libellés de colonnes ajoutés ;
   - ordre des destinations : Lisbonne, Rome, Zakynthos, Édimbourg (ordre des départs dans l'année ; avant : Édimbourg en tête) ;
   - texte des destinations coupé en deux : une phrase sous le titre, la mention « Quelques exemples de voyages, pour illustrer… » en légende du tableau ;
   - phrase d'exemple de récit ajoutée, dans un fragment décoratif : « Lisbonne à Pâques, cinq jours à deux. On aime marcher et bien manger. Pas de musées. » ;
   - pastille « Objectif : aucun trou dans ta journée » retirée avec le cadre de téléphone ;
   - (0173) point final du titre principal retiré ; liste des trois atouts sous le bouton du haut retirée (les mêmes mentions restent dans le billet) ; clé `titre.accent` renommée `titre.apres`.

## Écarts à Ligne : retirés et restants

Retirés par rapport à 0168 : italique et mot en couleur dans le titre, ombres, halos, pilules, inclinaisons, police à empattements.

Restants, proposés à Samuel :
- **`Tag` « À réserver » en `quai` dans le troisième geste** : c'est l'étiquette de l'application montrée telle quelle, dans un fragment décoratif ; la règle « un écran sans action requise n'a pas de jaune » (`README.md`, principe 2) et `anti-generique.md` § 2 ne le prévoient pas.
- **Tailles hors tokens** : les grands titres de cette page (`clamp(...)`) dépassent le style `destination` ; c'est une affiche, pas un écran de l'application.
- **Bleu `line` et blanc `on-line` pour le rail de la page** : le rail est la ligne, à l'échelle de la page ; pas d'autre emploi décoratif du bleu.
- **Positions du rail** : les repères (`SUR_LE_RAIL`, `VOIE` dans `LandingPrevente.tsx`) sont des mesures propres à cette page, hors tokens.

## Suite

Audit de l'application écran par écran avec la même grille : tickets séparés, un par écran ou groupe d'écrans.
