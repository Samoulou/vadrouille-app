import noHardcodedColors from "./no-hardcoded-colors.mjs";
import requireServerOnly from "./require-server-only.mjs";

/** Plugin ESLint local du projet. */
const plugin = {
  meta: { name: "ligne" },
  rules: {
    "no-hardcoded-colors": noHardcodedColors,
    "require-server-only": requireServerOnly,
  },
};

export default plugin;
