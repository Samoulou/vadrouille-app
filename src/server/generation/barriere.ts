import "server-only";

import { BRANCHE_APPELS_REELS, ECRITURE_POSITIONS_AUTORISEE } from "@/server/config/generation";
import type { PlafondsUsage } from "@/server/config/usage";
import { ecriturePositionsSuspendue, lireEnvGeneration } from "@/server/env/generation";

/**
 * Barrière des appels réels (décision 0081 B9-TL-8 ; verdict de la Sécurité attendu), **vérifiée à l'entrée de chaque étape**
 * de `generatePreview`. Elle rend l'un de trois états :
 * - `production` : déploiement `production` (ou valeur inconnue : la plus restrictive) ; aucune composition, aucun client,
 *   l'étape s'arrête sur `production_refused` ;
 * - `reelle` : **toutes** les conditions tiennent : déploiement `preview` (`VERCEL_ENV` vaut `preview` **et** `VADROUILLE_ENV`
 *   est absent ou vaut `preview` : jamais local, CI ni production, même quand Vercel déclare une préversion), branche égale à
 *   la valeur de configuration posée par Samuel (`BRANCHE_APPELS_REELS`, `null` aujourd'hui), drapeau serveur d'activation,
 *   cookie d'accès valide (crochet fourni par l'appelant), plafonds posés et non nuls (`plafondsNonNuls`, calculé par
 *   `plafondsDeGenerationPoses`) ;
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
  /** Vrai si les plafonds de génération sont posés et **non nuls** (B9-PO-10) : voir `plafondsDeGenerationPoses`. */
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
  // Préversion seulement si Vercel la déclare **et** que la déclaration du dépôt ne la contredit pas (B9-TL-8 point 1 :
  // « jamais local ni CI ») : `VADROUILLE_ENV=ci` ou `local` sur une préversion reste simulé.
  const vadrouille = normalise(env.VADROUILLE_ENV);
  const preview = normalise(env.VERCEL_ENV) === "preview" && (vadrouille === undefined || vadrouille === "preview");
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

/**
 * Plafonds de l'aperçu **posés et non nuls** (B9-PO-10) : configuration présente, plafond par organisation et par jour
 * positif, et chaque plafond du profil `apercu` (coût des modèles, Text Search, fiches, requêtes et éléments Routes) positif.
 * Un plafond à 0 ne vaut pas un plafond posé : la barrière reste simulée.
 */
export function plafondsDeGenerationPoses(plafonds: PlafondsUsage | null): boolean {
  if (plafonds === null) return false;
  const { apercu } = plafonds.generations;
  return (
    plafonds.parOrganisationJourMicros > 0 &&
    apercu.coutModelesMicros > 0 &&
    apercu.placesTextSearch > 0 &&
    apercu.placesDetails > 0 &&
    apercu.routesRequetes > 0 &&
    apercu.routesElements > 0
  );
}

/**
 * Vrai si la génération peut écrire les positions de la version publiée au cache (0081 B9-TL-9) : écriture autorisée par
 * la configuration (`ECRITURE_POSITIONS_AUTORISEE`, condition (a) de 0060 § 3.4) **et** interrupteur
 * `POSITIONS_ECRITURE_SUSPENDUE` différent de `1`. Lue ici, avec la barrière, parce que ce module est le seul à lire
 * l'environnement de la génération (lint `ligne/server-env-imports`).
 */
export function ecriturePositionsPermise(options: { readonly env?: Env; readonly autorisee?: boolean } = {}): boolean {
  if (!(options.autorisee ?? ECRITURE_POSITIONS_AUTORISEE)) return false;
  return !ecriturePositionsSuspendue(options.env);
}
