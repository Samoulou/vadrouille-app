import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import { FixturesModelesSchema, type FixturesModeles } from "@/ai/modeles.simule";
import { ConfigClassementSchema, type ConfigClassement } from "@/domain/classement";
import { ConfigurationMoteurSchema, type ConfigurationMoteur } from "@/domain/configuration";
import { FixturesPlacesSchema, type FixturesPlaces } from "@/grounding/places.simule";
import { FixturesRoutesSchema, type FixturesRoutes } from "@/grounding/routes.simule";
import { BriefSchema, NOM_BRIEF_PATTERN, type Brief } from "@/prototype/brief";
import { validerConfiguration, type Configuration as ConfigurationPrototype } from "@/prototype/config";
import { FixturesPagesSchema, type FixturesPages } from "@/research/pages.simule";
import { FixturesRechercheSchema, type FixturesRecherche } from "@/research/recherche-web.simule";

/**
 * Lectures et écritures de fichiers du script (décision 0032, A3.1) : briefs, configuration et fixtures lus par
 * `node:fs` (jamais importés), puis validés ; programme et rapport écrits dans `prototype/sorties/` (ignoré par
 * git). Les chemins sont des URL calculées depuis ce fichier, jamais construites à partir d'une entrée.
 */

export class ErreurFichier extends Error {
  readonly code: "brief_name_invalid" | "brief_not_found" | "brief_invalid" | "config_invalid" | "fixtures_invalid";
  constructor(code: ErreurFichier["code"]) {
    super(code);
    this.code = code;
  }
}

/**
 * `moteur` : fichier des valeurs de la configuration du moteur (décision 0045 § 4.2), `src/server/config/moteur.json`
 * par défaut. Seule copie des valeurs : P0 le lit ici (`node:fs`), sans charger de module de `src/server`.
 */
export type Dossiers = { racine: URL; moteur?: URL };

export const FICHIER_MOTEUR = new URL("../../src/server/config/moteur.json", import.meta.url);

export const DOSSIERS_PAR_DEFAUT: Dossiers = { racine: new URL("../../prototype/", import.meta.url), moteur: FICHIER_MOTEUR };

/**
 * Configuration d'une exécution de P0 : les fichiers de `prototype/config/` (dont `classement.json`, validé par le
 * schéma de `src/domain`, décision 0045 § 1.4) et la configuration du moteur.
 */
export type Configuration = ConfigurationPrototype & { classement: ConfigClassement; moteur: ConfigurationMoteur };

const dossier = (dossiers: Dossiers, nom: string) => new URL(`${nom}/`, dossiers.racine);

function lireJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

/**
 * Brief par **nom** (`^[a-z0-9-]{1,32}$`) : le nom est validé avant toute construction de chemin, et le fichier
 * n'est ouvert que s'il figure dans la liste du dossier `prototype/briefs/`.
 */
export function lireBrief(nom: string, dossiers: Dossiers = DOSSIERS_PAR_DEFAUT): Brief {
  if (!NOM_BRIEF_PATTERN.test(nom)) throw new ErreurFichier("brief_name_invalid");
  const briefs = dossier(dossiers, "briefs");
  const fichier = `${nom}.json`;
  if (!readdirSync(briefs).includes(fichier)) throw new ErreurFichier("brief_not_found");
  const resultat = BriefSchema.safeParse(lireJson(new URL(fichier, briefs)));
  if (!resultat.success) throw new ErreurFichier("brief_invalid");
  return resultat.data;
}

/** Configuration du moteur : `moteur.json` validé par le schéma de `src/domain` (même schéma que le serveur). */
export function lireConfigurationMoteur(fichier: URL = FICHIER_MOTEUR): ConfigurationMoteur {
  return ConfigurationMoteurSchema.parse(lireJson(fichier));
}

export function lireConfiguration(dossiers: Dossiers = DOSSIERS_PAR_DEFAUT): Configuration {
  const config = dossier(dossiers, "config");
  try {
    return {
      ...validerConfiguration({
        modeles: lireJson(new URL("modeles.json", config)),
        recherche: lireJson(new URL("recherche.json", config)),
        plafonds: lireJson(new URL("plafonds.json", config)),
      }),
      classement: ConfigClassementSchema.parse(lireJson(new URL("classement.json", config))),
      moteur: lireConfigurationMoteur(dossiers.moteur ?? FICHIER_MOTEUR),
    };
  } catch {
    throw new ErreurFichier("config_invalid");
  }
}

export type Fixtures = {
  modeles: FixturesModeles;
  recherche: FixturesRecherche;
  pages: FixturesPages;
  places: FixturesPlaces;
  routes: FixturesRoutes;
};

/** Fixtures fabriquées à la main pour une destination (`prototype/fixtures/<sujet>/<slug>.json`). */
export function lireFixtures(slug: string, dossiers: Dossiers = DOSSIERS_PAR_DEFAUT): Fixtures {
  if (!/^[a-z0-9-]{1,24}$/.test(slug)) throw new ErreurFichier("fixtures_invalid");
  const lire = (sujet: string) => lireJson(new URL(`${sujet}/${slug}.json`, dossier(dossiers, "fixtures")));
  try {
    return {
      modeles: FixturesModelesSchema.parse(lire("modeles")),
      recherche: FixturesRechercheSchema.parse(lire("recherche")),
      pages: FixturesPagesSchema.parse(lire("pages")),
      places: FixturesPlacesSchema.parse(lire("places")),
      routes: FixturesRoutesSchema.parse(lire("routes")),
    };
  } catch {
    throw new ErreurFichier("fixtures_invalid");
  }
}

/** Prochain numéro libre pour un préfixe d'identifiant, d'après les fichiers de `prototype/sorties/`. */
export function prochainNumero(prefixe: string, dossiers: Dossiers = DOSSIERS_PAR_DEFAUT): number {
  const sorties = dossier(dossiers, "sorties");
  mkdirSync(sorties, { recursive: true });
  let max = 0;
  for (const nom of readdirSync(sorties)) {
    if (!nom.startsWith(prefixe)) continue;
    const numero = Number(/^_(\d{1,3})\./.exec(nom.slice(prefixe.length))?.[1]);
    if (Number.isInteger(numero) && numero > max) max = numero;
  }
  return max + 1;
}

/** Écrit un fichier de sortie (texte déjà filtré par la redaction) dans `prototype/sorties/`. */
export function ecrireSortie(nom: string, contenu: string, dossiers: Dossiers = DOSSIERS_PAR_DEFAUT): void {
  if (!/^[A-Za-z0-9_-]{1,64}(\.rapport)?\.json$/.test(nom)) throw new Error("nom de sortie invalide");
  const sorties = dossier(dossiers, "sorties");
  mkdirSync(sorties, { recursive: true });
  writeFileSync(new URL(nom, sorties), contenu, "utf8");
}
