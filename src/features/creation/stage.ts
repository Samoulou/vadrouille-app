/**
 * Propriétés communes aux deux états de l'écran 2. `focusTitle` : le titre de l'état reçoit le focus à son
 * affichage, après un changement d'état seulement (jamais au premier affichage de l'écran). `onStageChange` :
 * à appeler juste avant de changer d'état.
 */
export interface StageProps {
  focusTitle: boolean;
  onStageChange: () => void;
}
