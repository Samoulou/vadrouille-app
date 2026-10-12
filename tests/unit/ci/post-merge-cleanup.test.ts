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
const OID = "7bb88895ced3ee2dc9ef448e5f5a4f3b3124e3d7";
const REPO = "Samoulou/vadrouille-app";

type IssueRef = {
  number: number;
  state: string;
  repository: { nameWithOwner: string };
  timelineItems?: { nodes: { createdAt?: string }[] };
};

function issue(overrides: Partial<IssueRef> = {}): IssueRef {
  return {
    number: 154,
    state: "OPEN",
    repository: { nameWithOwner: REPO },
    timelineItems: { nodes: [] },
    ...overrides,
  };
}

type Merged = {
  number: number;
  mergedAt: string | null;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  isCrossRepository: boolean;
  closingIssuesReferences: { nodes: IssueRef[] };
};

function merged(overrides: Partial<Merged> = {}): Merged {
  return {
    number: 156,
    mergedAt: "2026-10-12T09:00:55Z",
    baseRefName: "main",
    headRefName: "claude/154-comptes-externes",
    headRefOid: OID,
    isCrossRepository: false,
    closingIssuesReferences: { nodes: [issue()] },
    ...overrides,
  };
}

function data({
  pulls = [merged()],
  open = [] as {
    headRefName: string;
    baseRefName: string;
    isCrossRepository: boolean;
  }[],
  branches = [{ name: "154-comptes-externes", target: { oid: OID } }],
  hasNextPage = false,
} = {}) {
  return {
    repository: {
      nameWithOwner: REPO,
      defaultBranchRef: { name: "main" },
      merged: { nodes: pulls },
      open: { pageInfo: { hasNextPage }, nodes: open },
      branches: { nodes: branches },
    },
  };
}

describe("planCleanup", () => {
  it("ferme le ticket relié et supprime la branche de la PR fusionnée (cas de la PR 156)", () => {
    expect(planCleanup(data(), NOW)).toEqual({
      closeIssues: [{ issue: 154, pr: 156 }],
      deleteBranches: [
        { branch: "claude/154-comptes-externes", pr: 156, oid: OID },
      ],
    });
  });

  it("ignore un ticket déjà fermé et une PR fusionnée hors de la branche par défaut", () => {
    const closed = merged({
      closingIssuesReferences: { nodes: [issue({ state: "CLOSED" })] },
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
      {
        headRefName: "claude/154-comptes-externes",
        baseRefName: "main",
        isCrossRepository: false,
      },
    ];
    expect(planCleanup(data({ open }), NOW).deleteBranches).toEqual([]);
  });

  it("garde une branche qui sert de base à une PR ouverte (PR empilée)", () => {
    const open = [
      {
        headRefName: "claude/suite",
        baseRefName: "claude/154-comptes-externes",
        isCrossRepository: false,
      },
    ];
    expect(planCleanup(data({ open }), NOW).deleteBranches).toEqual([]);
  });

  it("ne ferme jamais un ticket d'un autre dépôt", () => {
    const other = issue({ repository: { nameWithOwner: "autre/depot" } });
    const pulls = [merged({ closingIssuesReferences: { nodes: [other] } })];
    expect(planCleanup(data({ pulls }), NOW).closeIssues).toEqual([]);
  });

  it("ne referme pas un ticket rouvert après la fusion", () => {
    const after = issue({
      timelineItems: { nodes: [{ createdAt: "2026-10-12T10:00:00Z" }] },
    });
    const pulls = [merged({ closingIssuesReferences: { nodes: [after] } })];
    expect(planCleanup(data({ pulls }), NOW).closeIssues).toEqual([]);
    const before = issue({
      timelineItems: { nodes: [{ createdAt: "2026-10-12T08:00:00Z" }] },
    });
    const pulls2 = [merged({ closingIssuesReferences: { nodes: [before] } })];
    expect(planCleanup(data({ pulls: pulls2 }), NOW).closeIssues).toEqual([
      { issue: 154, pr: 156 },
    ]);
  });

  it("refuse de nettoyer si la liste des PR ouvertes est tronquée", () => {
    expect(() => planCleanup(data({ hasNextPage: true }), NOW)).toThrow();
  });

  it("garde les branches hors claude/…, les forks et les noms suspects", () => {
    const pulls = [
      merged({ number: 1, headRefName: "main" }),
      merged({ number: 2, headRefName: "feature/x" }),
      merged({
        number: 3,
        headRefName: "claude/fork",
        isCrossRepository: true,
      }),
      merged({ number: 4, headRefName: "claude/x;rm -rf" }),
      merged({ number: 5, headRefName: "claude/.." }),
      merged({
        number: 6,
        headRefName: "claude/sha",
        headRefOid: "pas-un-sha",
      }),
    ];
    const branches = [
      { name: "fork", target: { oid: OID } },
      { name: "x;rm -rf", target: { oid: OID } },
      { name: "..", target: { oid: OID } },
      { name: "sha", target: { oid: "pas-un-sha" } },
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
      `branch claude/154-comptes-externes 156 ${OID}`,
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
    expect(workflow).not.toMatch(/pull_request_target|on:\s*\n\s*pull_request/);
    expect(workflow).toContain("persist-credentials: false");
  });

  it("interroge les tickets que GitHub relie aux PR", () => {
    expect(QUERY).toContain("closingIssuesReferences");
    expect(QUERY).toContain("hasNextPage");
    expect(QUERY).toContain("ReopenedEvent");
  });
});
