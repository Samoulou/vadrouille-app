// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { OFFER_INCLUSIONS } from "@/contracts/values";
import * as messages from "@/i18n/messages";

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
  const files = ["src/features", "src/components", "src/analytics", "src/i18n/fr"].flatMap((dir) => sources(dir));

  it("couvre les écrans du paiement", () => {
    expect(files).toEqual(
      expect.arrayContaining(["src/features/presentation/OfferScreen.tsx", "src/features/presentation/PaymentSimulation.tsx", "src/i18n/fr/debloquer.json"]),
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

  it("aucun fichier ne pose VADROUILLE_DEMO_SHARE, hors les lignes « docker run » du job docker qui vérifient la fermeture (F10-TL-7, C38)", () => {
    for (const path of configs) {
      const lines = readFileSync(join(ROOT, path), "utf8").split("\n");
      const offenders = lines.filter((line) => /VADROUILLE_DEMO_SHARE/.test(line) && !/^\s*docker run .*-e VADROUILLE_DEMO_SHARE=1 /.test(line));
      expect(offenders, path).toEqual([]);
    }
  });

  // B4a (spécification B4, point 8 et critère A26 ; décision 0097 B4-TL-8 point 3) : drapeau et secret du webhook simulé,
  // sans aucune exception en B4a (l'exception « docker run » du job docker entre avec B4b). Noms en clés d'objet (le
  // second est un nom secret : jamais un texte).
  const NOMS_WEBHOOK_SIMULE = Object.keys({ SIMULATED_WEBHOOK_ENABLED: 0, SIMULATED_WEBHOOK_SECRET: 0 });
  const lignesWebhookSimule = (contenu: string) => contenu.split("\n").filter((ligne) => NOMS_WEBHOOK_SIMULE.some((nom) => ligne.includes(nom)));

  it("aucun fichier de configuration versionné ne contient le drapeau ni le secret du webhook simulé (A26, sans exception)", () => {
    for (const path of configs) expect(lignesWebhookSimule(readFileSync(join(ROOT, path), "utf8")), path).toEqual([]);
  });

  it("la fonction de contrôle refuse le drapeau dans un .env.example, un Dockerfile et un env: de workflow, et le secret partout (A26)", () => {
    const [drapeau, secret] = NOMS_WEBHOOK_SIMULE as [string, string];
    const contenus = [
      `APP_URL=\n${drapeau}=true\n`,
      `FROM node:24\nENV ${drapeau}=true\n`,
      `jobs:\n  test:\n    env:\n      ${drapeau}: "true"\n`,
      `jobs:\n  test:\n    steps:\n      - run: docker run --rm -e ${drapeau}=true image\n`,
      `${secret}=\n`,
    ];
    for (const contenu of contenus) expect(lignesWebhookSimule(contenu), contenu).toHaveLength(1);
    expect(lignesWebhookSimule("APP_URL=\nPAYMENT_ADAPTER=\n")).toEqual([]);
  });

  // B4b (spécification B4, B4b points 4 et 5 ; décision 0097 B4-TL-8 point 4) : `playwright.config.ts` (hors de la
  // configuration versionnée ci-dessus) pose le drapeau et le secret du webhook simulé dans le seul objet du paiement
  // simulé du serveur `api`, à côté de `PAYMENT_ADAPTER: "simulated"`, le secret par `secretJetable()` (jamais un texte).
  it("playwright.config.ts pose le drapeau et le secret du webhook simulé avec PAYMENT_ADAPTER=simulated seulement (B4b)", () => {
    const source = readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
    const [drapeau, secret] = NOMS_WEBHOOK_SIMULE as [string, string];
    expect(lignesWebhookSimule(source).map((ligne) => ligne.trim())).toEqual([`${drapeau}: "true",`, `${secret}: secretJetable(),`]);
    const objet = /const PAIEMENT_SIMULE_API = \{([^}]*)\} as const;/.exec(source)?.[1] ?? "";
    expect(objet).toContain('PAYMENT_ADAPTER: "simulated"');
    expect(objet).toContain(`${drapeau}: "true"`);
    expect(objet).toContain(`${secret}: secretJetable()`);
    expect(source.match(/\.\.\.PAIEMENT_SIMULE_API/g)).toHaveLength(1);
  });

  it("playwright.config.ts pose le drapeau du partage pour les tests (F10-TL-7)", () => {
    expect(readFileSync(join(ROOT, "playwright.config.ts"), "utf8")).toMatch(/VADROUILLE_DEMO_SHARE: "1"/);
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
