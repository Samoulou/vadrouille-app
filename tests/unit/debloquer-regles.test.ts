// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { OFFER_INCLUSIONS } from "@/contracts/values";
import { messages } from "@/i18n";

/**
 * Règles transverses de F9a : source unique du prix (décision 0020 § 4), textes et vocabulaire (handover
 * § 10), valeurs en dur, configuration versionnée du drapeau de démonstration (0020 § 2.3).
 */

const ROOT = process.cwd();

function sources(dir: string, extensions = /\.(tsx?|css|json)$/): string[] {
  const absolute = join(ROOT, dir);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return [dir];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) return sources(relative(ROOT, path), extensions);
    return extensions.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(ROOT, path)] : [];
  });
}

describe("source unique du prix (décision 0020 § 4)", () => {
  const files = ["src/features", "src/components", "src/analytics", "src/i18n/fr.json"].flatMap((dir) => sources(dir));

  it("couvre les écrans du paiement", () => {
    expect(files).toEqual(
      expect.arrayContaining(["src/features/presentation/OfferScreen.tsx", "src/features/presentation/PaymentSimulation.tsx", "src/i18n/fr.json"]),
    );
  });

  it("aucun fichier (tests exclus) ne contient le montant : ni 2900 ni « 29 CHF »", () => {
    const offenders = files.filter((path) => /2900|29[\s  ]CHF/.test(readFileSync(join(ROOT, path), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("aucun module hors de src/server n'importe la configuration de l'offre (hors adaptateurs serveur)", () => {
    const clientDirs = ["src/features", "src/components", "src/analytics", "src/lib", "src/app", "src/i18n", "src/config"];
    const offenders = clientDirs.flatMap((dir) => sources(dir)).filter((path) => /server\/config/.test(readFileSync(join(ROOT, path), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("textes de F9a (fr.json, debloquer.*)", () => {
  const t = messages.debloquer;
  const texts: string[] = [];
  (function collect(value: unknown) {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  })(t);

  it("un texte pour chaque code d'inclusion", () => {
    for (const code of OFFER_INCLUSIONS) expect(t.offre.inclus[code], code).toEqual(expect.any(String));
    expect(Object.keys(t.offre.inclus).sort()).toEqual([...OFFER_INCLUSIONS].sort());
  });

  it("libellés imposés du paiement, exactement", () => {
    expect(t.offre.payer).toEqual({ twint: "Payer avec TWINT", card: "Payer par carte" });
    expect(messages.presentation.fin.debloquer).toBe("Débloquer");
  });

  it("aucun mot interdit ni point d'exclamation", () => {
    for (const text of [...texts, ...Object.values(messages.accueil.demo.liens.debloquer)]) {
      expect(text).not.toMatch(/Aperçu|Acheter maintenant|Premium|\bOK\b|Valider|Supprimer|!/);
    }
  });
});

describe("valeurs en dur dans les fichiers de F9a", () => {
  const files = [
    "src/features/voyage",
    "src/features/presentation/OfferScreen.tsx",
    "src/features/presentation/PaymentSimulation.tsx",
    "src/features/presentation/PaymentReturn.tsx",
    "src/app/voyages",
    "src/components/ligne/DestinationPlate.tsx",
  ].flatMap((dir) => sources(dir, /\.(tsx?|css)$/));

  it("ni couleur, ni px", () => {
    for (const path of files) {
      const source = readFileSync(join(ROOT, path), "utf8");
      expect(source, path).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, path).not.toMatch(/\b(?:rgba?|hsla?)\(/i);
      expect(source, path).not.toMatch(/\d(?:\.\d+)?px\b/);
    }
  });
});

describe("configuration versionnée : drapeau du paiement simulé (décision 0020 § 2.3)", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const configs = tracked.filter(
    (path) =>
      path === "Dockerfile" ||
      path === "vercel.json" ||
      /^\.env/.test(path.split("/").pop() ?? "") ||
      path.startsWith(".github/workflows/") ||
      /^(docker-)?compose.*\.ya?ml$/.test(path.split("/").pop() ?? "") ||
      /^next\.config\./.test(path),
  );

  it("couvre le Dockerfile, les workflows, .env.example et next.config", () => {
    expect(configs).toEqual(expect.arrayContaining(["Dockerfile", ".github/workflows/ci.yml", ".env.example", "next.config.ts"]));
  });

  it("aucun fichier ne pose VADROUILLE_DEMO_PAYMENT, hors les lignes « docker run » du job docker qui vérifient la fermeture", () => {
    for (const path of configs) {
      const lines = readFileSync(join(ROOT, path), "utf8").split("\n");
      const offenders = lines.filter((line) => /VADROUILLE_DEMO_PAYMENT/.test(line) && !/^\s*docker run .*-e VADROUILLE_DEMO_PAYMENT=1 /.test(line));
      expect(offenders, path).toEqual([]);
    }
  });

  it("le Dockerfile pose VADROUILLE_ENV=production ; playwright.config.ts pose le drapeau pour les tests", () => {
    expect(readFileSync(join(ROOT, "Dockerfile"), "utf8")).toMatch(/VADROUILLE_ENV=production/);
    expect(readFileSync(join(ROOT, "playwright.config.ts"), "utf8")).toMatch(/VADROUILLE_DEMO_PAYMENT: "1"/);
  });

  it("aucun préfixe NEXT_PUBLIC_ pour les drapeaux et choix d'adaptateurs", () => {
    for (const path of sources("src", /\.(tsx?)$/)) {
      expect(readFileSync(join(ROOT, path), "utf8"), path).not.toMatch(/NEXT_PUBLIC_(VADROUILLE|PAYMENT|DATA_ADAPTER)/);
    }
  });
});
