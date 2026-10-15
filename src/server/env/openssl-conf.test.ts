// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  analyserTexteOpensslConf,
  CONTENU_OPENSSL_AUDITE_LAMBDA_NODEJS24,
  DIRECTIVES_OPENSSL_CONF,
  directivesOpensslConf,
  examinerOpensslConf,
  nomSectionOpensslAdmis,
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
  it("7 classes de racine et 9 verdicts, dans l'ordre de priorité (contenu_audite : 0065 § 4 point 2)", () => {
    expect([...ZONES_OPENSSL_CONF]).toEqual(["dev_null", "etc", "usr", "var_runtime", "var_lang", "opt", "autre"]);
    expect([...VERDICTS_OPENSSL_CONF]).toEqual([
      "hors_preview",
      "env_differente",
      "nom_section_refuse",
      "chemin_refuse",
      "fichier_refuse",
      "inclusion_refusee",
      "section_nodejs",
      "contenu_audite",
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
    // Mineur 2 de la revue du head `b0c1c45` : `/opt/` (couches Lambda) n'est plus une racine admise ; sa classe reste.
    ["sous /opt", "/opt/ssl/openssl.cnf", "opt"],
  ])("%s : chemin_refuse", (_nom, chemin, zone) => {
    const fs = fauxFs({});
    expect(examinerOpensslConf(chemin, fs)).toEqual({ zone, verdict: "chemin_refuse" });
    expect(fs.appels).toEqual([]);
  });
});

describe("openssl-conf: /opt/ hors des racines admises (mineur 2 de la revue du head b0c1c45)", () => {
  it("lien dont le chemin réel est sous /opt : fichier_refuse ; inclusion sous /opt : inclusion_refusee", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": { lien: "/opt/a.cnf" }, "/opt/a.cnf": SANS_NODE })).toBe("fichier_refuse");
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /opt/b.cnf\n", "/opt/b.cnf": SANS_NODE })).toBe("inclusion_refusee");
  });
});

/** Configuration de construction de Node, forme de `process.config` (condition 1.7 de 0062 § 4). */
const configNode = (defines: unknown) => ({ target_defaults: { defines } });
const NOM_NODE = "NODE_OPENSSL_CONF_NAME=nodejs_conf";

describe("openssl-conf: nom de section de la construction de Node (0062 § 4 point 1.7)", () => {
  it("defines avec exactement NODE_OPENSSL_CONF_NAME=nodejs_conf : admis", () => {
    expect(nomSectionOpensslAdmis(configNode([NOM_NODE]))).toBe(true);
    expect(nomSectionOpensslAdmis(configNode(["NODE_WANT_INTERNALS=1", NOM_NODE, "HAVE_OPENSSL=1"]))).toBe(true);
    expect(nomSectionOpensslAdmis({ variables: {}, target_defaults: { cflags: [], defines: [NOM_NODE] } })).toBe(true);
  });

  it.each<[string, unknown]>([
    ["process.config absent", undefined],
    ["process.config null", null],
    ["process.config chaîne", "{}"],
    ["target_defaults absent", { variables: {} }],
    ["target_defaults null", { target_defaults: null }],
    ["target_defaults chaîne", { target_defaults: "x" }],
    ["defines absent", { target_defaults: {} }],
    ["defines objet", configNode({ 0: NOM_NODE, length: 1 })],
    ["defines chaîne", configNode(NOM_NODE)],
    ["defines vide", configNode([])],
    ["aucune entrée NODE_OPENSSL_CONF_NAME", configNode(["HAVE_OPENSSL=1"])],
    ["autre nom de section", configNode(["NODE_OPENSSL_CONF_NAME=openssl_conf"])],
    ["nom vide", configNode(["NODE_OPENSSL_CONF_NAME="])],
    ["nom en majuscules", configNode(["NODE_OPENSSL_CONF_NAME=NODEJS_CONF"])],
    ["nom suivi d'un blanc", configNode([`${NOM_NODE} `])],
    ["deux entrées identiques", configNode([NOM_NODE, NOM_NODE])],
    ["deux entrées différentes", configNode([NOM_NODE, "NODE_OPENSSL_CONF_NAME=autre"])],
    ["entrée non textuelle", configNode([NOM_NODE, 1])],
  ])("%s : refus", (_nom, config) => {
    expect(nomSectionOpensslAdmis(config)).toBe(false);
  });

  it("un accesseur qui lève : refus, aucune erreur ne s'échappe", () => {
    const piege = {
      get target_defaults(): never {
        throw new Error("SENTINELLE");
      },
    };
    expect(nomSectionOpensslAdmis(piege)).toBe(false);
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

describe("openssl-conf: contenu audité du runtime Lambda nodejs24.x (0065 § 4 points 1 et 2)", () => {
  const RUNTIME = "/var/runtime/openssl_conf/openssl.cnf";
  const AUDITE = CONTENU_OPENSSL_AUDITE_LAMBDA_NODEJS24;

  // SHA-256 par Web Crypto (`crypto.subtle`) : `node:crypto` n'est pas admis par le régime de confinement dans
  // `src/server/env/`, et 0065 § 5 point 5 n'ajoute aucune ligne.
  it("la constante est le fichier audité : 505 octets, SHA-256 d95efaf0…2a88", async () => {
    const octets = new TextEncoder().encode(AUDITE);
    expect(octets.byteLength).toBe(505);
    const condensat = Buffer.from(await crypto.subtle.digest("SHA-256", octets)).toString("hex");
    expect(condensat).toBe("d95efaf0856ecfa40c7f1012b99848eb98f770c5c8850320d22492b06b0f2a88");
  });

  it("contenu audité sous /var/runtime/ : contenu_audite, sans directives", () => {
    expect(examinerOpensslConf(RUNTIME, fauxFs({ [RUNTIME]: AUDITE }))).toEqual({ zone: "var_runtime", verdict: "contenu_audite" });
  });

  it("contenu audité sous une autre racine admise, ou par un lien dont le chemin réel est sous une racine : contenu_audite", () => {
    expect(verdict("/etc/ssl/openssl.cnf", { "/etc/ssl/openssl.cnf": AUDITE })).toBe("contenu_audite");
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": { lien: RUNTIME }, [RUNTIME]: AUDITE })).toBe("contenu_audite");
  });

  it.each([
    ["fins de ligne \\r\\n", AUDITE.replaceAll("\n", "\r\n")],
    ["un espace ajouté", AUDITE.replace("nodejs_conf = ", "nodejs_conf  = ")],
    ["un espace final ajouté", `${AUDITE} `],
    ["sans le dernier \\n", AUDITE.slice(0, -1)],
    ["un octet changé", AUDITE.replace("ffdhe8192", "ffdhe8193")],
    ["un commentaire de plus", `${AUDITE}# commentaire\n`],
    ["une ligne MinProtocol = TLSv1 ajoutée", `${AUDITE}MinProtocol = TLSv1\n`],
    ["casse changée", AUDITE.replace("Groups", "groups")],
  ])("%s : section_nodejs", (_nom, texte) => {
    expect(verdict(RUNTIME, { [RUNTIME]: texte })).toBe("section_nodejs");
  });

  it("octet 0x80 (non UTF-8) à la place d'un caractère du commentaire, ou ajouté : section_nodejs", () => {
    const audite = new TextEncoder().encode(AUDITE);
    const remplace = Uint8Array.from(audite);
    remplace[2] = 0x80; // « # O… » : le « O » du commentaire de tête.
    const ajoute = Uint8Array.from([...audite, 0x80]);
    for (const octets of [remplace, ajoute]) {
      const fs = { ...fauxFs({ [RUNTIME]: AUDITE }), readFileSync: () => octets };
      expect(examinerOpensslConf(RUNTIME, fs).verdict).toBe("section_nodejs");
    }
  });

  it("contenu audité comme inclusion d'un autre fichier : section_nodejs (niveau 0 seulement)", () => {
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": `.include ${RUNTIME}\n`, [RUNTIME]: AUDITE })).toBe("section_nodejs");
    expect(verdict("/etc/a.cnf", { "/etc/a.cnf": ".include /etc/d\n", "/etc/d": ["x.cnf"], "/etc/d/x.cnf": AUDITE })).toBe("section_nodejs");
  });

  it("contenu audité au chemin réel sous /tmp (lien) : fichier_refuse", () => {
    expect(verdict(RUNTIME, { [RUNTIME]: { lien: "/tmp/openssl.cnf" }, "/tmp/openssl.cnf": AUDITE })).toBe("fichier_refuse");
  });

  it("contenu audité au chemin déclaré hors racines : chemin_refuse, sans lecture", () => {
    const fs = fauxFs({ "/tmp/openssl.cnf": AUDITE });
    expect(examinerOpensslConf("/tmp/openssl.cnf", fs).verdict).toBe("chemin_refuse");
    expect(fs.appels).toEqual([]);
  });

  it("contenu audité suivi d'un octet nul : fichier_refuse", () => {
    expect(verdict(RUNTIME, { [RUNTIME]: `${AUDITE}\0` })).toBe("fichier_refuse");
  });

  it("taille annoncée trop grande : fichier_refuse avant la comparaison", () => {
    expect(verdict(RUNTIME, { [RUNTIME]: { taille: OPENSSL_CONF_MAX_OCTETS + 1, texte: AUDITE } })).toBe("fichier_refuse");
  });
});

describe("openssl-conf: diagnostic des directives (0065 § 4 point 3)", () => {
  it("fichier audité : groups_admis,nodejs_conf,ssl_conf,system_default", () => {
    expect(directivesOpensslConf(CONTENU_OPENSSL_AUDITE_LAMBDA_NODEJS24)).toBe("groups_admis,nodejs_conf,ssl_conf,system_default");
  });

  it.each([
    ["groupe hors liste", "Groups = X25519:brainpoolP256r1\n", "groups_autres"],
    ["Curves admis", "Curves = X25519:X25519MLKEM768:SecP256r1MLKEM768:SecP384r1MLKEM1024\n", "groups_admis"],
    ["Curves hors liste", "curves = P-256\n", "groups_autres"],
    ["groupe vide", "Groups = X25519::X448\n", "groups_autres"],
    ["groupe préfixé", "Groups = ?X25519\n", "groups_autres"],
    ["casse différente", "Groups = x25519\n", "groups_autres"],
    ["groupe hors liste ffdhe1536", "Groups = ffdhe1536\n", "groups_autres"],
    ["variable", "Groups = $g\n", "groups_autres"],
    ["séparateur doublé", "Groups = X25519::secp256r1\n", "groups_autres"],
    ["VerifyCAFile", "VerifyCAFile = /tmp/ca.pem\n", "verifycafile"],
    ["CipherString", "CipherString = DEFAULT@SECLEVEL=0\n", "cipherstring"],
    ["providers", "providers = prov\n", "providers"],
    ["clé inconnue", "inconnue = x\n", "autre"],
    ["ligne sans =", "rien\n", "autre"],
    ["clé vide", "= x\n", "autre"],
    ["clé avec blancs et casse", " Min Protocol = TLSv1.3\n", "minprotocol"],
    [".include", ".include /etc/x.cnf\n", "include"],
    [".include=", ".include=/etc/x.cnf\n", "include"],
    [".pragma", ".pragma dollarid:true\n", "pragma"],
    ["section::clé", "s::nodejs_conf = x\n", "autre"],
  ])("%s : %s", (_nom, texte, attendu) => {
    expect(directivesOpensslConf(texte)).toBe(attendu);
  });

  it("jetons sans doublon, triés ; en-têtes, commentaires et lignes vides jamais rendus", () => {
    const texte = "# SENTINELLE\n[ SENTINELLE_SECTION ]\nssl_conf = a # SENTINELLE\n\nSSL_CONF = b\nVerifyMode = Peer\nnodejs_conf = x\n";
    expect(directivesOpensslConf(texte)).toBe("nodejs_conf,ssl_conf,verifymode");
  });

  it("lignes continuées jointes avant la lecture des clés", () => {
    expect(directivesOpensslConf("Cipher\\\nString = x\n")).toBe("cipherstring");
  });

  it("aucune valeur, aucun nom de section ni de groupe dans le résultat ; chaque jeton dans la liste fermée", () => {
    const texte = "[SENTINELLE]\nGroups = SENTINELLE:X25519\nSENTINELLE = SENTINELLE\nnodejs_conf = SENTINELLE\n.include /etc/SENTINELLE.cnf\n";
    const resultat = directivesOpensslConf(texte);
    expect(resultat).not.toMatch(/sentinelle/i);
    for (const jeton of resultat.split(",")) expect(DIRECTIVES_OPENSSL_CONF).toContain(jeton);
  });

  it("32 jetons, sans doublon", () => {
    expect(DIRECTIVES_OPENSSL_CONF).toHaveLength(32);
    expect(new Set(DIRECTIVES_OPENSSL_CONF).size).toBe(32);
  });

  it("examinerOpensslConf rend les directives avec section_nodejs seulement, sur le fichier en cause", () => {
    expect(examinerOpensslConf("/etc/a.cnf", fauxFs({ "/etc/a.cnf": "nodejs_conf = n\n[n]\nssl_conf = s\n" }))).toEqual({
      zone: "etc",
      verdict: "section_nodejs",
      directives: "nodejs_conf,ssl_conf",
    });
    // Fichier inclus qui donne section_nodejs : ses directives, pas celles du fichier qui l'inclut.
    const inclus = fauxFs({ "/etc/a.cnf": "x = y\n.include /etc/b.cnf\n", "/etc/b.cnf": "nodejs_conf = n\n" });
    expect(examinerOpensslConf("/etc/a.cnf", inclus)).toEqual({ zone: "etc", verdict: "section_nodejs", directives: "nodejs_conf" });
    expect(examinerOpensslConf("/etc/a.cnf", fauxFs({ "/etc/a.cnf": "a = b\n" }))).toEqual({ zone: "etc", verdict: "admis" });
    const refusee = fauxFs({ "/etc/a.cnf": "nodejs_conf = n\n.include relatif\n" });
    expect(examinerOpensslConf("/etc/a.cnf", refusee)).toEqual({ zone: "etc", verdict: "inclusion_refusee" });
  });

  it("aucune erreur ne s'échappe, quel que soit le texte ; sans directive, chaîne vide", () => {
    for (const texte of ["", "\0", "=", "[", "\\", "#", "nodejs_conf", "a=b=c", "ÿþ = x", "Groups ="]) {
      expect(() => directivesOpensslConf(texte)).not.toThrow();
    }
    expect(directivesOpensslConf("[nodejs_conf]\n")).toBe("");
  });
});
