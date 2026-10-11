import { describe, expect, it } from "vitest";

import {
  consolidatedHead,
  decideGate,
  latestConsolidatedHead,
} from "../../../scripts/ci/techlead-gate.mjs";

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
