import path from "node:path";

import ts from "typescript";

import { RACINE } from "./fichiers";

/**
 * Programme TypeScript du régime (décision 0038, P0c-TL-5) : `tsconfig.json` seul, options inchangées sauf
 * `noEmit: true` et `incremental: false`, extension `next` ignorée. Racines : les fichiers de l'`include` qui sont
 * suivis par Git. Construit une seule fois, par `depot.test.ts` (point 3).
 */

export type ProgrammeDepot = {
  readonly programme: ts.Program;
  readonly verificateur: ts.TypeChecker;
  /** Chemins relatifs (séparateur `/`) des racines suivies. */
  readonly racines: ReadonlySet<string>;
};

const versRelatif = (absolu: string) => path.relative(RACINE, absolu).split(path.sep).join("/");

export function construireProgramme(suivis: ReadonlySet<string>): ProgrammeDepot {
  const fichierConfig = path.join(RACINE, "tsconfig.json");
  const lu = ts.readConfigFile(fichierConfig, (chemin) => ts.sys.readFile(chemin));
  if (lu.error) throw new Error(`confinement: tsconfig.json illisible : ${ts.flattenDiagnosticMessageText(lu.error.messageText, "\n")}`);
  const analyse = ts.parseJsonConfigFileContent(lu.config, ts.sys, RACINE, undefined, fichierConfig);
  if (analyse.errors.length > 0) {
    throw new Error(`confinement: tsconfig.json : ${analyse.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join(" ; ")}`);
  }
  const options: ts.CompilerOptions = { ...analyse.options, noEmit: true, incremental: false, plugins: [] };
  const racines = analyse.fileNames.filter((absolu) => suivis.has(versRelatif(absolu)));
  const programme = ts.createProgram({ rootNames: racines, options });
  return { programme, verificateur: programme.getTypeChecker(), racines: new Set(racines.map(versRelatif)) };
}

/** Options du programme de cas (décision 0038, P0c-TL-5 point 4) : mêmes options que le programme du dépôt. */
export function optionsDuDepot(): ts.CompilerOptions {
  const fichierConfig = path.join(RACINE, "tsconfig.json");
  const lu = ts.readConfigFile(fichierConfig, (chemin) => ts.sys.readFile(chemin));
  const analyse = ts.parseJsonConfigFileContent(lu.config, ts.sys, RACINE, undefined, fichierConfig);
  return { ...analyse.options, noEmit: true, incremental: false, plugins: [] };
}

/**
 * Programme de cas : chaque source est un fichier virtuel distinct (hôte de compilation en mémoire), sous un nom
 * neutre ; le chemin simulé n'est passé qu'à l'analyseur.
 */
export function programmeDeCas(sources: readonly { readonly nom: string; readonly source: string }[]): {
  verificateur: ts.TypeChecker;
  fichier: (nom: string) => ts.SourceFile;
} {
  const options = optionsDuDepot();
  // `export {}` : chaque cas est un module, sans portée globale partagée avec les autres cas.
  const virtuels = new Map(sources.map(({ nom, source }) => [path.join(RACINE, ".cas-confinement", nom), `${source}\nexport {};\n`]));
  const hote = ts.createCompilerHost(options);
  const lireOriginal = hote.readFile.bind(hote);
  const existeOriginal = hote.fileExists.bind(hote);
  const sourceOriginale = hote.getSourceFile.bind(hote);
  hote.readFile = (chemin) => virtuels.get(chemin) ?? lireOriginal(chemin);
  hote.fileExists = (chemin) => virtuels.has(chemin) || existeOriginal(chemin);
  hote.getSourceFile = (chemin, langage, ...reste) => {
    const virtuel = virtuels.get(chemin);
    if (virtuel !== undefined) return ts.createSourceFile(chemin, virtuel, langage, true);
    return sourceOriginale(chemin, langage, ...reste);
  };
  const programme = ts.createProgram({ rootNames: [...virtuels.keys()], options, host: hote });
  return {
    verificateur: programme.getTypeChecker(),
    fichier: (nom) => {
      const fichier = programme.getSourceFile(path.join(RACINE, ".cas-confinement", nom));
      if (!fichier) throw new Error(`confinement: cas virtuel absent : ${nom}`);
      return fichier;
    },
  };
}
