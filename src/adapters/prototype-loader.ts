import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { TRIP_ID_PATTERN } from "@/contracts/values";
import { ProgrammeReduitSchema, type ProgrammeReduit } from "@/prototype/programme-reduit";

import type { SourceProgrammes } from "./prototype";

/**
 * Chargeur des programmes du prototype (spécification P0, « Chargeur de programmes » ; décision 0032 § A4.1 et
 * § A4.3). Il lit **à l'exécution** un dossier donné par l'opérateur (`VADROUILLE_PROTOTYPE_DIR`), jamais par une
 * requête, et construit au premier appel un **index en mémoire** `identifiant → fichier`. Un `tripId` reçu d'une
 * adresse est validé par `TRIP_ID_PATTERN` avant tout accès, puis cherché dans l'index seulement : aucun chemin
 * n'est jamais construit à partir d'une entrée.
 *
 * Fichiers retenus : ordinaires (`lstat`, puis ouverture `O_NOFOLLOW | O_NONBLOCK`, puis `fstat` sur le
 * descripteur : fichier ordinaire, un seul lien, 2 Mo au plus), nommés `<identifiant>.json` avec un identifiant
 * conforme à `TRIP_ID_PATTERN`, conformes au schéma strict de la forme réduite et dont `trip.id` est égal à
 * l'identifiant du nom. Ces contrôles sont **refaits à chaque lecture**, bornée par les octets réellement lus.
 *
 * Le dossier : chemin absolu et canonique (`realpath` égal à `path.resolve(dossier)`), vérifié au premier appel
 * seulement ; un dossier absent donne un index vide, sans erreur ; un lien symbolique est refusé. Plateforme sans
 * `O_NOFOLLOW` (Windows) : refus à la création. L'index ne contient ni durée ni position : ce n'est pas un cache
 * de données Google (décision 0032 § A6.5).
 */

/** Taille maximale d'un programme, en octets lus. */
export const PROGRAMME_MAX_OCTETS = 2 * 1024 * 1024;

/** Statistiques utiles d'un fichier (sous-ensemble de `fs.Stats`). */
export interface StatsFichier {
  isFile(): boolean;
  nlink: number;
  size: number;
}

/** Descripteur ouvert (sous-ensemble de `fs.promises.FileHandle`). */
export interface DescripteurFichier {
  stat(): Promise<StatsFichier>;
  read(buffer: Uint8Array, offset: number, length: number, position: number | null): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
}

/** Système de fichiers du chargeur, injectable pour les tests (sous-ensemble de `node:fs/promises`). */
export interface SystemeFichiers {
  realpath(chemin: string): Promise<string>;
  readdir(chemin: string): Promise<string[]>;
  lstat(chemin: string): Promise<{ isFile(): boolean }>;
  open(chemin: string, drapeaux: number): Promise<DescripteurFichier>;
  constants: { O_RDONLY: number; O_NOFOLLOW?: number; O_NONBLOCK?: number };
}

export const systemeFichiersNode: SystemeFichiers = {
  realpath: (chemin) => realpath(chemin),
  readdir: (chemin) => readdir(chemin),
  lstat: (chemin) => lstat(chemin),
  open: (chemin, drapeaux) => open(chemin, drapeaux),
  constants: fsConstants,
};

export interface ProgrammeLoaderOptions {
  /** Chemin absolu et canonique du dossier des programmes. */
  dossier: string;
  fs?: SystemeFichiers;
}

function codeErreur(erreur: unknown): string | undefined {
  return typeof erreur === "object" && erreur !== null && "code" in erreur && typeof erreur.code === "string"
    ? erreur.code
    : undefined;
}

export function createProgrammeLoader({ dossier, fs = systemeFichiersNode }: ProgrammeLoaderOptions): SourceProgrammes {
  if (typeof dossier !== "string" || !isAbsolute(dossier)) {
    throw new Error("dossier des programmes du prototype : chemin absolu attendu (VADROUILLE_PROTOTYPE_DIR)");
  }
  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;
  if (O_NOFOLLOW === undefined || O_NONBLOCK === undefined) {
    throw new Error("chargeur des programmes du prototype : O_NOFOLLOW indisponible sur cette plateforme");
  }
  const drapeaux = O_RDONLY | O_NOFOLLOW | O_NONBLOCK;
  const attendu = resolve(dossier);

  /** Lit et valide un fichier ; `null` au moindre écart (aucun détail : ni chemin, ni contenu). */
  const lireFichier = async (chemin: string, id: string): Promise<ProgrammeReduit | null> => {
    try {
      if (!(await fs.lstat(chemin)).isFile()) return null;
    } catch {
      return null;
    }
    let descripteur: DescripteurFichier;
    try {
      descripteur = await fs.open(chemin, drapeaux);
    } catch {
      // ELOOP : le fichier est devenu un lien entre `lstat` et l'ouverture.
      return null;
    }
    try {
      const stats = await descripteur.stat();
      if (!stats.isFile() || stats.nlink !== 1 || stats.size > PROGRAMME_MAX_OCTETS) return null;
      // Lecture bornée par les octets réellement lus, pas par la taille annoncée.
      const tampon = new Uint8Array(PROGRAMME_MAX_OCTETS + 1);
      let lus = 0;
      while (lus < tampon.length) {
        const { bytesRead } = await descripteur.read(tampon, lus, tampon.length - lus, null);
        if (bytesRead === 0) break;
        lus += bytesRead;
      }
      if (lus > PROGRAMME_MAX_OCTETS) return null;
      const texte = new TextDecoder("utf-8", { fatal: true }).decode(tampon.subarray(0, lus));
      const resultat = ProgrammeReduitSchema.safeParse(JSON.parse(texte));
      if (!resultat.success || resultat.data.trip.id !== id) return null;
      return resultat.data;
    } catch {
      return null;
    } finally {
      await descripteur.close().catch(() => {});
    }
  };

  const construireIndex = async (): Promise<Map<string, string>> => {
    let reel: string;
    try {
      reel = await fs.realpath(dossier);
    } catch (erreur) {
      // Dossier absent : section « Prototype » absente, sans erreur.
      if (codeErreur(erreur) === "ENOENT") return new Map();
      throw new Error("dossier des programmes du prototype illisible");
    }
    if (reel !== attendu) {
      throw new Error("dossier des programmes du prototype refusé : chemin canonique attendu, sans lien symbolique");
    }
    const index = new Map<string, string>();
    for (const nom of (await fs.readdir(reel)).sort()) {
      if (!nom.endsWith(".json")) continue;
      const id = nom.slice(0, -".json".length);
      if (!TRIP_ID_PATTERN.test(id)) continue;
      const chemin = join(reel, nom);
      if (await lireFichier(chemin, id)) index.set(id, chemin);
    }
    return index;
  };

  let index: Promise<Map<string, string>> | null = null;
  const indexer = () => (index ??= construireIndex());

  return {
    async ids() {
      return [...(await indexer()).keys()];
    },
    async lire(tripId) {
      // Motif vérifié avant tout accès au système de fichiers.
      if (typeof tripId !== "string" || !TRIP_ID_PATTERN.test(tripId)) return null;
      const chemin = (await indexer()).get(tripId);
      return chemin === undefined ? null : lireFichier(chemin, tripId);
    },
  };
}
