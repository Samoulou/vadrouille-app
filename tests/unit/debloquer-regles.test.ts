// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { OFFER_INCLUSIONS } from "@/contracts/values";
import * as messages from "@/i18n/messages";

import { indentOf, workflowSteps } from "../support/workflow-steps";

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

  // B4a (spécification B4, point 8 et critère A26 ; décision 0097 B4-TL-8 point 3) : drapeau et secret du webhook simulé.
  // Noms en clés d'objet (le second est un nom secret : jamais un texte).
  const NOMS_WEBHOOK_SIMULE = Object.keys({ SIMULATED_WEBHOOK_ENABLED: 0, SIMULATED_WEBHOOK_SECRET: 0 });
  const [DRAPEAU_WEBHOOK = "", SECRET_WEBHOOK = ""] = NOMS_WEBHOOK_SIMULE;
  const lignesWebhookSimule = (contenu: string) => contenu.split("\n").filter((ligne) => NOMS_WEBHOOK_SIMULE.some((nom) => ligne.includes(nom)));

  // B4b-ci (spécification B4, A10 et A26 ; décision 0097 B4-TL-8 et transfert à B4b ; 0020, amendement B4-TL-14, écart 2) :
  // exception unique et bornée, sur le modèle de Q160 et de tests/unit/dev-pages-env.test.ts. Est admise la seule ligne
  // `verifier <nom> <drapeau> -e "<drapeau>=true"` de l'étape « Gardes de configuration de l'image » du job `docker` de
  // ci.yml, qui exige le refus de démarrer de l'image de production (`docker run` dans la fonction `verifier` de
  // l'étape). Jamais le secret, jamais une clé `env:` ni un `export` dans l'étape, jamais un autre fichier, job ou étape.
  const CI_FILE = ".github/workflows/ci.yml";
  const ETAPE_REFUS = "Gardes de configuration de l'image";
  const LIGNE_REFUS = new RegExp(`^\\s*verifier [a-z0-9-]+ ${DRAPEAU_WEBHOOK} -e "${DRAPEAU_WEBHOOK}=true"\\s*$`);

  /** Lignes qui nomment le drapeau ou le secret du webhook simulé hors de l'exception : `chemin:ligne`. */
  function webhookSimuleOffenders(path: string, contenu: string): string[] {
    const admises = new Set<number>();
    if (path === CI_FILE) {
      for (const etape of workflowSteps(contenu)) {
        if (etape.job !== "docker" || etape.name !== ETAPE_REFUS) continue;
        const retrait = indentOf(etape.lines[0] ?? "");
        if (etape.lines.some((ligne) => /^\s*env:/.test(ligne) && indentOf(ligne) === retrait + 2)) continue;
        if (etape.lines.some((ligne) => /(^|[\s;&|])export\s/.test(ligne.replace(/#.*$/, "")))) continue;
        // La fonction `verifier` de l'étape lance l'image `app:ci` et exige un code de sortie non nul.
        if (!etape.lines.some((ligne) => /^\s*docker run -d --name "\$nom" "\$@" app:ci > \/dev\/null\s*$/.test(ligne))) continue;
        etape.lines.forEach((ligne, decalage) => {
          if (LIGNE_REFUS.test(ligne) && !ligne.includes(SECRET_WEBHOOK)) admises.add(etape.start + decalage);
        });
      }
    }
    return contenu
      .split("\n")
      .flatMap((ligne, index) => (NOMS_WEBHOOK_SIMULE.some((nom) => ligne.includes(nom)) && !admises.has(index + 1) ? [`${path}:${index + 1}`] : []));
  }

  it("aucun fichier de configuration versionné ne contient le drapeau ni le secret du webhook simulé, hors la ligne de refus du job docker (A26)", () => {
    expect(configs.flatMap((path) => webhookSimuleOffenders(path, readFileSync(join(ROOT, path), "utf8")))).toEqual([]);
  });

  it("le job docker vérifie le refus de démarrer avec le drapeau du webhook simulé, une seule fois, et jamais avec le secret (A10)", () => {
    const contenu = readFileSync(join(ROOT, CI_FILE), "utf8");
    const lignes = lignesWebhookSimule(contenu);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(LIGNE_REFUS);
    expect(contenu).not.toContain(SECRET_WEBHOOK);
    expect(contenu).toMatch(/-X POST .*http:\/\/127\.0\.0\.1:3000\/api\/v1\/webhooks\/simulated\)" = "404"/);
  });

  it("la fonction de contrôle refuse le drapeau dans un .env.example, un Dockerfile et un env: de workflow, et le secret partout (A26)", () => {
    const contenus = [
      `APP_URL=\n${DRAPEAU_WEBHOOK}=true\n`,
      `FROM node:24\nENV ${DRAPEAU_WEBHOOK}=true\n`,
      `jobs:\n  test:\n    env:\n      ${DRAPEAU_WEBHOOK}: "true"\n`,
      `jobs:\n  test:\n    steps:\n      - run: docker run --rm -e ${DRAPEAU_WEBHOOK}=true image\n`,
      `${SECRET_WEBHOOK}=\n`,
    ];
    for (const contenu of contenus) expect(lignesWebhookSimule(contenu), contenu).toHaveLength(1);
    for (const contenu of contenus) expect(webhookSimuleOffenders(".env.example", contenu), contenu).toHaveLength(1);
    expect(webhookSimuleOffenders("Dockerfile", contenus[1] ?? "")).toEqual(["Dockerfile:2"]);
    expect(lignesWebhookSimule("APP_URL=\nPAYMENT_ADAPTER=\n")).toEqual([]);
  });

  describe("exception bornée de la ligne de refus (A26, B4-TL-8)", () => {
    const etape = (lignes: string[], { job = "docker", nom = ETAPE_REFUS } = {}) =>
      [
        "name: ci",
        "jobs:",
        "  verify:",
        "    runs-on: ubuntu-24.04",
        "    steps:",
        "      - run: echo verify",
        `  ${job}:`,
        "    runs-on: ubuntu-24.04",
        "    steps:",
        "      - run: docker build -t app:ci .",
        "      - if: steps.diff.outputs.code == 'true'",
        `        name: ${nom}`,
        ...lignes,
      ].join("\n");
    const VERIFIER = ["        run: |", "          verifier() {", '            docker run -d --name "$nom" "$@" app:ci > /dev/null', "          }"];
    const REFUS = `          verifier gardes-webhook-simule ${DRAPEAU_WEBHOOK} -e "${DRAPEAU_WEBHOOK}=true"`;
    const conforme = [...VERIFIER, REFUS];

    it("l'étape conforme passe", () => {
      expect(webhookSimuleOffenders(CI_FILE, etape(conforme))).toEqual([]);
    });

    it("la même ligne dans un autre job, une autre étape ou un autre fichier échoue", () => {
      expect(webhookSimuleOffenders(CI_FILE, etape(conforme, { job: "db" }))).toHaveLength(1);
      expect(webhookSimuleOffenders(CI_FILE, etape(conforme, { nom: "Gardes fermées malgré les drapeaux" }))).toHaveLength(1);
      expect(webhookSimuleOffenders(".github/workflows/release.yml", etape(conforme))).toHaveLength(1);
    });

    it("une clé env: ou un export dans l'étape échoue", () => {
      expect(webhookSimuleOffenders(CI_FILE, etape(["        env:", "          A: b", ...conforme]))).toHaveLength(1);
      expect(webhookSimuleOffenders(CI_FILE, etape([...conforme, "          export A=b"]))).toHaveLength(1);
    });

    it("une autre valeur, une autre forme, le secret ou une autre image échoue", () => {
      expect(webhookSimuleOffenders(CI_FILE, etape([...VERIFIER, REFUS.replace("=true", "=1")]))).toHaveLength(1);
      expect(webhookSimuleOffenders(CI_FILE, etape([...VERIFIER, REFUS.replace("-e ", "--env ")]))).toHaveLength(1);
      expect(webhookSimuleOffenders(CI_FILE, etape([...VERIFIER, `${REFUS} -e "${SECRET_WEBHOOK}=x"`]))).toHaveLength(1);
      expect(webhookSimuleOffenders(CI_FILE, etape([...VERIFIER, `          docker run -d -e "${DRAPEAU_WEBHOOK}=true" app:ci`]))).toHaveLength(1);
      expect(webhookSimuleOffenders(CI_FILE, etape([...VERIFIER.map((ligne) => ligne.replace("app:ci", "autre:ci")), REFUS]))).toHaveLength(1);
    });
  });

  // B4b (spécification B4, B4b points 4 et 5 ; décision 0097 B4-TL-8 point 4) : `playwright.config.ts` (hors de la
  // configuration versionnée ci-dessus) pose le drapeau et le secret du webhook simulé dans le seul objet du paiement
  // simulé du serveur `api`, à côté de `PAYMENT_ADAPTER: "simulated"`, le secret par `secretJetable()` (jamais un texte).
  it("playwright.config.ts pose le drapeau et le secret du webhook simulé avec PAYMENT_ADAPTER=simulated seulement (B4b)", () => {
    const source = readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
    const [drapeau, secret] = [DRAPEAU_WEBHOOK, SECRET_WEBHOOK];
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
