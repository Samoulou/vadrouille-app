// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  classifyFiles,
  consolidatedHead,
  decideGate,
  evaluateOwnerApproval,
  FILES_UNREADABLE,
  latestConsolidatedHead,
  NO_OWNER_APPROVAL,
  OWNER_MISSING,
  OWNER_NO_RECORD,
  OWNER_REMOVED,
  readFileList,
  touchesWorkflows,
} from "../../../scripts/ci/techlead-gate.mjs";
import type { OwnerApproval } from "../../../scripts/ci/techlead-gate.mjs";

// Décision 0019 § 3.3 et décision 0023 § 4 : porte techlead-gate.
const HEAD = "abc1234def5678901234567890abcdef12345678";
const ACTIONS = ["opened", "synchronize", "labeled", "unlabeled"] as const;
const LABEL_SETS: string[][] = [
  [],
  ["techlead-approved"],
  ["changes-requested"],
  ["techlead-approved", "changes-requested"],
  ["needs-review", "techlead-approved"],
];
const review = (sha: string, createdAt = "2026-10-11T10:00:00Z") => ({
  body: `## Revue consolidée — head \`${sha}\`\n\nVerdict : techlead-approved`,
  createdAt,
});

describe("techlead-gate : PR de code", () => {
  for (const action of ACTIONS) {
    for (const labels of LABEL_SETS) {
      it(`${action} avec [${labels.join(", ")}]`, () => {
        const decision = decideGate({ action, labels, code: true, headSha: HEAD });
        const approved = labels.includes("techlead-approved");
        const changes = labels.includes("changes-requested");
        const expectedPass = action !== "synchronize" && approved && !changes;
        expect(decision.pass).toBe(expectedPass);
        // Le libellé est retiré sur nouveau push ou s'il contredit changes-requested.
        expect(decision.removeApproval).toBe(
          approved && (action === "synchronize" || changes),
        );
        if (!decision.pass) expect(decision.messages.length).toBeGreaterThan(0);
      });
    }
  }

  it("échoue avec le message de 0019 quand les deux libellés coexistent", () => {
    const decision = decideGate({
      action: "labeled",
      labels: ["techlead-approved", "changes-requested"],
      code: true,
      headSha: HEAD,
    });
    expect(decision.messages).toContain(
      "Libellés contradictoires : techlead-approved et changes-requested. Une revue consolidée est nécessaire.",
    );
  });

  it("échoue sur changes-requested seul, sans rien retirer", () => {
    const decision = decideGate({
      action: "labeled",
      labels: ["changes-requested"],
      code: true,
      headSha: HEAD,
    });
    expect(decision).toMatchObject({ pass: false, removeApproval: false });
  });
});

describe("techlead-gate : exemption STATUS.md, QUESTIONS.md, docs/releases/", () => {
  for (const action of ACTIONS) {
    for (const labels of LABEL_SETS) {
      it(`${action} avec [${labels.join(", ")}] passe`, () => {
        const decision = decideGate({ action, labels, code: false, headSha: HEAD });
        expect(decision.pass).toBe(true);
        // Le retrait à chaque nouveau push vaut pour toute PR (consigne du 2026-10-11).
        expect(decision.removeApproval).toBe(
          action === "synchronize" && labels.includes("techlead-approved"),
        );
      });
    }
  }
});

describe("techlead-gate : garde de course sur le head relu", () => {
  const approved = { action: "labeled", labels: ["techlead-approved"], code: true, headSha: HEAD };

  it("passe si la dernière revue consolidée porte le head courant", () => {
    const decision = decideGate({ ...approved, reviews: [review("abc1234")] });
    expect(decision).toMatchObject({ pass: true, removeApproval: false, warnings: [] });
  });

  it("échoue et retire l'approbation si la dernière revue porte un autre head", () => {
    const decision = decideGate({
      ...approved,
      reviews: [review("abc1234", "2026-10-11T09:00:00Z"), review("0ff1ce0", "2026-10-11T10:00:00Z")],
    });
    expect(decision).toMatchObject({ pass: false, removeApproval: true });
    expect(decision.messages.join(" ")).toContain("0ff1ce0");
  });

  it("retient la revue la plus récente, quel que soit l'ordre de la liste", () => {
    const decision = decideGate({
      ...approved,
      reviews: [review("abc1234", "2026-10-11T11:00:00Z"), review("0ff1ce0", "2026-10-11T10:00:00Z")],
    });
    expect(decision.pass).toBe(true);
  });

  it("passe avec un avertissement si aucune revue consolidée n'existe", () => {
    const decision = decideGate({ ...approved, reviews: [{ body: "LGTM", createdAt: "x" }] });
    expect(decision.pass).toBe(true);
    expect(decision.warnings).toHaveLength(1);
  });

  it("n'applique pas la garde quand la porte échoue déjà", () => {
    const decision = decideGate({
      ...approved,
      labels: ["changes-requested"],
      reviews: [review("0ff1ce0")],
    });
    expect(decision.removeApproval).toBe(false);
  });
});

describe("techlead-gate : lecture du titre de revue consolidée", () => {
  it("lit le sha court, en minuscules, avec tiret cadratin ou demi-cadratin", () => {
    expect(consolidatedHead("Revue consolidée — head `ABC1234`")).toBe("abc1234");
    expect(consolidatedHead("Revue consolidée – head `abc1234def`")).toBe("abc1234def");
  });

  it("ignore un texte sans titre ou un sha trop court", () => {
    expect(consolidatedHead("Revue du Tech Lead")).toBeNull();
    expect(consolidatedHead("Revue consolidée — head `abc12`")).toBeNull();
    expect(consolidatedHead(undefined)).toBeNull();
    expect(latestConsolidatedHead([])).toBeNull();
  });
});

// Décision 0035 : owner-approved exigé pour toute PR qui modifie .github/workflows/.
const TREE_A = `040000 ${"a".repeat(40)}`;
const TREE_B = `040000 ${"b".repeat(40)}`;
const SHA_A = "1".repeat(40);
const T_POSE = "2026-10-12T10:00:00Z";
const pose = (createdAt = T_POSE) => ({
  event: "labeled",
  label: { name: "owner-approved" },
  created_at: createdAt,
});
const marker = (tree: string, sha: string) =>
  `<!-- techlead-gate:owner-approved tree=${tree} sha=${sha} -->`;
const recordComment = (
  tree = TREE_A,
  createdAt = "2026-10-12T10:00:05Z",
  login = "github-actions[bot]",
  line = marker(tree, SHA_A),
) => ({
  user: { login },
  body: `techlead-gate : owner-approved enregistré pour le contenu de .github/workflows/ du commit ${SHA_A}.\n\n${line}`,
  created_at: createdAt,
});
const owner = (reason: OwnerApproval["reason"]): OwnerApproval => ({
  approved: reason === "approved",
  stale: reason === "changed",
  record: null,
  reason,
});

describe("touchesWorkflows", () => {
  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/sous/dossier.yml",
    ".github/workflows/é.yml",
    '.github/workflows/a"b.yml',
    ".github/workflows",
  ])("vrai pour %s", (file) => {
    expect(touchesWorkflows([file])).toBe(true);
  });

  it.each([
    ".github/ISSUE_TEMPLATE/bug.md",
    ".github/workflowsx/a.yml",
    "docs/.github/workflows/a.yml",
    ".GitHub/Workflows/a.yml",
    "scripts/ci/techlead-gate.mjs",
  ])("faux pour %s", (file) => {
    expect(touchesWorkflows([file])).toBe(false);
  });

  it("faux pour une liste vide", () => {
    expect(touchesWorkflows([])).toBe(false);
  });
});

describe("classifyFiles", () => {
  it("STATUS.md seul : exempté, pas de workflow", () => {
    expect(classifyFiles(["STATUS.md"])).toEqual({ code: false, workflows: false, unreadable: [] });
  });

  it("un workflow : code et workflow", () => {
    expect(classifyFiles([".github/workflows/ci.yml"])).toEqual({
      code: true,
      workflows: true,
      unreadable: [],
    });
  });

  it("forme citée : illisible, code et workflow", () => {
    const quoted = '".github/workflows/\\303\\251.yml"';
    const result = classifyFiles([quoted]);
    expect(result.unreadable).toEqual([quoted]);
    expect(result).toMatchObject({ code: true, workflows: true });
  });

  it("liste vide : tout faux", () => {
    expect(classifyFiles([])).toEqual({ code: false, workflows: false, unreadable: [] });
  });
});

describe("readFileList", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("coupe sur NUL et retire le dernier élément vide", () => {
    expect(readFileList(bytes(".github/workflows/é.yml\0docs/a.md\0"))).toEqual([
      ".github/workflows/é.yml",
      "docs/a.md",
    ]);
  });

  it("conserve tel quel un chemin avec guillemet, tabulation ou espace", () => {
    const files = ['docs/a"b.md', "docs/a\tb.md", " docs/a b.md "];
    expect(readFileList(bytes(`${files.join("\0")}\0`))).toEqual(files);
  });

  it("lève une erreur sur un octet invalide", () => {
    expect(() => readFileList(new Uint8Array([0x61, 0xff, 0x00]))).toThrow();
  });
});

describe("evaluateOwnerApproval", () => {
  const base = {
    labels: ["owner-approved"],
    action: "opened",
    labelName: "",
    headSha: SHA_A,
    headTree: TREE_A,
    events: [pose()],
    comments: [recordComment()],
  };

  it("absent", () => {
    expect(evaluateOwnerApproval({ ...base, labels: [] })).toEqual({
      approved: false,
      stale: false,
      record: null,
      reason: "absent",
    });
  });

  it("no-record", () => {
    expect(evaluateOwnerApproval({ ...base, comments: [] })).toEqual({
      approved: false,
      stale: false,
      record: null,
      reason: "no-record",
    });
  });

  it("changed", () => {
    expect(evaluateOwnerApproval({ ...base, headTree: TREE_B })).toEqual({
      approved: false,
      stale: true,
      record: null,
      reason: "changed",
    });
  });

  it("approved", () => {
    expect(evaluateOwnerApproval(base)).toEqual({
      approved: true,
      stale: false,
      record: null,
      reason: "approved",
    });
  });

  it("nouvel enregistrement pour la pose d'owner-approved", () => {
    const result = evaluateOwnerApproval({
      ...base,
      action: "labeled",
      labelName: "owner-approved",
      headTree: TREE_B,
      headSha: "2".repeat(40),
      comments: [],
    });
    expect(result).toEqual({
      approved: true,
      stale: false,
      record: { tree: TREE_B, sha: "2".repeat(40) },
      reason: "approved",
    });
  });

  it("pas d'enregistrement pour un autre libellé, pour unlabeled ou sans le libellé", () => {
    for (const input of [
      { action: "labeled", labelName: "techlead-approved" },
      { action: "unlabeled", labelName: "owner-approved" },
      { action: "labeled", labelName: "owner-approved", labels: [] },
    ]) {
      expect(evaluateOwnerApproval({ ...base, comments: [], ...input }).record).toBeNull();
    }
  });

  it("ignore un marqueur écrit par un autre auteur", () => {
    const result = evaluateOwnerApproval({
      ...base,
      comments: [recordComment(TREE_A, "2026-10-12T10:00:05Z", "Samoulou")],
    });
    expect(result.reason).toBe("no-record");
  });

  it("ignore une ligne de marqueur modifiée", () => {
    for (const line of [
      `<!-- techlead-gate:owner-approved  tree=${TREE_A} sha=${SHA_A} -->`,
      `<!-- techlead-gate:owner-approved tree=${TREE_A} sha=${SHA_A.slice(1)} -->`,
      ` ${marker(TREE_A, SHA_A)}`,
    ]) {
      const comments = [recordComment(TREE_A, "2026-10-12T10:00:05Z", "github-actions[bot]", line)];
      expect(evaluateOwnerApproval({ ...base, comments }).reason).toBe("no-record");
    }
  });

  it("ignore un enregistrement antérieur à la dernière pose", () => {
    const result = evaluateOwnerApproval({
      ...base,
      events: [pose("2026-10-12T09:00:00Z"), pose("2026-10-12T11:00:00Z")],
      comments: [recordComment(TREE_A, "2026-10-12T09:00:05Z")],
    });
    expect(result.reason).toBe("no-record");
  });

  it("retient l'enregistrement valide le plus récent", () => {
    const comments = [
      recordComment(TREE_B, "2026-10-12T10:30:00Z"),
      recordComment(TREE_A, "2026-10-12T10:00:05Z"),
    ];
    expect(evaluateOwnerApproval({ ...base, comments }).reason).toBe("changed");
    expect(evaluateOwnerApproval({ ...base, headTree: TREE_B, comments }).reason).toBe("approved");
  });

  it("prend la dernière pose sur created_at, quel que soit l'ordre des événements", () => {
    const comments = [recordComment(TREE_A, "2026-10-12T10:00:05Z")];
    for (const events of [
      [pose("2026-10-12T11:00:00Z"), pose("2026-10-12T09:00:00Z")],
      [pose("2026-10-12T09:00:00Z"), pose("2026-10-12T11:00:00Z")],
    ]) {
      expect(evaluateOwnerApproval({ ...base, events, comments }).reason).toBe("no-record");
    }
  });
});

describe("owner-approved : ordonnancement (concurrence)", () => {
  const OTHER_ACTIONS = [
    { action: "opened", labelName: "" },
    { action: "synchronize", labelName: "" },
    { action: "reopened", labelName: "" },
    { action: "unlabeled", labelName: "changes-requested" },
    { action: "labeled", labelName: "techlead-approved" },
  ];
  const state = {
    labels: ["techlead-approved", "owner-approved"],
    headSha: "3".repeat(40),
    events: [pose()],
    comments: [recordComment(TREE_A)],
  };
  const run = (headTree: string, action: string, labelName: string, extra = {}) => {
    const ownerApproval = evaluateOwnerApproval({ ...state, ...extra, headTree, action, labelName });
    const decision = decideGate({
      action,
      labels: state.labels,
      code: true,
      headSha: state.headSha,
      workflows: true,
      ownerApproval,
      ...extra,
    });
    return { ownerApproval, decision };
  };
  const ownerPart = (headTree: string, action: string, labelName: string, extra = {}) => {
    const { ownerApproval, decision } = run(headTree, action, labelName, extra);
    return {
      ownerApproval,
      removeOwnerApproval: decision.removeOwnerApproval,
      message: decision.messages.includes(OWNER_MISSING),
      ownerBlocks: !ownerApproval.approved,
    };
  };

  for (const headTree of [TREE_A, TREE_B]) {
    it(`même résultat pour toute action autre que la pose (arbre ${headTree.slice(-3)})`, () => {
      const results = OTHER_ACTIONS.map(({ action, labelName }) =>
        ownerPart(headTree, action, labelName),
      );
      for (const result of results) expect(result).toEqual(results[0]);
    });
  }

  it("tête à l'arbre B, seule l'exécution labeled (techlead-approved) reste : retrait", () => {
    const { decision } = run(TREE_B, "labeled", "techlead-approved");
    expect(decision).toMatchObject({ removeOwnerApproval: true, pass: false });
    expect(decision.messages).toContain(OWNER_REMOVED);
  });

  it("pushes B puis C (docs seulement), seule l'exécution synchronize de C reste : retrait", () => {
    // La tête C a l'arbre B ; la comparaison porte sur l'arbre enregistré A.
    const { decision } = run(TREE_B, "synchronize", "");
    expect(decision.removeOwnerApproval).toBe(true);
  });

  it("tête revenue à l'arbre A : approuvé, pas de retrait", () => {
    const { ownerApproval, decision } = run(TREE_A, "labeled", "techlead-approved");
    expect(ownerApproval.approved).toBe(true);
    expect(decision).toMatchObject({ removeOwnerApproval: false, pass: true });
  });

  it("exécution de la pose perdue : no-record, échec sans retrait, deux messages", () => {
    const { ownerApproval, decision } = run(TREE_A, "labeled", "techlead-approved", {
      events: [pose("2026-10-12T09:00:00Z"), pose("2026-10-12T12:00:00Z")],
      comments: [recordComment(TREE_A, "2026-10-12T09:00:05Z")],
    });
    expect(ownerApproval.reason).toBe("no-record");
    expect(decision).toMatchObject({ pass: false, removeOwnerApproval: false });
    expect(decision.messages).toContain(OWNER_MISSING);
    expect(decision.messages).toContain(OWNER_NO_RECORD);
  });
});

describe("decideGate : matrice owner-approved", () => {
  const MATRIX_ACTIONS = ["opened", "synchronize", "reopened", "labeled", "unlabeled"] as const;
  const MATRIX_LABELS: string[][] = [
    ...LABEL_SETS,
    ["owner-approved"],
    ["techlead-approved", "owner-approved"],
  ];
  const currentPass = (action: string, labels: string[]) =>
    action !== "synchronize" &&
    labels.includes("techlead-approved") &&
    !labels.includes("changes-requested");
  const currentRemove = (action: string, labels: string[]) =>
    labels.includes("techlead-approved") &&
    (action === "synchronize" || labels.includes("changes-requested"));

  for (const action of MATRIX_ACTIONS) {
    for (const labels of MATRIX_LABELS) {
      const reasons: OwnerApproval["reason"][] = labels.includes("owner-approved")
        ? ["no-record", "changed", "approved"]
        : ["absent"];
      for (const reason of reasons) {
        for (const workflows of [false, true]) {
          it(`${action} [${labels.join(", ")}] ${reason} workflows=${workflows}`, () => {
            const ownerApproval = owner(reason);
            const decision = decideGate({
              action,
              labels,
              code: true,
              headSha: HEAD,
              workflows,
              ownerApproval,
            });
            expect(decision.removeApproval).toBe(currentRemove(action, labels));
            if (!workflows) {
              expect(decision.pass).toBe(currentPass(action, labels));
              expect(decision.removeOwnerApproval).toBe(false);
              expect(decision.recordOwnerApproval).toBeNull();
              expect(decision.messages).not.toContain(OWNER_MISSING);
            } else {
              expect(decision.pass).toBe(currentPass(action, labels) && ownerApproval.approved);
              expect(decision.removeOwnerApproval).toBe(reason === "changed");
              if (!ownerApproval.approved) expect(decision.messages).toContain(OWNER_MISSING);
              else expect(decision.messages).not.toContain(OWNER_MISSING);
              expect(decision.messages.includes(OWNER_NO_RECORD)).toBe(reason === "no-record");
            }
            if (decision.removeOwnerApproval) expect(decision.pass).toBe(false);
          });
        }
      }
    }
  }
});

describe("decideGate : défauts et indépendance (décision 0035)", () => {
  const CASES = [
    ...ACTIONS.flatMap((action) =>
      LABEL_SETS.flatMap((labels) =>
        [true, false].map((code) => ({ action, labels, code, headSha: HEAD })),
      ),
    ),
    { action: "labeled", labels: ["techlead-approved"], code: true, headSha: HEAD, reviews: [review("abc1234")] },
    { action: "labeled", labels: ["techlead-approved"], code: true, headSha: HEAD, reviews: [review("0ff1ce0")] },
    { action: "labeled", labels: ["techlead-approved"], code: true, headSha: HEAD, reviews: [{ body: "LGTM", createdAt: "x" }] },
  ];

  it("sans les nouveaux champs : identique à workflows false et ownerApproval par défaut", () => {
    for (const input of CASES) {
      const implicit = decideGate(input);
      const explicit = decideGate({
        ...input,
        workflows: false,
        filesUnreadable: false,
        ownerApproval: { ...NO_OWNER_APPROVAL },
      });
      expect(implicit).toEqual(explicit);
      expect(implicit.removeOwnerApproval).toBe(false);
      expect(implicit.recordOwnerApproval).toBeNull();
    }
  });

  it("workflows true, code false : pas d'exemption", () => {
    const decision = decideGate({
      action: "opened",
      labels: [],
      code: false,
      headSha: HEAD,
      workflows: true,
      ownerApproval: owner("absent"),
    });
    expect(decision.pass).toBe(false);
    expect(decision.messages).toContain("Validation du Tech Lead manquante (libellé techlead-approved).");
    expect(decision.messages).toContain(OWNER_MISSING);
  });

  it("message de 0035 présent avec d'autres motifs d'échec", () => {
    for (const input of [
      { action: "opened", labels: ["owner-approved"] },
      { action: "labeled", labels: ["changes-requested"] },
      { action: "synchronize", labels: ["techlead-approved"] },
      { action: "labeled", labels: ["techlead-approved"], reviews: [review("0ff1ce0")] },
    ]) {
      const decision = decideGate({
        code: true,
        headSha: HEAD,
        ...input,
        workflows: true,
        ownerApproval: owner("absent"),
      });
      expect(decision.pass).toBe(false);
      expect(decision.messages).toContain(OWNER_MISSING);
    }
  });

  it("owner-approved sans techlead-approved ne fait pas passer la porte", () => {
    const decision = decideGate({
      action: "labeled",
      labels: ["owner-approved"],
      code: true,
      headSha: HEAD,
      workflows: true,
      ownerApproval: owner("approved"),
    });
    expect(decision.pass).toBe(false);
    expect(decision.messages).not.toContain(OWNER_MISSING);
  });

  it("PR sans workflow : owner-approved sans effet, ni retrait, ni enregistrement", () => {
    for (const reason of ["absent", "no-record", "changed", "approved"] as const) {
      for (const input of CASES) {
        const labels = [...input.labels, "owner-approved"];
        const reference = decideGate({ ...input, labels });
        const decision = decideGate({
          ...input,
          labels,
          workflows: false,
          ownerApproval: { ...owner(reason), record: { tree: TREE_A, sha: SHA_A } },
        });
        expect(decision).toEqual(reference);
        expect(decision.removeOwnerApproval).toBe(false);
        expect(decision.recordOwnerApproval).toBeNull();
      }
    }
  });

  it("enregistrement transmis pour une PR de workflow", () => {
    const decision = decideGate({
      action: "labeled",
      labels: ["techlead-approved", "owner-approved"],
      code: true,
      headSha: HEAD,
      workflows: true,
      ownerApproval: { ...owner("approved"), record: { tree: TREE_A, sha: SHA_A } },
    });
    expect(decision).toMatchObject({
      pass: true,
      recordOwnerApproval: { tree: TREE_A, sha: SHA_A },
    });
  });

  it("liste illisible : échec avec le message", () => {
    const decision = decideGate({
      action: "labeled",
      labels: ["techlead-approved", "owner-approved"],
      code: true,
      headSha: HEAD,
      workflows: true,
      ownerApproval: owner("approved"),
      filesUnreadable: true,
    });
    expect(decision.pass).toBe(false);
    expect(decision.messages).toContain(FILES_UNREADABLE);
  });
});

describe("techlead-gate : ligne de commande", () => {
  const SCRIPT = join(process.cwd(), "scripts/ci/techlead-gate.mjs");
  const roots: string[] = [];
  afterEach(() => {
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  /** Dépôt jetable avec un workflow, pour que la ligne de commande calcule headTree. */
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "techlead-gate-cli-"));
    roots.push(root);
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init", "-q", "-b", "main");
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(join(root, ".github/workflows/é.yml"), "on: push\n");
    git("add", "-A");
    git("commit", "-qm", "init");
    const headSha = git("rev-parse", "HEAD");
    const headTree = git("ls-tree", "HEAD", "--", ".github/workflows")
      .replace(/^(\d+) tree (\w+)\t.*$/, "$1 $2");
    const run = (input: object, files: Uint8Array | string | null, args?: string[]) => {
      writeFileSync(join(root, "gate-input.json"), JSON.stringify(input));
      if (files !== null) writeFileSync(join(root, "files.nul"), files);
      return spawnSync("node", [SCRIPT, ...(args ?? ["gate-input.json", "files.nul"])], {
        cwd: root,
        encoding: "utf8",
      });
    };
    const decision = (input: object, files: Uint8Array | string) => {
      const result = run(input, files);
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout);
    };
    return { headSha, headTree, run, decision };
  }

  const approvedInput = (headSha: string) => ({
    action: "labeled",
    labelName: "techlead-approved",
    headSha,
    labels: ["techlead-approved"],
    reviews: [review(headSha.slice(0, 7))],
    events: [],
    comments: [],
  });

  it("workflow sans owner-approved : échec avec le message de 0035", () => {
    const { headSha, decision } = setup();
    const result = decision(approvedInput(headSha), ".github/workflows/é.yml\0");
    expect(result).toMatchObject({ pass: false, workflows: true, code: true });
    expect(result.messages).toContain(OWNER_MISSING);
  });

  it("forme citée : échec « liste illisible »", () => {
    const { headSha, decision } = setup();
    const result = decision(approvedInput(headSha), '".github/workflows/\\303\\251.yml"\0');
    expect(result.pass).toBe(false);
    expect(result.messages).toContain(FILES_UNREADABLE);
  });

  it("octet invalide : échec « liste illisible »", () => {
    const { headSha, decision } = setup();
    const result = decision(approvedInput(headSha), new Uint8Array([0x64, 0xff, 0x00]));
    expect(result).toMatchObject({ pass: false, code: true, workflows: true });
    expect(result.messages).toContain(FILES_UNREADABLE);
  });

  it("code et workflows de l'entrée sont ignorés", () => {
    const { headSha, decision } = setup();
    const result = decision(
      { ...approvedInput(headSha), code: false, workflows: false },
      ".github/workflows/é.yml\0",
    );
    expect(result).toMatchObject({ workflows: true, code: true, pass: false });
  });

  it("second argument manquant : code de sortie non nul", () => {
    const { headSha, run } = setup();
    expect(run(approvedInput(headSha), null, ["gate-input.json"]).status).not.toBe(0);
  });

  it("fichier de liste absent : code de sortie non nul", () => {
    const { headSha, run } = setup();
    expect(run(approvedInput(headSha), null, ["gate-input.json", "absent.nul"]).status).not.toBe(0);
  });

  it("pose d'owner-approved : enregistrement de la tête, porte franchie", () => {
    const { headSha, headTree, decision } = setup();
    const result = decision(
      {
        ...approvedInput(headSha),
        labelName: "owner-approved",
        labels: ["techlead-approved", "owner-approved"],
        events: [pose()],
      },
      ".github/workflows/é.yml\0",
    );
    expect(headTree).toMatch(/^040000 [0-9a-f]{40}$/);
    expect(result).toMatchObject({
      pass: true,
      headTree,
      recordOwnerApproval: { tree: headTree, sha: headSha },
    });
  });

  it("headSha absent du clone : code de sortie non nul", () => {
    const { run } = setup();
    const result = run(approvedInput("9".repeat(40)), ".github/workflows/é.yml\0");
    expect(result.status).not.toBe(0);
  });

  it("before et after sont ignorés", () => {
    const { headSha, decision } = setup();
    const input = {
      ...approvedInput(headSha),
      labels: ["techlead-approved", "owner-approved"],
      events: [pose()],
    };
    const without = decision(input, ".github/workflows/é.yml\0");
    const withFields = decision(
      { ...input, before: "0".repeat(40), after: headSha },
      ".github/workflows/é.yml\0",
    );
    expect(withFields).toEqual(without);
  });
});
