# 0169 — Page de précommande : identité tenue par la ligne, sans marques de gabarit

Statut : **décidée par l'UX/UI** (écran non maquetté, « Qui décide quoi »), à la demande de Samuel. Amende 0168 § 6 (forme de la page). Ne change ni le prix, ni les conditions, ni le paiement, ni les textes de vente.

Date : 2026-11-10 · Rédacteur : UX/UI · Ticket #1107.

## Demande

Samuel, fil du projet « Retirer le look IA du design », 2026-11-10 07:13 UTC : « J'aimerai que tu mettes un agent UX ui sur la landing page et l'app. C'est agent est un spécialiste de unslop les design IA ». Ce message n'est pas lisible depuis le dépôt ; le CEO le reporte dans `QUESTIONS.md`.

## Décision

1. **Rôle.** `.claude/agents/ux-ui.md` reçoit une première mission : retirer ce qui fait générique. La grille est `docs/design-system/anti-generique.md`.
2. **La page est une ligne.** Un rail part d'un terminus à côté du nom, passe par un arrêt à chaque titre de section et finit au terminus du dernier appel. Blanc (`on-line`) sur `ink`, `line` sur fond clair.
3. **Retirés de la version de 0168 :** halos flous, ombres, cadre de téléphone incliné et sa pastille, cartes de destination vides en éventail, ronds numérotés, grille de quatre cartes à barrette, coches, pilules, mot du titre en jaune italique.
4. **À la place :** la journée d'exemple dans le panneau de l'application, droit, posé sur le bas de l'affiche ; les destinations en tableau des départs (plaques `dest-*`) ; les trois gestes en arrêts du rail, chacun avec un fragment de l'application, décoratif (`aria-hidden`, aucun contrôle) ; « Ce que … cherche à garantir » en légende à filets, où « À confirmer » et « Non confirmé » sont le vrai `Tag` ; le prix en billet à contour `ink`.
5. **Police de titrage.** Bricolage Grotesque (variable, largeur 85 %, graisse 800) remplace Fraunces : une grotesque, parente de Hanken Grotesk, sans italique. **Écart au design system maintenu** (une seule famille) pour cette seule page, même motif que 0168 § 6. Chargée sans préchargement.
6. **Jaune.** `quai` seulement sur « Précommander » et sur l'étiquette d'ouverture ; le bouton du billet passe de `ink` à `quai` (une action garde la même forme partout). L'étiquette « À réserver » du troisième geste est celle de l'application.
7. **Textes.** Inchangés, sauf : destinations découpées en « départ / destination / durée » (mêmes mots), trois libellés de colonnes, une phrase d'exemple de récit (« Lisbonne à Pâques, cinq jours à deux. On aime marcher et bien manger. Pas de musées. ») ; la pastille « Aucun trou dans ta journée » disparaît avec le cadre de téléphone.

## Suite

Audit de l'application écran par écran avec la même grille : tickets séparés, un par écran ou groupe d'écrans.
