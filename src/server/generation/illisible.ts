import "server-only";

/**
 * Lecture illisible (version absente ou instantané invalide, clôture ou case du tri incohérente) : erreur au code fermé
 * `invalid_input`, sans autre texte. Module **feuille** (aucun import) : les lectures que la suite du déblocage et le webhook
 * atteignent (`lecture.ts`, `signaux.ts`, par `lot.ts`) n'importent pas `codes.ts`, qui charge `raison-echec.ts` et `src/ai`
 * (frontière de `tests/unit/p0/imports.test.ts`, 0077 § 3). Une étape la traite comme un `ArretEtape` (`estArret`,
 * `codeDeErreur` lit son `code`).
 */
export class LectureIllisible extends Error {
  readonly code = "invalid_input" as const;
  constructor() {
    super("invalid_input");
    this.name = "LectureIllisible";
  }
}
