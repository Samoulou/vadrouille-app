import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MAX_AGE_DAYS,
  planCleanup,
  planLines,
  QUERY,
} from "../../../scripts/ci/post-merge-cleanup.mjs";

// Décision 0033 : rattrapage des tickets « Closes #n » et des branches après une
// fusion faite avec GITHUB_TOKEN.
const NOW = new Date("2026-10-12T12:00:00Z");

type Merged = {
  number: number;
  mergedAt: string | null;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  isCrossRepository: boolean;
  closingIssuesReferences: { nodes: { number: number; state: string }[] };
};

function merged(overrides: Partial<Merged> = {}): Merged {
  return {
    number: 156,
    mergedAt: "2026-10-12T09:00:55Z",
    baseRefName: "main",
    headRefName: "claude/154-comptes-externes",
    headRefOid: "7bb8889",
    isCrossRepository: false,
    closingIssuesReferences: { nodes: [{ number: 154, state: "OPEN" }] },
    ...overrides,
  };
}

function data({
  pulls = [merged()],
  open = [] as { headRefName: string; isCrossRepository: boolean }[],
  branches = [{ name: "154-comptes-externes", target: { oid: "7bb8889" } }],
} = {}) {
  return {
    repository: {
      defaultBranchRef: { name: "main" },
      merged: { nodes: pulls },
      open: { nodes: open },
      branches: { nodes: branches },
    },
  };
}

describe("planCleanup", () => {
  it("ferme le ticket relié et supprime la branche de la PR fusionnée (cas de la PR 156)", () => {
    expect(planCleanup(data(), NOW)).toEqual({
      closeIssues: [{ issue: 154, pr: 156 }],
      deleteBranches: [{ branch: "claude/154-comptes-externes", pr: 156 }],
    });
  });

  it("ignore un ticket déjà fermé et une PR fusionnée hors de la branche par défaut", () => {
    const closed = merged({
      closingIssuesReferences: { nodes: [{ number: 154, state: "CLOSED" }] },
    });
    expect(planCleanup(data({ pulls: [closed] }), NOW).closeIssues).toEqual([]);
    const other = merged({ baseRefName: "claude/autre" });
    expect(planCleanup(data({ pulls: [other] }), NOW)).toEqual({
      closeIssues: [],
      deleteBranches: [],
    });
  });

  it(`ignore les PR fusionnées depuis plus de ${MAX_AGE_DAYS} jours`, () => {
    const old = merged({ mergedAt: "2026-10-01T09:00:00Z" });
    expect(planCleanup(data({ pulls: [old] }), NOW)).toEqual({
      closeIssues: [],
      deleteBranches: [],
    });
  });

  it("garde une branche poussée après la fusion", () => {
    const branches = [
      { name: "154-comptes-externes", target: { oid: "autre" } },
    ];
    expect(planCleanup(data({ branches }), NOW).deleteBranches).toEqual([]);
  });

  it("garde une branche encore tête d'une PR ouverte", () => {
    const open = [
      { headRefName: "claude/154-comptes-externes", isCrossRepository: false },
    ];
    expect(planCleanup(data({ open }), NOW).deleteBranches).toEqual([]);
  });

  it("garde les branches hors claude/…, les forks et les noms suspects", () => {
    const pulls = [
      merged({ number: 1, headRefName: "main", headRefOid: "a" }),
      merged({ number: 2, headRefName: "feature/x", headRefOid: "b" }),
      merged({
        number: 3,
        headRefName: "claude/fork",
        headRefOid: "c",
        isCrossRepository: true,
      }),
      merged({ number: 4, headRefName: "claude/x;rm -rf", headRefOid: "d" }),
    ];
    const branches = [
      { name: "fork", target: { oid: "c" } },
      { name: "x;rm -rf", target: { oid: "d" } },
    ];
    expect(planCleanup(data({ pulls, branches }), NOW).deleteBranches).toEqual(
      [],
    );
  });

  it("ne ferme un ticket qu'une fois, pour la PR fusionnée la plus récente", () => {
    const pulls = [
      merged({ number: 160 }),
      merged({ number: 156, headRefName: "claude/autre" }),
    ];
    expect(planCleanup(data({ pulls }), NOW).closeIssues).toEqual([
      { issue: 154, pr: 160 },
    ]);
  });

  it("refuse une réponse incomplète", () => {
    expect(() => planCleanup({}, NOW)).toThrow();
  });
});

describe("planLines", () => {
  it("écrit une ligne par action, tickets d'abord", () => {
    expect(planLines(planCleanup(data(), NOW))).toEqual([
      "issue 154 156",
      "branch claude/154-comptes-externes 156",
    ]);
  });
});

describe("workflow", () => {
  const workflow = readFileSync(
    ".github/workflows/post-merge-cleanup.yml",
    "utf8",
  );

  it("n'utilise que GITHUB_TOKEN, sans secret, et le code de main", () => {
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).toMatch(/github\.ref == 'refs\/heads\/main'/);
    expect(workflow).not.toMatch(/pull_request/);
  });

  it("interroge les tickets que GitHub relie aux PR", () => {
    expect(QUERY).toContain("closingIssuesReferences");
  });
});
