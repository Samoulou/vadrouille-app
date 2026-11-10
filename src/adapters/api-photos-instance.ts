import type { PlacePhoto } from "@/contracts/photo";

/**
 * Photos du tri sur l'adaptateur `api` (ticket 879, M1e ; décision 0143, qui généralise 0128 ; même modèle que
 * `api-tri-instance.ts`).
 *
 * **Branchement au démarrage** : ce module n'importe rien de `src/server` (ni `src/server/photos/api.ts`, ni la barrière,
 * ni le limiteur, ni la base). Le régime de confinement l'exige : `@/adapters` est importé par les pages et par
 * `src/features`, qui ne doivent atteindre ni `src/server/env` ni un module à capacité, même par un `import()` (test
 * « p0: clé côté serveur seulement »). `src/instrumentation.ts` branche, quand `DATA_ADAPTER` vaut `api`, les photos de
 * `creerPhotosApi()`.
 *
 * Non branché (tests, `next build`, `mock`, `prototype`, autre runtime) : aucune photo, écran sans demande (échec
 * fermé). Un second branchement lève `PhotosApiDejaBrancheesError`.
 */

/** Photos de `api` telles que `src/server/photos/api.ts` les rend. */
export type PhotosApiBranchees = {
  /** Photo du lieu que rend `lieu` (lu barrière ouverte seulement), ou `null`. Ne lève jamais. */
  readonly photo: (lieu: () => Promise<string | null>) => Promise<PlacePhoto | null>;
  /** Vrai si l'écran peut demander une photo (barrière ouverte, client branché). */
  readonly ouvertes: () => Promise<boolean>;
};

// Sur `globalThis`, comme les autres branchements : Next.js charge une copie du module par route.
const PHOTOS_KEY = Symbol.for("vadrouille.photos-api");
const holder = globalThis as typeof globalThis & { [PHOTOS_KEY]?: PhotosApiBranchees };

/** Second branchement refusé ; ne porte aucune valeur. */
export class PhotosApiDejaBrancheesError extends Error {
  override name = "PhotosApiDejaBrancheesError";

  constructor() {
    super("Photos du tri de api déjà branchées.");
  }
}

/** Branche les photos de `api` (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherPhotosApi(photos: PhotosApiBranchees): void {
  if (holder[PHOTOS_KEY] !== undefined) throw new PhotosApiDejaBrancheesError();
  holder[PHOTOS_KEY] = photos;
}

/** Tests seulement : retire les photos branchées. */
export function debrancherPhotosApiPourTests(): void {
  delete holder[PHOTOS_KEY];
}

/** Photos branchées, ou `null` (aucune photo, aucun appel). */
export function photosApi(): PhotosApiBranchees | null {
  return holder[PHOTOS_KEY] ?? null;
}
