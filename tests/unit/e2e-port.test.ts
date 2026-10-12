import { describe, expect, it } from "vitest";

import {
  CI_PORT,
  e2ePort,
  fnv1a,
  LOCAL_PORT_MAX,
  LOCAL_PORT_MIN,
  worktreePort,
} from "../../scripts/e2e-port.mjs";

// Décision 0017 § 14 (Q107) : port du serveur Playwright, un par worktree.
const REPO = "/home/user/vadrouille-app";
const WORKTREE = "/home/user/vadrouille-app/.claude/worktrees/agent-a931e27ffc8e4ddec";

describe("fnv1a", () => {
  it("suit les vecteurs de référence FNV-1a 32 bits", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });
});

describe("worktreePort", () => {
  it("est stable pour un même chemin", () => {
    expect(worktreePort(REPO)).toBe(worktreePort(REPO));
    expect(worktreePort(WORKTREE)).toBe(worktreePort(WORKTREE));
  });

  it("donne une valeur figée (le calcul ne change pas sans le vouloir)", () => {
    expect(worktreePort("a")).toBe(LOCAL_PORT_MIN + (0xe40c292c % 800));
  });

  it("reste entre 3100 et 3899 inclus", () => {
    expect(LOCAL_PORT_MIN).toBe(3100);
    expect(LOCAL_PORT_MAX).toBe(3899);
    for (let index = 0; index < 5000; index += 1) {
      const port = worktreePort(`/tmp/worktree-${index}`);
      expect(Number.isInteger(port)).toBe(true);
      expect(port).toBeGreaterThanOrEqual(LOCAL_PORT_MIN);
      expect(port).toBeLessThanOrEqual(LOCAL_PORT_MAX);
    }
  });

  it("répartit des worktrees différents sur des ports différents", () => {
    const ports = new Set(Array.from({ length: 20 }, (_, index) => worktreePort(`${REPO}/.claude/worktrees/agent-${index}`)));
    expect(ports.size).toBeGreaterThan(15);
    expect(worktreePort(REPO)).not.toBe(worktreePort(WORKTREE));
  });
});

describe("e2ePort", () => {
  it("prend E2E_PORT en priorité, même en CI", () => {
    expect(e2ePort({ env: { E2E_PORT: "4321" }, repoPath: REPO })).toBe(4321);
    expect(e2ePort({ env: { E2E_PORT: " 4321 ", CI: "true" }, repoPath: REPO })).toBe(4321);
  });

  it("donne 3100 en CI, quel que soit le chemin", () => {
    expect(CI_PORT).toBe(3100);
    expect(e2ePort({ env: { CI: "true" }, repoPath: REPO })).toBe(3100);
    expect(e2ePort({ env: { CI: "1" }, repoPath: WORKTREE })).toBe(3100);
  });

  it("dérive le port du chemin du dépôt en local", () => {
    expect(e2ePort({ env: {}, repoPath: WORKTREE })).toBe(worktreePort(WORKTREE));
    expect(e2ePort({ env: { CI: "", E2E_PORT: "" }, repoPath: REPO })).toBe(worktreePort(REPO));
  });

  it.each(["abc", "0", "65536", "31.5", "-1", "3100abc"])("refuse E2E_PORT=%s", (value) => {
    expect(() => e2ePort({ env: { E2E_PORT: value }, repoPath: REPO })).toThrow(/E2E_PORT invalide/);
  });
});
