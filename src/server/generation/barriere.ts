import "server-only";

import { BRANCHE_APPELS_REELS } from "@/server/config/generation";
import { lireEnvGeneration } from "@/server/env/generation";

/**
 * Barrière des appels réels (décision 0081 B9-TL-8 ; verdict de la Sécurité attendu), **vérifiée à l'entrée de chaque étape**
 * de `generatePreview`. Elle rend l'un de trois états :
 * - `production` : déploiement `production` (ou valeur inconnue : la plus restrictive) ; aucune composition, aucun client,
 *   l'étape s'arrête sur `production_refused` ;
 * - `reelle` : **toutes** les conditions tiennent : déploiement `preview` (jamais local, CI ni production), branche égale à la
 *   valeur de configuration posée par Samuel (`BRANCHE_APPELS_REELS`, `null` aujourd'hui), drapeau serveur d'activation,
 *   cookie d'accès valide (crochet fourni par l'appelant), plafonds non nuls ;
 * - `simulee` : tout le reste (local, CI, préversion sans l'une des conditions) : doubles, jamais un appel réel.
 *
 * Le cookie d'accès (D19 de 0055, 0074 § 5) n'est pas lisible dans une étape de workflow : l'appelant injecte un crochet
 * qui le vérifie par le module de P0 ; **fermé par défaut** (B9e branche le réel, avec la session de démonstration, question
 * 6 de Samuel). L'environnement est un paramètre (lu par `@/server/env/generation` par défaut), jamais une clé ni un secret.
 */

export type EtatBarriere = "production" | "reelle" | "simulee";

type Env = Readonly<Record<string, string | undefined>>;

export type OptionsBarriere = {
  readonly env?: Env;
  /** Branche autorisée ; `BRANCHE_APPELS_REELS` par défaut. */
  readonly branche?: string | null;
  /** Vérifie le cookie d'accès de la personne ; fermé par défaut. */
  readonly cookieValide?: () => Promise<boolean>;
  /** Vrai si les plafonds de génération sont posés et non nuls (B9-PO-10). */
  readonly plafondsNonNuls: boolean;
};

const normalise = (valeur: string | undefined): string | undefined => {
  const v = valeur?.trim().toLowerCase();
  return v === undefined || v === "" ? undefined : v;
};

const LOCAUX: ReadonlySet<string> = new Set(["local", "development", "ci", "test"]);

export async function evaluerBarriere(options: OptionsBarriere): Promise<EtatBarriere> {
  const env = options.env ?? lireEnvGeneration();
  const declarees = [normalise(env.VADROUILLE_ENV), normalise(env.VERCEL_ENV)].filter((v): v is string => v !== undefined);
  // Aucune déclaration, ou une valeur inconnue : la plus restrictive des deux déploiements ; jamais un appel réel.
  if (declarees.length === 0 || declarees.some((v) => v === "production" || !(LOCAUX.has(v) || v === "preview" || v === "staging"))) return "production";
  const preview = normalise(env.VERCEL_ENV) === "preview";
  const branche = options.branche === undefined ? BRANCHE_APPELS_REELS : options.branche;
  if (
    !preview ||
    branche === null ||
    env.VERCEL_GIT_COMMIT_REF !== branche ||
    env.GENERATION_APPELS_REELS !== "1" ||
    !options.plafondsNonNuls
  ) {
    return "simulee";
  }
  let cookie = false;
  try {
    cookie = (await options.cookieValide?.()) === true;
  } catch {
    cookie = false;
  }
  return cookie ? "reelle" : "simulee";
}
