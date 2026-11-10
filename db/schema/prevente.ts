import "server-only";

import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, check, date, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import {
  PREVENTE_DECOUVERTES,
  PREVENTE_DESTINATION_MAX,
  PREVENTE_MOTIFS,
  PREVENTE_PARCOURS,
  PREVENTE_PERIODES,
  PREVENTE_PLAFOND_REPONSES_JOUR,
  PREVENTE_PREPARATIONS,
  PREVENTE_PROVENANCES,
} from "../prevente-codes.ts";

/**
 * Mesure de la prévente (spécification `specs/C2-prevente-mesure.md`, § 4 ; tâche C2a, ticket 1117) : visites par jour
 * et par provenance, compteur du jour des réponses, réponses au questionnaire.
 *
 * **Exception à `organization_id`** (à confirmer par le Tech Lead, T1) : ces trois tables n'appartiennent à aucune
 * organisation (visiteurs anonymes, avant tout compte), comme le compteur global `email_daily_counts` (0020).
 * Aucune colonne ne peut recevoir une adresse IP, un agent utilisateur, une heure ni un identifiant de paiement ou de
 * session (critère B5). RLS, politiques, droits, fonctions `SECURITY DEFINER` et domaine `prevente_code` :
 * `db/migrations/0029_prevente_mesure.sql`. Aucun rôle applicatif n'a de droit direct sur ces tables.
 */

const liste = (valeurs: readonly string[]): SQL => sql.raw(valeurs.map((valeur) => `'${valeur}'`).join(", "));
const dansListe = (colonne: AnyPgColumn, valeurs: readonly string[]): SQL => sql`${colonne} IN (${liste(valeurs)})`;
const tableauDansListe = (colonne: AnyPgColumn, valeurs: readonly string[]): SQL => sql`${colonne} <@ ARRAY[${liste(valeurs)}]::text[]`;

/**
 * Un nombre par jour (UTC, posé par la base) et par provenance : jamais une ligne par visite (C2-PO-5). Écrite par la
 * seule fonction `public.prevente_compter_visite(text)` ; `interne` est refusé par la liste fermée.
 */
export const preventeVisites = pgTable(
  "prevente_visites",
  {
    jour: date("jour").notNull(),
    src: text("src").notNull(),
    visites: integer("visites").notNull(),
  },
  (t) => [
    primaryKey({ name: "prevente_visites_pkey", columns: [t.jour, t.src] }),
    check("prevente_visites_src_check", dansListe(t.src, PREVENTE_PROVENANCES)),
    check("prevente_visites_visites_check", sql`${t.visites} >= 1`),
  ],
);

/**
 * Compteur du jour (UTC) des réponses stockées : il ne sert qu'au plafond global du § 3.4 point 3, tenu dans la base
 * par `public.prevente_enregistrer_reponse(…)`. Aucune autre donnée.
 */
export const preventeReponsesJour = pgTable(
  "prevente_reponses_jour",
  {
    jour: date("jour").primaryKey(),
    reponses: integer("reponses").notNull(),
  },
  (t) => [check("prevente_reponses_jour_reponses_check", sql`${t.reponses} BETWEEN 1 AND ${sql.raw(String(PREVENTE_PLAFOND_REPONSES_JOUR))}`)],
);

/**
 * Une réponse au questionnaire : identifiant aléatoire, jour (UTC, sans l'heure : C2-PO-12), provenance, parcours et
 * réponses par code stable. `destination` est le seul texte saisi par une personne : jamais rendu par une fonction de
 * relevé (critère B7).
 */
export const preventeReponses = pgTable(
  "prevente_reponses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jour: date("jour").notNull(),
    src: text("src").notNull(),
    parcours: text("parcours").notNull(),
    destination: text("destination"),
    periode: text("periode"),
    preparation: text("preparation").array().notNull().default(sql`'{}'::text[]`),
    motifs: text("motifs").array().notNull().default(sql`'{}'::text[]`),
    decouverte: text("decouverte"),
  },
  (t) => [
    check("prevente_reponses_src_check", dansListe(t.src, PREVENTE_PROVENANCES)),
    check("prevente_reponses_parcours_check", dansListe(t.parcours, PREVENTE_PARCOURS)),
    // 1 à 80 caractères, pas seulement des espaces, aucun caractère de contrôle (C0, DEL, C1 : U+0080 à U+009F), de
    // sens d'écriture ou de largeur nulle (U+200B à U+200F, U+202A à U+202E, U+2060 à U+2064, U+2066 à U+2069, U+FEFF)
    // ni séparateur de ligne (U+2028, U+2029) : le texte est lu en console par Samuel (§ 5 point 5). Le nettoyage est
    // fait par l'application (§ 3.3 point 3) ; la base refuse ce qui lui aurait échappé.
    check(
      "prevente_reponses_destination_check",
      sql`${t.destination} IS NULL OR (char_length(${t.destination}) BETWEEN 1 AND ${sql.raw(String(PREVENTE_DESTINATION_MAX))} AND btrim(${t.destination}) <> '' AND ${t.destination} !~ '[\\x01-\\x1F\\x7F\\u0080-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]')`,
    ),
    check("prevente_reponses_periode_check", sql`${t.periode} IS NULL OR ${dansListe(t.periode, PREVENTE_PERIODES)}`),
    check("prevente_reponses_preparation_check", tableauDansListe(t.preparation, PREVENTE_PREPARATIONS)),
    check(
      "prevente_reponses_motifs_check",
      sql`(${t.parcours} = 'precommande' AND ${tableauDansListe(t.motifs, PREVENTE_MOTIFS.precommande)}) OR (${t.parcours} = 'visite' AND ${tableauDansListe(t.motifs, PREVENTE_MOTIFS.visite)})`,
    ),
    check("prevente_reponses_decouverte_check", sql`${t.decouverte} IS NULL OR ${dansListe(t.decouverte, PREVENTE_DECOUVERTES)}`),
    check(
      "prevente_reponses_non_vide_check",
      sql`${t.destination} IS NOT NULL OR ${t.periode} IS NOT NULL OR ${t.decouverte} IS NOT NULL OR cardinality(${t.preparation}) > 0 OR cardinality(${t.motifs}) > 0`,
    ),
  ],
);
