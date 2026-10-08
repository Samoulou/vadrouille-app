import { messages } from "@/i18n";
import { COLOR_TOKENS, RADIUS_TOKENS, TEXT_STYLES, type RadiusToken } from "@/styles/tokens";

import { TokenValue } from "./TokenValue";

const RADIUS_CLASSES: Record<RadiusToken, string> = {
  tag: "rounded-tag",
  badge: "rounded-badge",
  control: "rounded-control",
  block: "rounded-block",
  plate: "rounded-plate",
  sheet: "rounded-sheet",
};

const t = messages.dev.tokens;

/** Inventaire visuel des tokens Ligne : couleurs, styles de texte, rayons. */
export function TokensShowcase() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-5 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-titre-jour font-extrabold tracking-[-0.015em] text-ink">{t.titre}</h1>
        <p className="text-corps-s text-ink-soft">{t.intro}</p>
      </header>

      <section aria-labelledby="couleurs" className="flex flex-col gap-3">
        <h2 id="couleurs" className="text-section font-extrabold text-ink">
          {t.couleurs}
        </h2>
        <ul className="flex flex-col gap-2">
          {COLOR_TOKENS.map((name) => (
            <li key={name} className="flex items-center gap-3" data-color-token={name}>
              <span
                aria-hidden="true"
                className="size-11 shrink-0 rounded-control border border-outline"
                style={{ backgroundColor: `var(--color-${name})` }}
              />
              <span className="flex flex-col">
                <span className="text-corps-s font-bold text-ink">{name}</span>
                <TokenValue variable={`--color-${name}`} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="textes" className="flex flex-col gap-3">
        <h2 id="textes" className="text-section font-extrabold text-ink">
          {t.textes}
        </h2>
        <ul className="flex flex-col gap-4">
          {TEXT_STYLES.map((style) => (
            <li key={style.name} className="flex flex-col gap-1" data-text-style={style.name}>
              <span className="text-legende text-ink-soft">{style.name}</span>
              <span className={`${style.className} text-ink`}>{t.exemple}</span>
              <span className={`${style.className} text-ink tabular-nums`}>{t.chiffres}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rayons" className="flex flex-col gap-3">
        <h2 id="rayons" className="text-section font-extrabold text-ink">
          {t.rayons}
        </h2>
        <ul className="grid grid-cols-3 gap-4">
          {RADIUS_TOKENS.map((name) => (
            <li key={name} className="flex flex-col items-start gap-1" data-radius-token={name}>
              <span
                aria-hidden="true"
                className={`size-16 border-2 border-ink bg-muted ${RADIUS_CLASSES[name]}`}
              />
              <span className="text-corps-s font-bold text-ink">{name}</span>
              <TokenValue variable={`--radius-${name}`} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
