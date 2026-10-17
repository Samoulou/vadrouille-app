import type { ClientPlaces, ClientRoutes, DetailsLieu } from "@/grounding/interfaces";

/**
 * Harnais de sentinelles Google réutilisable (spécification B7a, point 4 ; repris de
 * `tests/unit/p0/sentinelles-google.test.ts`) : décorateurs des clients Places et Routes qui posent une **valeur
 * sentinelle unique** sur chaque champ qu'un client peut rendre, et la liste de ces valeurs à chercher dans un texte
 * (journal de prompts, requêtes de recherche web). Utilisé par B7a, étendu en canari par B8 et B9 (décision 0011).
 *
 * Champs couverts par l'interface des clients (`src/grounding/interfaces.ts`) : `placeId` (ceux du client décoré),
 * nom, adresse, coordonnées, horaires (une minute sentinelle ajoutée à chaque plage), statut, note, niveau de prix,
 * durées (une fraction de seconde sentinelle). Distances et polylignes ne sont pas des champs de l'interface (le client
 * réel ne les rend jamais) : ils sont couverts par le test de P0r1 sur le client réel. S'y ajoutent les valeurs de
 * `GroundingVerdict` (décision 0011 § 2) et les codes de règles `R1` à `R10` du rapport du moteur.
 */

export const NOM_SENTINELLE = "SENTINELLE-G-NOM";
export const ADRESSE_SENTINELLE = "SENTINELLE-G-ADRESSE";
export const NIVEAU_PRIX_SENTINELLE = "PRICE_LEVEL_SENTINELLE";
/** Note Google sentinelle (chiffres sans autre usage dans le dépôt). */
export const NOTE_SENTINELLE = 2.718281;
/** Fraction de seconde ajoutée à chaque durée de trajet : `…​.4271828` n'apparaît que si une durée a fuité. */
export const FRACTION_DUREE_SENTINELLE = 0.4271828;

/**
 * Valeurs de `GroundingVerdict` (décision 0011 § 2) : type serveur de `src/grounding`, jamais dans un prompt. Le type
 * n'existe pas encore dans `src/contracts` ; quand B8 le crée, cette liste en est dérivée ou comparée par
 * `expectTypeOf` (réponse Q12 de la revue du head `5a955f8`).
 */
export const VERDICTS_ANCRAGE = ["compatible", "discarded", "closedPermanently"] as const;

/** Codes de règles du rapport du moteur (`R1` à `R10`), cherchés comme mots entiers. */
const CODE_REGLE = /\bR(?:10|[1-9])\b/g;

export type Sentinelles = {
  /** Valeurs déjà rendues par les clients décorés (placeId, coordonnées, statut, horaires), complétées à chaque appel. */
  readonly valeurs: Set<string>;
  readonly places: ClientPlaces;
  readonly routes: ClientRoutes;
};

/** Décore des clients Places et Routes (doubles sur fixtures, ou réels sur un transport de test). */
export function avecSentinellesGoogle(base: { places: ClientPlaces; routes: ClientRoutes }): Sentinelles {
  const valeurs = new Set<string>([NOM_SENTINELLE, ADRESSE_SENTINELLE, NIVEAU_PRIX_SENTINELLE, String(NOTE_SENTINELLE), String(FRACTION_DUREE_SENTINELLE).slice(1)]);
  const places: ClientPlaces = {
    async textSearch(requete) {
      const reponse = await base.places.textSearch(requete);
      for (const placeId of reponse.placeIds) valeurs.add(placeId);
      return reponse;
    },
    async details(placeId) {
      const lieu = await base.places.details(placeId);
      const rang = valeurs.size;
      const details: DetailsLieu = {
        ...lieu,
        horaires: lieu.horaires === null ? null : lieu.horaires.map((plage) => ({ ...plage })),
        nom: `${NOM_SENTINELLE}-${rang}`,
        adresse: `${ADRESSE_SENTINELLE}-${rang}`,
        note: NOTE_SENTINELLE,
        niveauPrix: NIVEAU_PRIX_SENTINELLE,
      };
      valeurs.add(lieu.placeId);
      valeurs.add(String(lieu.position.lat));
      valeurs.add(String(lieu.position.lng));
      if (lieu.statut !== undefined) valeurs.add(lieu.statut);
      if (lieu.horaires !== null) valeurs.add(JSON.stringify(lieu.horaires));
      return details;
    },
  };
  const routes: ClientRoutes = {
    async matrice(requete) {
      const reponse = await base.routes.matrice(requete);
      return { secondes: reponse.secondes.map((ligne) => ligne.map((s) => (s === null ? null : s + FRACTION_DUREE_SENTINELLE))) };
    },
  };
  return { valeurs, places, routes };
}

/**
 * Sentinelles présentes dans un texte : valeurs des clients (sous-chaînes), valeurs de `GroundingVerdict` et codes
 * `R1` à `R10` (mots entiers). Vide si aucune.
 */
export function sentinellesPresentes(texte: string, sentinelles: Pick<Sentinelles, "valeurs">): string[] {
  const trouvees = [...sentinelles.valeurs].filter((valeur) => valeur !== "" && texte.includes(valeur));
  for (const verdict of VERDICTS_ANCRAGE) if (new RegExp(`\\b${verdict}\\b`).test(texte)) trouvees.push(verdict);
  trouvees.push(...(texte.match(CODE_REGLE) ?? []));
  return trouvees;
}
