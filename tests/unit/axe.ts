import axe from "axe-core";

/**
 * axe dans jsdom, pour les tests de composants. Le contraste dépend du rendu réel : il est vérifié
 * sur les paires de tokens (tests/unit/contrast.test.ts) et par axe dans Playwright (pnpm test:a11y).
 * `region` est une règle de page (repères), sans objet pour un composant isolé.
 */
export async function axeViolations(container: Element) {
  const results = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
    },
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  return results.violations.map(({ id, help, nodes }) => ({
    id,
    help,
    targets: nodes.map((node) => node.target.join(" ")),
  }));
}
