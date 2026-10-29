// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { indentOf, workflowSteps } from "../support/workflow-steps";

/**
 * Configuration versionnée et variables d'environnement du serveur (décision 0050, P2, amendement de 0017 § 11.0 ;
 * décision 0051, points 2.3 et 6.4 ; spécification B3, critère A11). Distinct de `tests/unit/dev-pages-env.test.ts`
 * (drapeaux d'ouverture). Lecture par lignes des fichiers suivis par Git, sans dépendance.
 *
 * 1. `VADROUILLE_ENV` n'est posé qu'à `ci` dans chaque `webServer` de `playwright.config.ts`, à `ci` dans les jobs
 *    `verify` et `db` de `.github/workflows/ci.yml`, à `local` dans le script `dev` de `package.json` et à
 *    `production` dans l'étape finale du `Dockerfile` ; `.env.example` peut lister le nom sans valeur.
 * 2. `VERCEL` et `VERCEL_ENV` ne sont posés par aucun fichier versionné.
 * 3. Job `docker` : aucun `docker run` avec `-e VADROUILLE_ENV`, `-e VERCEL_ENV`, `-e VERCEL` ni `--env-file`.
 * 4. Secrets de B3 : jamais dans `.github/workflows/`, jamais affectés à une chaîne littérale.
 * 5. Tout `webServer` qui pose `TRUSTED_IP_HEADER` pose `HOSTNAME: "127.0.0.1"` et lance le serveur autonome.
 * 6. `scripts/serve-standalone.mjs` retire du serveur les deux variables d'outillage de la base.
 *
 * Les noms des secrets sont écrits en clés d'objet (régime de confinement P0c, « Noms secrets ») : jamais en texte.
 */

const ROOT = process.cwd();
const CI_FILE = ".github/workflows/ci.yml";
const PLAYWRIGHT = "playwright.config.ts";

/** Secrets de B3 (0051, point 6.4.2) et variable du migrateur, nommés par clés d'objet. */
const SECRETS_B3 = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0, BETTER_AUTH_SECRET: 0, SIMULATED_WEBHOOK_SECRET: 0 });
const [HMAC = ""] = SECRETS_B3;
const [MIGRATEUR = ""] = Object.keys({ VADROUILLE_DATABASE_URL_MIGRATOR: 0 });
const ADMIN = "VADROUILLE_DB_ADMIN_URL";

/** Jobs où `VADROUILLE_ENV: ci` est admis (jamais `docker`). */
const JOBS_CI = new Set(["verify", "db"]);
/** Commandes du serveur autonome (`pnpm start` lance `scripts/serve-standalone.mjs`). */
const SERVEUR_AUTONOME = /(^|&&\s*)(pnpm start|node scripts\/serve-standalone\.mjs)\s*$/;

const commentaire = (line: string) => /^\s*(#|\/\/|\*|\/\*)/.test(line);

/** Job de chaque ligne d'un workflow (clé de premier niveau sous `jobs:`), ou `null`. */
export function jobsByLine(content: string): (string | null)[] {
  let inJobs = false;
  let jobIndent = -1;
  let job: string | null = null;
  return content.split("\n").map((line) => {
    if (/^\S/.test(line)) {
      inJobs = /^jobs:\s*$/.test(line);
      job = null;
      return null;
    }
    if (!inJobs || line.trim() === "" || commentaire(line)) return job;
    const match = /^(\s+)([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (match && (jobIndent === -1 || indentOf(line) === jobIndent)) {
      jobIndent = indentOf(line);
      job = match[2] ?? null;
    }
    return job;
  });
}

/** Lignes (`chemin:ligne`) qui posent `VADROUILLE_ENV` hors des emplacements et des valeurs admis (P2 point 1). */
export function vadrouilleEnvOffenders(path: string, content: string): string[] {
  const lines = content.split("\n");
  const jobs = path.startsWith(".github/workflows/") ? jobsByLine(content) : [];
  const lastFrom = lines.map((line) => /^FROM\s/i.test(line)).lastIndexOf(true);
  const name = path.split("/").pop() ?? "";
  const admis = (line: string, index: number): boolean => {
    if (path === PLAYWRIGHT) return /^\s*VADROUILLE_ENV: "ci",?\s*$/.test(line);
    if (path === "package.json") return /^\s*"dev": "VADROUILLE_ENV=local next dev",?\s*$/.test(line);
    if (path === CI_FILE) return /^\s*VADROUILLE_ENV: ci\s*$/.test(line) && JOBS_CI.has(jobs[index] ?? "");
    if (path === "Dockerfile") return lastFrom >= 0 && index > lastFrom && /^\s*(ENV\s+)?VADROUILLE_ENV=production(\s+\\)?\s*$/.test(line);
    if (/^\.env/.test(name)) return /^\s*VADROUILLE_ENV=\s*$/.test(line);
    return false;
  };
  return lines.flatMap((line, index) =>
    line.includes("VADROUILLE_ENV") && !commentaire(line) && !admis(line, index) ? [`${path}:${index + 1}`] : [],
  );
}

/** Lignes qui posent `VERCEL` ou `VERCEL_ENV` (P2 point 2) : aucune n'est admise. */
export function vercelOffenders(path: string, content: string): string[] {
  return content
    .split("\n")
    .flatMap((line, index) => (!commentaire(line) && /\bVERCEL(_ENV)?\b"?\s*[:=]/.test(line) ? [`${path}:${index + 1}`] : []));
}

/** Commandes `docker run` du job `docker` qui passent l'environnement à l'image (P2 point 3). */
export function dockerRunOffenders(content: string): string[] {
  return workflowSteps(content)
    .filter((step) => step.job === "docker")
    .flatMap((step) =>
      step.lines.flatMap((line, offset) =>
        !commentaire(line) &&
        /\bdocker run\b|"\$@"/.test(line) &&
        /--env-file|(-e|--env)\s+"?(VADROUILLE_ENV|VERCEL_ENV|VERCEL)\b/.test(line)
          ? [`${CI_FILE}:${step.start + offset}`]
          : [],
      ),
    );
}

/** Lignes qui nomment un secret de B3 dans un workflow, ou qui lui affectent une chaîne littérale (0051 point 6.4). */
export function secretOffenders(path: string, content: string): string[] {
  const workflow = path.startsWith(".github/workflows/");
  return content.split("\n").flatMap((line, index) => {
    const noms = SECRETS_B3.filter((nom) => line.includes(nom));
    if (noms.length === 0) return [];
    if (workflow) return [`${path}:${index + 1}`];
    const litteral = noms.some((nom) => {
      const valeur = new RegExp(`\\b${nom}"?\\s*[:=]\\s*(.*)$`).exec(line)?.[1]?.trim() ?? "";
      // Une valeur tirée à l'exécution est un appel (`secretJetable()`, `randomBytes(32)…`) ; vide : `.env.example`.
      return valeur !== "" && !/^[A-Za-z_$][\w$.]*\(/.test(valeur);
    });
    return litteral ? [`${path}:${index + 1}`] : [];
  });
}

/** Objets du tableau `webServer` de `playwright.config.ts`, par profondeur d'accolades. */
export function webServers(config: string): string[] {
  const debut = config.indexOf("webServer: [");
  if (debut === -1) return [];
  const serveurs: string[] = [];
  let profondeur = 0;
  let courant = -1;
  for (let i = debut + "webServer: [".length; i < config.length; i += 1) {
    const c = config.charAt(i);
    if (c === "{") {
      if (profondeur === 0) courant = i;
      profondeur += 1;
    } else if (c === "}") {
      profondeur -= 1;
      if (profondeur === 0) serveurs.push(config.slice(courant, i + 1));
    } else if (c === "]" && profondeur === 0) break;
  }
  return serveurs;
}

/** Valeur d'une constante de chaîne du fichier (`const nom = "…"` ou modèle `${…}` résolu une fois). */
function constante(config: string, nom: string): string | null {
  const match = new RegExp(`const ${nom} = ([^;\\n]+);`).exec(config);
  if (!match) return null;
  const valeur = match[1] ?? "";
  const simple = /^"([^"]*)"$/.exec(valeur);
  if (simple) return simple[1] ?? "";
  // `process.env.X ? a : `…${a}``, forme de `command` : chaque branche doit lancer le serveur autonome.
  const branches = /\?\s*(\w+)\s*:\s*`([^`]*)`$/.exec(valeur);
  if (branches) {
    const a = constante(config, branches[1] ?? "");
    const b = (branches[2] ?? "").replace(/\$\{(\w+)\}/g, (_, n: string) => constante(config, n) ?? "");
    return a !== null && SERVEUR_AUTONOME.test(a) && SERVEUR_AUTONOME.test(b) ? a : "(commande mixte)";
  }
  return null;
}

/** Problèmes des `webServer` (P2 points 1 et 5 ; 0051 point 2.3), par serveur. */
export function webServerOffenders(config: string): string[] {
  return webServers(config).flatMap((serveur, rang) => {
    const problemes: string[] = [];
    if (!/^\s*VADROUILLE_ENV: "ci",?\s*$/m.test(serveur)) problemes.push(`webServer ${rang + 1} : VADROUILLE_ENV`);
    if (/\bTRUSTED_IP_HEADER\b/.test(serveur)) {
      if (!/^\s*HOSTNAME: "127\.0\.0\.1",?\s*$/m.test(serveur) || /^\s*HOSTNAME:/m.test(serveur.replace(/^\s*HOSTNAME: "127\.0\.0\.1",?\s*$/m, "")))
        problemes.push(`webServer ${rang + 1} : HOSTNAME`);
      const commande = /^\s*command(?::\s*([^,\n]+))?,?\s*$/m.exec(serveur);
      const brute = commande?.[1]?.trim() ?? (commande ? "command" : "");
      const valeur = /^"([^"]*)"$/.exec(brute)?.[1] ?? (/^\w+$/.test(brute) ? constante(config, brute) : null);
      if (valeur === null || !SERVEUR_AUTONOME.test(valeur)) problemes.push(`webServer ${rang + 1} : commande`);
    }
    return problemes;
  });
}

/** Clé de l'API de Resend (B3d ; décision 0138 § 2.1), nommée par clé d'objet. */
const [CLE_RESEND = ""] = Object.keys({ RESEND_API_KEY: 0 });

/**
 * Lignes qui posent la clé Resend (toute mention hors commentaire : sa seule présence, vide comprise, est refusée au
 * démarrage) ou `EMAIL_TRANSPORT=resend` (spécification B3d, R12 ; décision 0138 § 2.2 et § 13 : la clé n'est posée que
 * par Samuel, dans Vercel, jamais par un fichier versionné).
 */
export function resendOffenders(path: string, content: string): string[] {
  return content
    .split("\n")
    .flatMap((line, index) =>
      !commentaire(line) && (line.includes(CLE_RESEND) || /\bEMAIL_TRANSPORT"?\s*[:=]\s*["']?\s*resend\b/i.test(line)) ? [`${path}:${index + 1}`] : [],
    );
}

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const configs = tracked.filter((path) => {
  const name = path.split("/").pop() ?? "";
  return (
    path === "Dockerfile" ||
    path === "vercel.json" ||
    path === PLAYWRIGHT ||
    path === "package.json" ||
    path.startsWith("scripts/") ||
    /^\.env/.test(name) ||
    path.startsWith(".github/workflows/") ||
    /^(docker-)?compose.*\.ya?ml$/.test(name) ||
    /^next\.config\./.test(path)
  );
});
const lire = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("configuration versionnée : environnement du serveur (décision 0050, P2)", () => {
  it("lit le Dockerfile, les workflows, les .env suivis, playwright.config.ts, package.json et scripts/", () => {
    expect(configs).toEqual(expect.arrayContaining(["Dockerfile", CI_FILE, ".env.example", "next.config.ts", PLAYWRIGHT, "package.json", "scripts/serve-standalone.mjs"]));
  });

  it("VADROUILLE_ENV n'est posé qu'aux quatre emplacements admis, avec leur valeur", () => {
    expect(configs.flatMap((path) => vadrouilleEnvOffenders(path, lire(path)))).toEqual([]);
  });

  it("VERCEL et VERCEL_ENV ne sont posés par aucun fichier versionné", () => {
    expect(configs.flatMap((path) => vercelOffenders(path, lire(path)))).toEqual([]);
  });

  it("le job docker ne passe ni VADROUILLE_ENV, ni VERCEL_ENV, ni VERCEL, ni --env-file à l'image", () => {
    expect(dockerRunOffenders(lire(CI_FILE))).toEqual([]);
  });

  it("VADROUILLE_ENV: ci est posé au niveau des jobs verify et db", () => {
    const content = lire(CI_FILE);
    const jobs = jobsByLine(content);
    const poses = content.split("\n").flatMap((line, index) => (/^\s*VADROUILLE_ENV: ci\s*$/.test(line) ? [jobs[index]] : []));
    expect([...new Set(poses)].sort()).toEqual(["db", "verify"]);
  });

  it("aucun secret de B3 dans un workflow, ni affecté à une valeur littérale", () => {
    expect(configs.flatMap((path) => secretOffenders(path, lire(path)))).toEqual([]);
  });

  it("chaque webServer pose VADROUILLE_ENV=ci ; celui qui pose TRUSTED_IP_HEADER lance le serveur autonome sur 127.0.0.1", () => {
    const config = lire(PLAYWRIGHT);
    expect(webServers(config).length).toBeGreaterThanOrEqual(2);
    // Serveur principal, serveur `auth` de B3c (connexion réelle, B3c point 7 : en-tête de confiance exigé) et serveur
    // `api` de B6b (mêmes variables que `auth`, plus `DATA_ADAPTER=api`).
    expect(webServers(config).filter((serveur) => serveur.includes("TRUSTED_IP_HEADER"))).toHaveLength(3);
    expect(webServerOffenders(config)).toEqual([]);
  });

  it("le secret du limiteur des e2e et des tests de base est tiré à l'exécution (crypto.randomBytes)", () => {
    expect(lire(PLAYWRIGHT)).toMatch(new RegExp(`^\\s*${HMAC}: secretJetable\\(\\),$`, "m"));
    expect(lire(PLAYWRIGHT)).toMatch(/const secretJetable = \(\) => randomBytes\(32\)\.toString\("base64url"\);/);
    expect(lire("scripts/test-db.mjs")).toMatch(new RegExp(`${HMAC}: randomBytes\\(32\\)\\.toString\\("base64url"\\)`));
  });

  it("scripts/serve-standalone.mjs retire les deux variables d'outillage de la base de l'environnement du serveur", () => {
    const script = lire("scripts/serve-standalone.mjs");
    expect(script).toMatch(/const serverEnv = \{ \.\.\.process\.env \};/);
    expect(script).toContain(`delete serverEnv.${MIGRATEUR};`);
    expect(script).toContain(`delete serverEnv.${ADMIN};`);
    expect(script).toMatch(/spawn\(process\.execPath, \["server\.js"\], \{[^}]*env: serverEnv,/);
  });

  it("scripts/serve-standalone.mjs retire toute adresse de rôle technique exportée par db-setup.sh, hors app et auth (PR 452, mineur 3)", () => {
    const script = lire("scripts/serve-standalone.mjs");
    const exportees = [...lire("scripts/ci/db-setup.sh").matchAll(/export (VADROUILLE_[A-Z_]+)\b/g)].map((m) => m[1] ?? "");
    const conservees = new Set(Object.keys({ VADROUILLE_DATABASE_URL: 0, VADROUILLE_DATABASE_URL_AUTH: 0 }));
    const retirees = [...new Set(exportees)].filter((nom) => !conservees.has(nom));
    expect(retirees.length).toBeGreaterThanOrEqual(5);
    for (const nom of retirees) expect(script).toContain(`delete serverEnv.${nom};`);
    // Le serveur `auth` de Playwright est servi par ce script (`command: serve`).
    expect(lire(PLAYWRIGHT)).toMatch(/AUTH_SERVER\s*\?\s*\[\s*\{[^]*?command: serve,[^]*?AUTH_ADAPTER: "better-auth"/);
  });

  it("le script dev pose VADROUILLE_ENV=local, et aucun autre script de package.json ne pose VADROUILLE_ENV", () => {
    const scripts = (JSON.parse(lire("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(scripts.dev).toBe("VADROUILLE_ENV=local next dev");
    for (const [nom, commande] of Object.entries(scripts)) if (nom !== "dev") expect(commande, nom).not.toContain("VADROUILLE_ENV");
  });
});

describe("email: aucun envoi réel par le studio (B3d, R12)", () => {
  it("aucun fichier de configuration versionné ne pose la clé Resend ni EMAIL_TRANSPORT=resend", () => {
    expect(configs.flatMap((path) => resendOffenders(path, lire(path)))).toEqual([]);
  });

  it("cas propres : clé ou transport resend posés → échec ; commentaire ou smtp → succès", () => {
    expect(resendOffenders(".env.example", `${CLE_RESEND}=`)).toHaveLength(1);
    expect(resendOffenders(PLAYWRIGHT, `        ${CLE_RESEND}: "re_x",`)).toHaveLength(1);
    expect(resendOffenders(CI_FILE, "      EMAIL_TRANSPORT: resend")).toHaveLength(1);
    expect(resendOffenders(".env.example", "EMAIL_TRANSPORT= Resend")).toHaveLength(1);
    expect(resendOffenders("docker-compose.yml", '      EMAIL_TRANSPORT: "resend"')).toHaveLength(1);
    expect(resendOffenders(".env.example", "# EMAIL_TRANSPORT=resend : posée par Samuel dans Vercel seulement")).toEqual([]);
    expect(resendOffenders(PLAYWRIGHT, '        EMAIL_TRANSPORT: "smtp",')).toEqual([]);
  });

  it("le scénario e2e de connexion reste sur Mailpit : playwright.config.ts pose EMAIL_TRANSPORT=smtp seulement", () => {
    const lignes = lire(PLAYWRIGHT).split("\n").filter((line) => /EMAIL_TRANSPORT/.test(line) && !commentaire(line));
    expect(lignes.length).toBeGreaterThan(0);
    for (const line of lignes) expect(line).toMatch(/EMAIL_TRANSPORT"?\s*:\s*"smtp"/);
  });
});

describe("configuration versionnée : cas propres (décision 0050, P2 point 5 ; critère A11)", () => {
  const WORKFLOW = (jobs: Record<string, string[]>) =>
    ["name: CI", "jobs:", ...Object.entries(jobs).flatMap(([job, lines]) => [`  ${job}:`, "    runs-on: ubuntu-latest", ...lines])].join("\n");

  it("configuration actuelle → succès (cas de référence)", () => {
    expect(vadrouilleEnvOffenders(CI_FILE, WORKFLOW({ verify: ["    env:", "      VADROUILLE_ENV: ci"], db: ["    env:", "      VADROUILLE_ENV: ci"] }))).toEqual([]);
  });

  it("VADROUILLE_ENV=local dans un docker-compose.yml → échec", () => {
    expect(vadrouilleEnvOffenders("docker-compose.yml", "services:\n  app:\n    environment:\n      - VADROUILLE_ENV=local")).toEqual(["docker-compose.yml:4"]);
  });

  it("-e VADROUILLE_ENV=ci sur un docker run du job docker → échec", () => {
    const content = WORKFLOW({ docker: ["    steps:", "      - name: Démarrage", "        run: |", "          docker run -d -e VADROUILLE_ENV=ci app:ci"] });
    expect(dockerRunOffenders(content)).toHaveLength(1);
    expect(vadrouilleEnvOffenders(CI_FILE, content)).toHaveLength(1);
  });

  it("--env-file, -e VERCEL=1 ou -e VERCEL_ENV sur un docker run du job docker → échec", () => {
    for (const option of ["--env-file .env", "-e VERCEL=1", '-e "VERCEL_ENV=preview"', "--env VERCEL_ENV=preview"]) {
      const content = WORKFLOW({ docker: ["    steps:", "      - name: Démarrage", "        run: |", `          docker run -d ${option} app:ci`] });
      expect(dockerRunOffenders(content), option).toHaveLength(1);
    }
  });

  it("VADROUILLE_ENV: ci dans le job docker → échec", () => {
    expect(vadrouilleEnvOffenders(CI_FILE, WORKFLOW({ docker: ["    env:", "      VADROUILLE_ENV: ci"] }))).toHaveLength(1);
  });

  it("VADROUILLE_ENV=staging dans ci.yml → échec", () => {
    expect(vadrouilleEnvOffenders(CI_FILE, WORKFLOW({ verify: ["    env:", "      VADROUILLE_ENV: staging"] }))).toHaveLength(1);
  });

  it("VADROUILLE_ENV dans un autre workflow, un script, next.config ou un .env avec valeur → échec", () => {
    expect(vadrouilleEnvOffenders(".github/workflows/release.yml", WORKFLOW({ verify: ["    env:", "      VADROUILLE_ENV: ci"] }))).toHaveLength(1);
    expect(vadrouilleEnvOffenders("scripts/x.mjs", 'process.env.VADROUILLE_ENV = "ci";')).toHaveLength(1);
    expect(vadrouilleEnvOffenders("next.config.ts", 'env: { VADROUILLE_ENV: "local" }')).toHaveLength(1);
    expect(vadrouilleEnvOffenders(".env.example", "VADROUILLE_ENV=local")).toHaveLength(1);
    expect(vadrouilleEnvOffenders(".env.example", "VADROUILLE_ENV=")).toEqual([]);
  });

  it("VADROUILLE_ENV local dans playwright.config.ts, ou dans un autre script de package.json → échec", () => {
    expect(vadrouilleEnvOffenders(PLAYWRIGHT, '        VADROUILLE_ENV: "local",')).toHaveLength(1);
    expect(vadrouilleEnvOffenders("package.json", '    "start": "VADROUILLE_ENV=local node scripts/serve-standalone.mjs",')).toHaveLength(1);
  });

  it("VADROUILLE_ENV=production dans le Dockerfile hors de l'étape finale → échec ; dans l'étape finale → succès", () => {
    const dockerfile = "FROM node AS builder\nENV VADROUILLE_ENV=production\nFROM node AS runner\nENV NODE_ENV=production \\\n    VADROUILLE_ENV=production \\\n    PORT=3000";
    expect(vadrouilleEnvOffenders("Dockerfile", dockerfile)).toEqual(["Dockerfile:2"]);
  });

  it("VERCEL=1 dans playwright.config.ts → échec ; VERCEL_ENV dans un workflow → échec", () => {
    expect(vercelOffenders(PLAYWRIGHT, '        VERCEL: "1",')).toHaveLength(1);
    expect(vercelOffenders(CI_FILE, "      VERCEL_ENV: preview")).toHaveLength(1);
    expect(vercelOffenders(CI_FILE, "      # VERCEL_ENV: posée par la plateforme")).toEqual([]);
  });

  it("un secret de B3 en valeur littérale dans playwright.config.ts → échec ; tiré à l'exécution → succès", () => {
    expect(secretOffenders(PLAYWRIGHT, `        ${HMAC}: "valeur-ecrite-en-dur",`)).toHaveLength(1);
    expect(secretOffenders(PLAYWRIGHT, `        ${HMAC}: secretJetable(),`)).toEqual([]);
    expect(secretOffenders(".env.example", `${HMAC}=`)).toEqual([]);
    expect(secretOffenders(".env.example", `${HMAC}=abc`)).toHaveLength(1);
  });

  it("un secret de B3 sous quelque forme que ce soit dans ci.yml → échec", () => {
    for (const nom of SECRETS_B3) {
      expect(secretOffenders(CI_FILE, `          echo "${nom}=$(openssl rand -base64 32)" >> "$GITHUB_ENV"`), nom).toHaveLength(1);
      expect(secretOffenders(CI_FILE, `      # ${nom}`), nom).toHaveLength(1);
    }
  });

  describe("webServer avec TRUSTED_IP_HEADER (0051 point 2.3)", () => {
    const config = (serveur: string[]) =>
      ['const serve = "node scripts/serve-standalone.mjs";', "export default defineConfig({", "  webServer: [", "    {", ...serveur, "    },", "  ],", "});"].join("\n");
    const conforme = ["      command: serve,", "      env: {", '        VADROUILLE_ENV: "ci",', '        TRUSTED_IP_HEADER: "x-vercel-forwarded-for",', '        HOSTNAME: "127.0.0.1",', "      },"];

    it("serveur autonome sur 127.0.0.1 → succès", () => {
      expect(webServerOffenders(config(conforme))).toEqual([]);
      expect(webServerOffenders(config(conforme.map((l) => l.replace("command: serve,", 'command: "pnpm start",'))))).toEqual([]);
    });

    it("sans HOSTNAME → échec", () => {
      expect(webServerOffenders(config(conforme.filter((l) => !l.includes("HOSTNAME"))))).toEqual(["webServer 1 : HOSTNAME"]);
    });

    it('HOSTNAME: "0.0.0.0" → échec', () => {
      expect(webServerOffenders(config(conforme.map((l) => l.replace("127.0.0.1", "0.0.0.0"))))).toEqual(["webServer 1 : HOSTNAME"]);
    });

    it("une autre commande que le serveur autonome → échec", () => {
      expect(webServerOffenders(config(conforme.map((l) => l.replace("command: serve,", 'command: "pnpm dev",'))))).toEqual(["webServer 1 : commande"]);
      expect(webServerOffenders(config(conforme.map((l) => l.replace("command: serve,", 'command: "next start",'))))).toEqual(["webServer 1 : commande"]);
    });

    it("un webServer sans VADROUILLE_ENV=ci → échec", () => {
      expect(webServerOffenders(config(conforme.filter((l) => !l.includes("VADROUILLE_ENV"))))).toEqual(["webServer 1 : VADROUILLE_ENV"]);
    });
  });
});
