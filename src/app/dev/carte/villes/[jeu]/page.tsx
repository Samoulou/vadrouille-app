import * as messages from "@/i18n/messages";

export const dynamic = "force-dynamic";

/** Séjour de la carte à plusieurs villes : le panneau ne sert qu'à son en-tête (choix « Afficher sur la carte »). */
export default function CarteVillesSejourPage() {
  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      <h1 className="text-section font-extrabold text-ink">{messages.dev.carte.titre}</h1>
      <h2 className="text-corps font-bold text-ink">{messages.dev.carte.sejour}</h2>
    </div>
  );
}
