import noHardcodedColors from "./no-hardcoded-colors.mjs";

/** Plugin ESLint local du projet. */
const plugin = {
  meta: { name: "ligne" },
  rules: {
    "no-hardcoded-colors": noHardcodedColors,
  },
};

export default plugin;
