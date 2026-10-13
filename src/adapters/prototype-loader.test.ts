// @vitest-environment node
import { execFileSync } from "node:child_process";
import { constants as fsConstants, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PROGRAMME_MAX_OCTETS,
  createProgrammeLoader,
  systemeFichiersNode,
  type DescripteurFichier,
  type SystemeFichiers,
} from "./prototype-loader";

/**
 * `adaptateurs: chargeur de programmes, index en mémoire` (spécification P0, « Chargeur de programmes »).
 * Dossiers de test créés sous le `realpath` de `os.tmpdir()` (l'égalité stricte du `realpath` refuse un lien).
 */

const TRIP_ID = "proto_test_20261012_1";
const PROGRAMME = readFileSync(join(process.cwd(), "prototype", "programmes-test", `${TRIP_ID}.json`), "utf8");

/** Programme valide pour un autre identifiant. */
function programmePour(id: string): string {
  const programme = JSON.parse(PROGRAMME) as { trip: { id: string } };
  programme.trip.id = id;
  return JSON.stringify(programme);
}

let dossier: string;

beforeEach(() => {
  dossier = mkdtempSync(join(realpathSync(tmpdir()), "vadrouille-p0b1-"));
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

/** Système de fichiers réel qui compte chaque accès. */
function compteur(base: SystemeFichiers = systemeFichiersNode) {
  const acces: string[] = [];
  const fs: SystemeFichiers = {
    realpath: (chemin) => (acces.push(`realpath ${chemin}`), base.realpath(chemin)),
    readdir: (chemin) => (acces.push(`readdir ${chemin}`), base.readdir(chemin)),
    lstat: (chemin) => (acces.push(`lstat ${chemin}`), base.lstat(chemin)),
    open: (chemin, drapeaux) => (acces.push(`open ${chemin}`), base.open(chemin, drapeaux)),
    constants: base.constants,
  };
  return { fs, acces };
}

describe("adaptateurs: chargeur de programmes, index en mémoire", () => {
  it("indexe le programme conforme et ignore un fichier non conforme", async () => {
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    writeFileSync(join(dossier, "proto_invalide_1.json"), JSON.stringify({ schema: 1 }));
    writeFileSync(join(dossier, "pas-json.txt"), PROGRAMME);
    writeFileSync(join(dossier, "nom invalide.json"), programmePour("nom invalide"));
    const loader = createProgrammeLoader({ dossier });
    expect(await loader.ids()).toEqual([TRIP_ID]);
    expect((await loader.lire(TRIP_ID))?.trip.id).toBe(TRIP_ID);
    expect(await loader.lire("proto_invalide_1")).toBeNull();
  });

  it("ignore un fichier dont trip.id diffère du nom", async () => {
    writeFileSync(join(dossier, "proto_autre_1.json"), PROGRAMME);
    const loader = createProgrammeLoader({ dossier });
    expect(await loader.ids()).toEqual([]);
    expect(await loader.lire("proto_autre_1")).toBeNull();
    expect(await loader.lire(TRIP_ID)).toBeNull();
  });

  it.each(["../x", "..%2F", "%2e%2e", "/etc/passwd", "a".repeat(65), "", "proto test", "x/../y"])(
    "identifiant %j : null, aucun accès au système de fichiers",
    async (id) => {
      writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
      const { fs, acces } = compteur();
      const loader = createProgrammeLoader({ dossier, fs });
      expect(await loader.lire(id)).toBeNull();
      expect(acces).toEqual([]);
    },
  );

  it("identifiant conforme mais absent de l'index : null, aucune ouverture de fichier", async () => {
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    const { fs, acces } = compteur();
    const loader = createProgrammeLoader({ dossier, fs });
    await loader.ids();
    acces.length = 0;
    expect(await loader.lire("proto_inconnu_1")).toBeNull();
    expect(acces).toEqual([]);
  });

  it("ignore un lien symbolique de fichier, un fichier à liens multiples et un fichier de plus de 2 Mo", async () => {
    writeFileSync(join(dossier, "source.txt"), programmePour("proto_lien_1"));
    symlinkSync(join(dossier, "source.txt"), join(dossier, "proto_lien_1.json"));
    writeFileSync(join(dossier, "proto_double_1.json"), programmePour("proto_double_1"));
    linkSync(join(dossier, "proto_double_1.json"), join(dossier, "copie.txt"));
    writeFileSync(join(dossier, "proto_geant_1.json"), " ".repeat(PROGRAMME_MAX_OCTETS + 1));
    const loader = createProgrammeLoader({ dossier });
    expect(await loader.ids()).toEqual([]);
  });

  it("ignore un tube nommé", async () => {
    try {
      execFileSync("mkfifo", [join(dossier, "proto_tube_1.json")]);
    } catch {
      return; // mkfifo indisponible : cas couvert par le système de fichiers simulé ci-dessous.
    }
    const loader = createProgrammeLoader({ dossier });
    expect(await loader.ids()).toEqual([]);
  });

  it("contrôles refaits à chaque lecture : fichier indexé puis remplacé par un lien ou un tube, ignoré", async () => {
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    const loader = createProgrammeLoader({ dossier });
    expect(await loader.ids()).toEqual([TRIP_ID]);
    rmSync(join(dossier, `${TRIP_ID}.json`));
    writeFileSync(join(dossier, "ailleurs.txt"), PROGRAMME);
    symlinkSync(join(dossier, "ailleurs.txt"), join(dossier, `${TRIP_ID}.json`));
    expect(await loader.lire(TRIP_ID)).toBeNull();
    rmSync(join(dossier, `${TRIP_ID}.json`));
    let tube = true;
    try {
      execFileSync("mkfifo", [join(dossier, `${TRIP_ID}.json`)]);
    } catch {
      tube = false;
    }
    if (tube) expect(await loader.lire(TRIP_ID)).toBeNull();
  });

  it("fichier remplacé par un lien entre lstat et ouverture : refus (O_NOFOLLOW)", async () => {
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    writeFileSync(join(dossier, "ailleurs.txt"), PROGRAMME);
    let remplacer = false;
    const fs: SystemeFichiers = {
      ...systemeFichiersNode,
      lstat: async (chemin) => {
        const stats = await systemeFichiersNode.lstat(chemin);
        if (remplacer) {
          rmSync(chemin);
          symlinkSync(join(dossier, "ailleurs.txt"), chemin);
        }
        return stats;
      },
    };
    const loader = createProgrammeLoader({ dossier, fs });
    expect(await loader.ids()).toEqual([TRIP_ID]);
    remplacer = true;
    expect(await loader.lire(TRIP_ID)).toBeNull();
  });

  it("ouverture avec O_RDONLY | O_NOFOLLOW | O_NONBLOCK", async () => {
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    const drapeaux: number[] = [];
    const fs: SystemeFichiers = {
      ...systemeFichiersNode,
      open: (chemin, valeur) => (drapeaux.push(valeur), systemeFichiersNode.open(chemin, valeur)),
    };
    await createProgrammeLoader({ dossier, fs }).ids();
    expect(drapeaux).toEqual([fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK]);
  });

  it("fstat refuse un descripteur qui n'est pas un fichier ordinaire, ou à liens multiples", async () => {
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    for (const stats of [
      { isFile: () => false, nlink: 1, size: 10 },
      { isFile: () => true, nlink: 2, size: 10 },
      { isFile: () => true, nlink: 1, size: PROGRAMME_MAX_OCTETS + 1 },
    ]) {
      const fs: SystemeFichiers = {
        ...systemeFichiersNode,
        open: async (chemin, valeur) => {
          const reel = await systemeFichiersNode.open(chemin, valeur);
          return { ...reel, stat: async () => stats, read: reel.read.bind(reel), close: reel.close.bind(reel) };
        },
      };
      expect(await createProgrammeLoader({ dossier, fs }).ids()).toEqual([]);
    }
  });

  it("borne par octets lus : fstat annonce moins de 2 Mo mais la lecture dépasse 2 Mo, refus", async () => {
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    let fermetures = 0;
    const fs: SystemeFichiers = {
      ...systemeFichiersNode,
      open: async (): Promise<DescripteurFichier> => ({
        stat: async () => ({ isFile: () => true, nlink: 1, size: 100 }),
        // Rend toujours des octets : la lecture ne s'arrête que sur la borne.
        read: async (_tampon, _offset, length) => ({ bytesRead: Math.min(length, 64 * 1024) }),
        close: async () => {
          fermetures += 1;
        },
      }),
    };
    expect(await createProgrammeLoader({ dossier, fs }).ids()).toEqual([]);
    expect(fermetures).toBe(1);
  });

  it("dossier injecté qui est un lien symbolique : refus au démarrage", async () => {
    const vrai = join(dossier, "vrai");
    mkdirSync(vrai);
    writeFileSync(join(vrai, `${TRIP_ID}.json`), PROGRAMME);
    symlinkSync(vrai, join(dossier, "lien"));
    const loader = createProgrammeLoader({ dossier: join(dossier, "lien") });
    await expect(loader.ids()).rejects.toThrow(/chemin canonique/);
    await expect(loader.lire(TRIP_ID)).rejects.toThrow(/chemin canonique/);
  });

  it("chemin relatif : refus à la création", () => {
    expect(() => createProgrammeLoader({ dossier: "prototype/programmes-test" })).toThrow(/chemin absolu/);
  });

  it("plateforme sans O_NOFOLLOW : refus à la création", () => {
    const fs: SystemeFichiers = { ...systemeFichiersNode, constants: { O_RDONLY: 0 } };
    expect(() => createProgrammeLoader({ dossier, fs })).toThrow(/O_NOFOLLOW/);
  });

  it("dossier absent ou vide : index vide, sans erreur", async () => {
    expect(await createProgrammeLoader({ dossier: join(dossier, "absent") }).ids()).toEqual([]);
    expect(await createProgrammeLoader({ dossier }).ids()).toEqual([]);
  });

  it("barre finale tolérée (path.resolve), dossier canonique accepté", async () => {
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    expect(await createProgrammeLoader({ dossier: `${dossier}/` }).ids()).toEqual([TRIP_ID]);
  });

  it("index construit une fois : un fichier ajouté après le premier appel n'est pas servi", async () => {
    const loader = createProgrammeLoader({ dossier });
    expect(await loader.ids()).toEqual([]);
    writeFileSync(join(dossier, `${TRIP_ID}.json`), PROGRAMME);
    expect(await loader.lire(TRIP_ID)).toBeNull();
  });
});
