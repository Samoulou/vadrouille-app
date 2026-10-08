/**
 * Inventaire des tokens Ligne déclarés dans globals.css (handover § 4.1).
 * Seuls les noms figurent ici : les valeurs vivent uniquement dans globals.css.
 */
export const COLOR_TOKENS = [
  "page",
  "raised",
  "muted",
  "ink",
  "ink-2",
  "ink-soft",
  "line",
  "on-line",
  "quai",
  "hairline",
  "outline",
  "outline-strong",
  "border-control",
  "track-free",
  "map-land",
  "map-water",
  "map-park",
  "map-road",
  "dest-bruyere",
  "dest-azulejo",
  "dest-ocre",
  "dest-granit",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

export const RADIUS_TOKENS = ["tag", "badge", "control", "block", "plate", "sheet"] as const;

export type RadiusToken = (typeof RADIUS_TOKENS)[number];

/**
 * Styles de texte avec graisse, interlettrage et chiffres tabulaires (§ 4.1).
 * Les classes sont écrites en entier pour que Tailwind les détecte.
 */
export const TEXT_STYLES = [
  { name: "destination", className: "text-destination font-extrabold tracking-[-0.02em]" },
  { name: "titre-fiche", className: "text-titre-fiche font-extrabold tracking-[-0.015em]" },
  { name: "titre-jour", className: "text-titre-jour font-extrabold tracking-[-0.015em]" },
  { name: "montant", className: "text-montant font-extrabold tracking-[-0.015em] tabular-nums" },
  { name: "section", className: "text-section font-extrabold" },
  { name: "arret", className: "text-arret font-bold" },
  { name: "heure-l", className: "text-heure-l font-bold tabular-nums" },
  { name: "corps", className: "text-corps font-normal" },
  { name: "corps-s", className: "text-corps-s font-normal" },
  { name: "legende", className: "text-legende font-normal" },
  { name: "etiquette", className: "text-etiquette font-bold" },
] as const;

export type TextStyleName = (typeof TEXT_STYLES)[number]["name"];
