"use client";

import { StopMarker } from "@/components/ligne/StopMarker";
import { cn } from "@/lib/utils";

import { cssLength } from "./css";
import { DECALAGES_SEJOUR } from "./city-names";
import { placerEtiquettes, type Box, type EtiquetteAPlacer, type PlaceEtiquette } from "./etiquettes";

export { DECALAGES_JOURNEE, DECALAGES_SEJOUR, nomRepere, nomTerminus, texteEtiquette } from "./city-names";

export interface CityLabelProps {
  /** Clé de la place calculée par `placerEtiquettes`. */
  placeKey: string;
  text: string;
  /** Place calculée ; absente avant la première mesure : à droite, centrée sur le terminus. */
  place?: Pick<PlaceEtiquette, "cote" | "dy" | "largeurMax">;
  /** Décalages verticaux permis (`DECALAGES_SEJOUR` ou `DECALAGES_JOURNEE`). */
  decalagesMax: number;
}

/**
 * Étiquette de ville (décision 0150 § 4), partagée par les deux rendus : posée dans l'hôte de son terminus, à droite par
 * défaut ou à gauche, décalée verticalement s'il le faut. Décorative (`aria-hidden`) : le nom accessible est porté par le
 * repère. Ni interactive ni cible du geste de la carte (`pointer-events: none`).
 */
export function CityLabel({ placeKey, text, place, decalagesMax }: CityLabelProps) {
  const cote = place?.cote ?? "droite";
  return (
    <span
      aria-hidden="true"
      data-part="etiquette-ville"
      data-key={placeKey}
      data-decalages={decalagesMax}
      data-cote={cote}
      style={{ marginTop: place?.dy ?? 0, maxWidth: place?.largeurMax }}
      className={cn(
        "pointer-events-none absolute top-1/2 w-max max-w-(--ligne-etiquette-ville-max) -translate-y-1/2 rounded-tag border border-outline bg-raised px-2 py-1 text-corps-s font-bold text-ink tabular-nums wrap-anywhere",
        cote === "droite" ? "left-full ml-1" : "right-full mr-1",
      )}
    >
      {text}
    </span>
  );
}

export interface CityMarkProps {
  /** Nom accessible (« Rome, ville 1 », « Logement quitté, Rome ») ; absent : terminus masqué, sans étiquette. */
  name?: string;
  /** Texte et place de l'étiquette ; absent : pas d'étiquette. */
  label?: CityLabelProps;
}

/**
 * Repère de ville (décision 0150 § 2 point 1 et § 3 point 1) : terminus `StopMarker` inchangé et son étiquette, dans le même
 * hôte. Nommé : image non interactive (`role="img"`) ; sinon masqué comme les terminus d'aujourd'hui.
 */
export function CityMark({ name, label }: CityMarkProps) {
  if (name === undefined) {
    return (
      <span aria-hidden="true" data-part="terminus" className="flex">
        <StopMarker kind="terminus" />
      </span>
    );
  }
  return (
    <span role="img" aria-label={name} data-part="repere-ville" className="relative flex">
      <StopMarker kind="terminus" />
      {label ? <CityLabel {...label} /> : null}
    </span>
  );
}

const relative = (element: Element, origin: DOMRect): Box => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
};

/**
 * Places des étiquettes de ville d'un conteneur de carte, mesurées dans le DOM (décision 0150 § 4) : boîtes des terminus,
 * des marqueurs d'étape (`[data-stop-id]`), de « Retour » et de « Partager », largeur naturelle de chaque étiquette.
 */
export function mesurerEtiquettes(container: HTMLElement): PlaceEtiquette[] {
  const labels = Array.from(container.querySelectorAll<HTMLElement>("[data-part='etiquette-ville']"));
  if (labels.length === 0) return [];
  const origin = container.getBoundingClientRect();
  const obstacles: Box[] = [
    ...Array.from(container.querySelectorAll("[data-kind='terminus']"), (element) => relative(element, origin)),
    ...Array.from(container.querySelectorAll("[data-stop-id]"), (element) => relative(element, origin)),
    ...Array.from(container.closest("[data-day-map]")?.querySelectorAll("[data-part='retour'], [data-part='partager']") ?? [], (element) =>
      relative(element, origin),
    ),
  ];
  const etiquettes: EtiquetteAPlacer[] = [];
  for (const label of labels) {
    const terminus = label.parentElement?.querySelector("[data-kind='terminus']");
    if (!terminus) continue;
    // Largeur naturelle : sans la largeur réduite d'une place précédente.
    const reduite = label.style.maxWidth;
    label.style.maxWidth = "";
    const largeur = label.offsetWidth;
    const hauteur = label.offsetHeight;
    label.style.maxWidth = reduite;
    etiquettes.push({
      key: label.dataset.key ?? "",
      terminus: relative(terminus, origin),
      largeur,
      hauteur,
      decalagesMax: Number(label.dataset.decalages ?? DECALAGES_SEJOUR),
    });
  }
  const marge = cssLength("--ligne-espace-2");
  return placerEtiquettes(obstacles, etiquettes, { width: container.clientWidth, height: container.clientHeight }, { ecart: marge / 2, marge });
}
