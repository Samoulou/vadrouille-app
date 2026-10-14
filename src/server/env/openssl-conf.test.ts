// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  analyserTexteOpensslConf,
  examinerOpensslConf,
  OPENSSL_CONF_MAX_OCTETS,
  VERDICTS_OPENSSL_CONF,
  ZONES_OPENSSL_CONF,
  type SystemeFichiersOpenssl,
} from "./openssl-conf";

/**
 * Examen d'`OPENSSL_CONF` (décision 0062, sections 4, 5 et 7.6 ; ticket 341). Système de fichiers injecté : un arbre
 * en mémoire. Une chaîne est un fichier ordinaire, un tableau un dossier (noms de ses entrées), `{ lien }` un lien
 * symbolique, `{ illisible }` un fichier dont la lecture lève, `{ taille }` un fichier dont `lstat` annonce cette taille.
 */
type Noeud = string | readonly string[] | { readonly lien: string } | { readonly illisible: true } | { readonly taille: number; readonly texte: string };

function fauxFs(arbre: Readonly<Record<string, Noeud>>): SystemeFichiersOpenssl & { readonly appels: string[] } {
  const appels: string[] = [];
  const noeuds = new Map(Object.entries(arbre));
  const noeud = (chemin: string): Noeud => {
    const trouve = noeuds.get(chemin);
    if (trouve === undefined) throw new Error(`ENOENT ${chemin}`);
    return trouve;
  };
  const resoudre = (chemin: string, tours = 0): string => {
    const n = noeud(chemin);
    if (typeof n === "object" && "lien" in n) {
      if (tours > 8) throw new Error("ELOOP");
      return resoudre(n.lien, tours + 1);
    }
    return chemin;
  };
  return {
    appels,
    realpathSync: (chemin) => {
      appels.push(`realpath ${chemin}`);
      return resoudre(chemin);
    },
    lstatSync: (chemin) => {
      appels.push(`lstat ${chemin}`);
      const n = noeud(chemin);
      const fichier = typeof n === "string" || (typeof n === "object" && !Array.isArray(n) && ("illisible" in n || "taille" in n));
      const taille = typeof n === "string" ? new TextEncoder().encode(n).byteLength : typeof n === "object" && "taille" in n ? n.taille : 0;
      return { isFile: () => fichier, isDirectory: () => Array.isArray(n), size: taille };
    },
    readFileSync: (chemin) => {
      appels.push(`read ${chemin}`);
      const n = noeud(chemin);
      if (typeof n === "string") return new TextEncoder().encode(n);
      if (typeof n === "object" && "texte" in n) return new TextEncoder().encode(n.texte);
      throw new Error(`EACCES ${chemin}`);
    },
    readdirSync: (chemin) => {
      appels.push(`readdir ${chemin}`);
      const n = noeud(chemin);
      if (!Array.isArray(n)) throw new Error(`ENOTDIR ${chemin}`);
      return n as readonly string[];
    },
  };
}

const verdict = (chemin: string, arbre: Readonly<Record<string, Noeud>>) => examinerOpensslConf(chemin, fauxFs(arbre)).verdict;

const SANS_NODE = "openssl_conf = defaut\n\n[defaut]\nssl_conf = ssl\n\n[ssl]\nsystem_default = sd\n\n[sd]\nMinProtocol = TLSv1\n";

describe("openssl-conf: listes fermées (0062 § 5.1)", () => {
  it("7 classes de racine et 7 verdicts, dans l'ordre de priorité", () => {
    expect([...ZONES_OPENSSL_CONF]).toEqual(["dev_null", "etc", "usr", "var_runtime", "var_lang", "opt", "autre"]);
    expect([...VERDICTS_OPENSSL_CONF]).toEqual([
      "hors_preview",
      "env_differente",
      "chemin_refuse",
      "fichier_refuse",
      "inclusion_refusee",
      "section_nodejs",
      "admis",
    ]);
  });
});

describe("openssl-conf: cas admis", () => {
  it("/dev/null : admis, sans aucun accès au système de fichiers", () => {
    const fs = fauxFs({});
    expect(examinerOpensslConf("/dev/null", fs)).toEqual({ zone: "dev_null", verdict: "admis" });
    expect(fs.appels).toEqual([]);
  });

  it.each([
    ["/etc/ssl/openssl.cnf", "etc"],
    ["/usr/lib/ssl/openssl.cnf", "usr"],
    ["/var/runtime/openssl.cnf", "var_runtime"],
    ["/var/lang/ssl/openssl.cnf", "var_lang"],
    ["/opt/ssl/openssl.cnf", "opt"],
  ] as const)("fichier sous %s sans nodejs_conf : admis (zone %s)", (chemin, zone) => {
    expect(examinerOpensslConf(chemin, fauxFs({ [chemin]: SANS_NODE }))).toEqual({ zone, verdict: "admis" });
  });

  it("fichier vide : admis ; lien dont le chemin réel est sous une racine : admis", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": "" })).toBe("admis");
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": { lien: "/usr/lib/ssl/a.cnf" }, "/usr/lib/ssl/a.cnf": SANS_NODE })).toBe("admis");
  });

  it("le fichier lu est celui du chemin réel", () => {
    const fs = fauxFs({ "/etc/a.cnf": { lien: "/usr/b.cnf" }, "/usr/b.cnf": SANS_NODE });
    examinerOpensslConf("/etc/a.cnf", fs);
    expect(fs.appels).toContain("read /usr/b.cnf");
    expect(fs.appels).not.toContain("read /etc/a.cnf");
  });
});

describe("openssl-conf: nodejs_conf refusé sous toutes ses formes (0062 § 4 point 1.5)", () => {
  it.each([
    ["nodejs_conf = x", "nodejs_conf = x\n"],
    ["NODEJS_CONF=x", "NODEJS_CONF=x\n"],
    ["en commentaire", "# nodejs_conf = x\n"],
    ["en commentaire de fin de ligne", "a = b # voir nodejs_conf\n"],
    ["coupé par une continuation", "node\\\njs_conf = x\n"],
    ["coupé par une continuation CRLF", "nodejs\\\r\n_conf = x\r\n"],
    ["avec un \\ interne", "node\\js_conf = x\n"],
    ["en section", "[ nodejs_conf ]\n"],
  ])("%s : section_nodejs", (_nom, texte) => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": texte })).toBe("section_nodejs");
  });

  it("une double barre en fin de ligne n'est pas une continuation (règle d'OpenSSL)", () => {
    expect(analyserTexteOpensslConf("nodejs\\\\\n_conf = x\n")).toEqual({ nodejs: false, inclusions: [] });
  });
});

describe("openssl-conf: inclusions (0062 § 4 point 1.6)", () => {
  it(".include d'un fichier qui contient nodejs_conf : section_nodejs", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/b.cnf\n", "/etc/b.cnf": "nodejs_conf = n\n" })).toBe("section_nodejs");
  });

  it("blancs avant .include, et .include=chemin : reconnus", () => {
    const arbre = { "/etc/b.cnf": "nodejs_conf = n\n" };
    expect(verdict("/etc/a.cnf", { ...arbre, "/etc/a.cnf": "  .include /etc/b.cnf\n" })).toBe("section_nodejs");
    expect(verdict("/etc/a.cnf", { ...arbre, "/etc/a.cnf": ".include=/etc/b.cnf\n" })).toBe("section_nodejs");
    expect(verdict("/etc/a.cnf", { ...arbre, "/etc/a.cnf": "\t.INCLUDE = /etc/b.cnf \n" })).toBe("section_nodejs");
    expect(analyserTexteOpensslConf("  .include /etc/b.cnf\n.include=/etc/c.cnf\n")).toEqual({ nodejs: false, inclusions: ["/etc/b.cnf", "/etc/c.cnf"] });
  });

  it("dossier inclus : seuls les noms en .cnf et .conf sont lus, casse ignorée", () => {
    const base = { "/etc/a.cnf": ".include /etc/ssl.d\n" };
    const fs = fauxFs({ ...base, "/etc/ssl.d": ["a.cnf", "b.conf", "c.txt", "d.cnf.bak"], "/etc/ssl.d/a.cnf": "", "/etc/ssl.d/b.conf": "" });
    expect(examinerOpensslConf("/etc/a.cnf", fs).verdict).toBe("admis");
    expect(fs.appels.filter((a) => a.startsWith("read "))).toEqual(["read /etc/a.cnf", "read /etc/ssl.d/a.cnf", "read /etc/ssl.d/b.conf"]);
    for (const nom of ["X.CNF", "y.Conf"]) {
      expect(verdict("/etc/a.cnf", { ...base, "/etc/ssl.d": [nom], [`/etc/ssl.d/${nom}`]: "nodejs_conf = n\n" })).toBe("section_nodejs");
    }
    expect(verdict("/etc/a.cnf", { ...base, "/etc/ssl.d": ["c.txt"], "/etc/ssl.d/c.txt": "nodejs_conf = n\n" })).toBe("admis");
  });

  it("# .include en ligne de commentaire entière : ignoré", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": "# .include /tmp/x\n   # .include relatif\n" })).toBe("admis");
  });

  it.each([
    ["en commentaire de fin de ligne", "a = b # .include /etc/b.cnf\n"],
    ["suivi d'un commentaire", ".include /etc/b.cnf # commentaire\n"],
    ["relatif", ".include ssl/b.cnf\n"],
    ["avec $", ".include $ENV::HOME/b.cnf\n"],
    ["avec \\", ".include /etc/b\\.cnf\n"],
    ["entre guillemets", '.include "/etc/b.cnf"\n'],
    ["sans chemin", ".include\n"],
    ["collé au chemin", ".include/etc/b.cnf\n"],
    ["deux sur une ligne", ".include /etc/b.cnf .include /etc/c.cnf\n"],
    ["sous /tmp", ".include /tmp/b.cnf\n"],
    ["sous /var/task", ".include /var/task/b.cnf\n"],
    ["avec ..", ".include /etc/../tmp/b.cnf\n"],
    ["avec //", ".include /etc//b.cnf\n"],
    ["dossier avec / final", ".include /etc/ssl.d/\n"],
    ["coupé par une continuation vers un chemin refusé", ".include /tmp\\\n/b.cnf\n"],
  ])(".include %s : inclusion_refusee", (_nom, texte) => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": texte, "/etc/b.cnf": "" })).toBe("inclusion_refusee");
  });

  it("profondeur 2 admise, profondeur 3 refusée", () => {
    const chaine = { "/etc/a.cnf": ".include /etc/b.cnf\n", "/etc/b.cnf": ".include /etc/c.cnf\n" };
    expect(verdict("/etc/a.cnf", { ...chaine, "/etc/c.cnf": "" })).toBe("admis");
    expect(verdict("/etc/a.cnf", { ...chaine, "/etc/c.cnf": ".include /etc/d.cnf\n", "/etc/d.cnf": "" })).toBe("inclusion_refusee");
  });

  it("16 fichiers examinés admis, 17 refusés", () => {
    const dossier = (n: number) => {
      const noms = Array.from({ length: n }, (_v, i) => `f${String(i).padStart(2, "0")}.cnf`);
      return Object.fromEntries([["/etc/d", noms], ...noms.map((nom) => [`/etc/d/${nom}`, ""])]) as Record<string, Noeud>;
    };
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/d\n", ...dossier(15) })).toBe("admis");
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/d\n", ...dossier(16) })).toBe("inclusion_refusee");
  });

  it("dossier de 64 entrées admis, de 65 refusé", () => {
    const noms = (n: number) => Array.from({ length: n }, (_v, i) => `e${i}.txt`);
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/d\n", "/etc/d": noms(64) })).toBe("admis");
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/d\n", "/etc/d": noms(65) })).toBe("inclusion_refusee");
  });

  it(".include /dev/null : admis sans lecture", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /dev/null\n" })).toBe("admis");
  });

  it(".pragma est sans effet sur les règles", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".pragma includedir:/etc\n.include b.cnf\n", "/etc/b.cnf": "" })).toBe("inclusion_refusee");
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".pragma dollarid:on\n" })).toBe("admis");
  });
});

describe("openssl-conf: fichier refusé (0062 § 4 point 1.4)", () => {
  it.each<[string, Record<string, Noeud>]>([
    ["absent", {}],
    ["illisible (erreur levée)", { "/etc/a.cnf": { illisible: true } }],
    ["dossier", { "/etc/a.cnf": [] }],
    ["plus de 64 Kio annoncés", { "/etc/a.cnf": { taille: OPENSSL_CONF_MAX_OCTETS + 1, texte: "" } }],
    ["plus de 64 Kio lus", { "/etc/a.cnf": { taille: 1, texte: "a".repeat(OPENSSL_CONF_MAX_OCTETS + 1) } }],
    ["lien dont le chemin réel est sous /tmp", { "/etc/a.cnf": { lien: "/tmp/a.cnf" }, "/tmp/a.cnf": "" }],
    ["lien vers /dev/null", { "/etc/a.cnf": { lien: "/dev/null" }, "/dev/null": "" }],
    ["octet nul", { "/etc/a.cnf": "node\0js_conf = x\n" }],
  ])("%s : fichier_refuse", (_nom, arbre) => {
    expect(verdict("/etc/a.cnf", arbre)).toBe("fichier_refuse");
  });

  it("64 Kio exactement : admis", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": "#".repeat(OPENSSL_CONF_MAX_OCTETS) })).toBe("admis");
  });

  it("inclusion absente, et entrée .cnf d'un dossier qui est elle-même un dossier : fichier_refuse", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/b.cnf\n" })).toBe("fichier_refuse");
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/d\n", "/etc/d": ["x.cnf"], "/etc/d/x.cnf": [] })).toBe("fichier_refuse");
  });
});

describe("openssl-conf: chemin déclaré refusé (0062 § 4 point 1.3), sans accès au système de fichiers", () => {
  it.each([
    ["relatif", "etc/ssl/openssl.cnf", "autre"],
    ["avec ..", "/etc/../tmp/openssl.cnf", "etc"],
    ["avec .", "/etc/./openssl.cnf", "etc"],
    ["avec //", "/etc//openssl.cnf", "etc"],
    ["/ final", "/etc/ssl/", "etc"],
    ["racine seule", "/etc/", "etc"],
    ["sous /tmp", "/tmp/openssl.cnf", "autre"],
    ["sous /var/task", "/var/task/openssl.cnf", "autre"],
    ["espace avant", " /etc/openssl.cnf", "autre"],
    ["espace après", "/etc/openssl.cnf ", "etc"],
    ["retour à la ligne", "/etc/openssl.cnf\n", "etc"],
    ["espace insécable", "/etc/open ssl.cnf", "etc"],
    ["$", "/etc/$HOME.cnf", "etc"],
    ["\\", "/etc/ssl\\openssl.cnf", "etc"],
    ["guillemet", '/etc/"openssl.cnf', "etc"],
    ["caractère de contrôle", "/etc/open\u0007ssl.cnf", "etc"],
    ["/dev/null voisin", "/dev/null2", "autre"],
  ])("%s : chemin_refuse", (_nom, chemin, zone) => {
    const fs = fauxFs({});
    expect(examinerOpensslConf(chemin, fs)).toEqual({ zone, verdict: "chemin_refuse" });
    expect(fs.appels).toEqual([]);
  });
});

describe("openssl-conf: ordre des verdicts et échec fermé", () => {
  it("fichier par fichier : le premier échec dans l'ordre de lecture l'emporte", () => {
    // Inclusion mal formée et nodejs_conf dans le même fichier : inclusion_refusee (1.6 avant 1.5).
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": "nodejs_conf = n\n.include relatif\n" })).toBe("inclusion_refusee");
    // nodejs_conf dans le premier fichier, inclusion absente ensuite : section_nodejs (le premier fichier l'emporte).
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": "nodejs_conf = n\n.include /etc/absent.cnf\n" })).toBe("section_nodejs");
    // Première inclusion absente, seconde avec nodejs_conf : fichier_refuse.
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/x.cnf\n.include /etc/b.cnf\n", "/etc/b.cnf": "nodejs_conf = n\n" })).toBe(
      "fichier_refuse",
    );
    // Chemin déclaré refusé : aucun fichier n'est examiné.
    expect(verdict("/tmp/a.cnf", { "/tmp/a.cnf": "nodejs_conf = n\n" })).toBe("chemin_refuse");
  });

  it("aucune erreur ne s'échappe, quelle que soit la méthode qui lève", () => {
    const leve = (): never => {
      throw new Error("SENTINELLE");
    };
    const base = fauxFs({ "/etc/a.cnf": ".include /etc/d\n", "/etc/d": ["x.cnf"], "/etc/d/x.cnf": "" });
    for (const methode of ["realpathSync", "lstatSync", "readFileSync", "readdirSync"] as const) {
      const fs = { ...base, [methode]: leve };
      expect(() => examinerOpensslConf("/etc/a.cnf", fs)).not.toThrow();
      expect(examinerOpensslConf("/etc/a.cnf", fs).verdict).toBe("fichier_refuse");
    }
    const lstatEtrange = { ...base, lstatSync: () => ({ isFile: leve, isDirectory: leve, size: 0 }) };
    expect(examinerOpensslConf("/etc/a.cnf", lstatEtrange).verdict).toBe("fichier_refuse");
  });

  it("le résultat ne contient jamais le chemin ni le contenu", () => {
    const resultat = examinerOpensslConf("/etc/SENTINELLE.cnf", fauxFs({ "/etc/SENTINELLE.cnf": "# SENTINELLE\nnodejs_conf = s\n" }));
    expect(JSON.stringify(resultat)).not.toContain("SENTINELLE");
  });
});
