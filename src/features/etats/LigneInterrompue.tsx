/**
 * Motif des pages d'état (introuvable, erreur, hors ligne) : la ligne part du terminus, passe un arrêt, puis
 * s'interrompt en pointillé. Décoratif (`aria-hidden`) : il dit « le trajet s'arrête ici » avec la géométrie de Ligne
 * (terminus carré, arrêt rond, rail plein puis pointillé), sans illustration ni icône d'alerte (décision 0174).
 */
const POINTILLE = {
  backgroundImage:
    "repeating-linear-gradient(to right, currentColor 0 var(--ligne-rail-dash), transparent var(--ligne-rail-dash) calc(var(--ligne-rail-dash) + var(--ligne-rail-gap)))",
};

export function LigneInterrompue() {
  return (
    <div aria-hidden="true" data-part="ligne-interrompue" className="flex items-center">
      <span className="size-(--ligne-terminus) shrink-0 rounded-(--ligne-rayon-terminus) bg-ink" />
      <span className="h-(--ligne-rail) w-16 shrink-0 bg-line" />
      <span className="-mx-px size-(--ligne-stop) shrink-0 rounded-(--ligne-rayon-rond) border-(length:--ligne-stop-ring) border-line bg-raised" />
      <span className="h-(--ligne-rail) w-20 shrink-0 text-line" style={POINTILLE} />
    </div>
  );
}
