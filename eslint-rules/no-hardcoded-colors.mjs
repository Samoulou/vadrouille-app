/**
 * Règle ESLint locale : refuse les couleurs en dur (handover § 0, règle 1, et § 2).
 *
 * Signale, dans les chaînes et gabarits :
 * - les couleurs hexadécimales (#fff, #2a55d4…) ;
 * - les fonctions de couleur CSS (rgb(), hsl(), oklch()…) ;
 * - les valeurs Tailwind arbitraires de couleur (bg-[#fff], text-[rgb(…)], border-[color:…]…) ;
 * - la palette par défaut de Tailwind (bg-red-500, text-white…), hors tokens Ligne ;
 * - les couleurs nommées CSS dans les propriétés de style de couleur (color: "red").
 */

const HEX = /(^|[^\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/;
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const COLOR_UTILITY =
  "(?:bg|text|border(?:-[xytrblse])?|outline|ring(?:-offset)?|fill|stroke|from|via|to|decoration|accent|caret|shadow|inset-shadow|inset-ring|drop-shadow|text-shadow|divide|placeholder)";
const ARBITRARY_COLOR = new RegExp(
  `(?:^|[\\s"'\`:!])${COLOR_UTILITY}-\\[(?:#|color:|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|[a-z]+\\])`,
  "i",
);
const TAILWIND_PALETTE = new RegExp(
  `(?:^|[\\s"'\`:!])${COLOR_UTILITY}-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-\\d{2,3}|black|white)(?:\\/\\d+)?(?=$|[\\s"'\`])`,
);
const STYLE_COLOR_KEY =
  /^(?:color|background|backgroundColor|borderColor|border(?:Top|Right|Bottom|Left)?Color|outlineColor|fill|stroke|caretColor|accentColor|textDecorationColor|boxShadow|stopColor|floodColor|lightingColor)$/;
const ALLOWED_STYLE_VALUE = /^(?:var\(--|currentColor$|transparent$|inherit$|initial$|unset$|none$)/;

function checkText(context, node, text) {
  if (HEX.test(text)) {
    context.report({ node, messageId: "hex" });
  } else if (COLOR_FN.test(text)) {
    context.report({ node, messageId: "fn" });
  } else if (ARBITRARY_COLOR.test(text)) {
    context.report({ node, messageId: "arbitrary" });
  } else if (TAILWIND_PALETTE.test(text)) {
    context.report({ node, messageId: "palette" });
  }
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Interdit les couleurs en dur : utiliser uniquement les tokens Ligne (globals.css).",
    },
    schema: [],
    messages: {
      hex: "Couleur hexadécimale en dur : utilise un token Ligne (handover § 4).",
      fn: "Fonction de couleur en dur : utilise un token Ligne (handover § 4).",
      arbitrary: "Valeur Tailwind arbitraire de couleur : utilise un token Ligne (handover § 4).",
      palette: "Couleur de la palette Tailwind par défaut : utilise un token Ligne (handover § 4).",
      named: "Couleur nommée en dur dans un style : utilise var(--color-…) ou une classe de token.",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string") {
          checkText(context, node, node.value);
        }
      },
      TemplateElement(node) {
        checkText(context, node, node.value.cooked ?? node.value.raw);
      },
      JSXText(node) {
        checkText(context, node, node.value);
      },
      Property(node) {
        const key =
          node.key.type === "Identifier"
            ? node.key.name
            : node.key.type === "Literal"
              ? String(node.key.value)
              : null;
        if (
          key &&
          STYLE_COLOR_KEY.test(key) &&
          node.value.type === "Literal" &&
          typeof node.value.value === "string"
        ) {
          const value = node.value.value.trim();
          if (/^[a-z]+$/i.test(value) && !ALLOWED_STYLE_VALUE.test(value)) {
            context.report({ node: node.value, messageId: "named" });
          }
        }
      },
    };
  },
};

export default rule;
