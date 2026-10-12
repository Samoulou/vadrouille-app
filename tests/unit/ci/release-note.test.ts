import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SLACK_MAX, slackPayload, tagFromNotePath } from "../../../scripts/ci/release-note.mjs";

// Décision 0023 § 5 : tag = nom de la note sans `.md`, revues hebdomadaires exclues.
describe("tagFromNotePath", () => {
  it("donne le nom de la note de release sans .md", () => {
    expect(tagFromNotePath("docs/releases/v2026.10.09-09.md")).toBe("v2026.10.09-09");
  });

  it("ignore les revues hebdomadaires et les autres fichiers", () => {
    expect(tagFromNotePath("docs/releases/hebdo-2026-41.md")).toBeNull();
    expect(tagFromNotePath("docs/releases/README.md")).toBeNull();
    expect(tagFromNotePath("docs/releases/v2026.10.09-09.txt")).toBeNull();
    expect(tagFromNotePath("docs/releases/sous/v2026.10.09-09.md")).toBeNull();
    expect(tagFromNotePath("docs/templates/release-note.md")).toBeNull();
    expect(tagFromNotePath("docs/releases/v2026.10.09-09.md; rm -rf /")).toBeNull();
  });

  it("reconnaît toutes les notes de release déjà présentes", () => {
    const notes = readdirSync("docs/releases").filter((name) => name.startsWith("v"));
    expect(notes.length).toBeGreaterThan(0);
    for (const name of notes) {
      expect(tagFromNotePath(`docs/releases/${name}`)).toBe(name.replace(/\.md$/, ""));
    }
  });
});

describe("slackPayload", () => {
  it("met le tag, le lien, la note et la signature Studio", () => {
    const { text } = slackPayload({
      tag: "v2026.10.11-13",
      url: "https://github.com/o/r/releases/tag/v2026.10.11-13",
      body: "# Release\n\n## Bugs corrigés\n- …\n",
    });
    expect(text).toBe(
      "*Release v2026.10.11-13*  https://github.com/o/r/releases/tag/v2026.10.11-13\n\n# Release\n\n## Bugs corrigés\n- …\n\n— Studio",
    );
  });

  it("tronque une note trop longue et le signale", () => {
    const { text } = slackPayload({ tag: "t", url: "u", body: "x".repeat(SLACK_MAX + 50) });
    expect(text).toContain("x".repeat(SLACK_MAX));
    expect(text).not.toContain("x".repeat(SLACK_MAX + 1));
    expect(text).toContain("… (note complète sur GitHub)");
  });
});
