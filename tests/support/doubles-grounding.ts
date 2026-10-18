import { clePointRoutes, ErreurAncrage, type ClientPlacesMvp, type ClientRoutes, type Coordonnees, type DetailsLieu, type ModeRoutes, type RequeteMatrice, type RequeteTextSearch } from "@/grounding/interfaces";

/**
 * Doubles Places et Routes de B8a, à **valeurs sentinelles** (spécification B8, B8a point 7 : position par lieu, statut,
 * horaires qui passent minuit, fiche introuvable, absence d'itinéraire par mode, erreur). Aucune réponse réelle de
 * Google : chaque champ que Google rendrait porte une sentinelle fabriquée ici, pour vérifier qu'aucune ne sort de la
 * mémoire. Chaque appel est journalisé ; un appel non prévu échoue (`attendu: false`).
 */

/** Sentinelles des champs que l'ancrage ne doit jamais recopier (nom, adresse, note, prix) ni rendre dans un code. */
export const SENTINELLES_B8 = {
  nom: "SENTINELLE-NOM-GOOGLE-B8",
  adresse: "SENTINELLE-ADRESSE-GOOGLE-B8",
  note: 4.271828,
  niveauPrix: "SENTINELLE-PRIX-GOOGLE-B8",
  corps: "SENTINELLE-CORPS-GOOGLE-B8",
} as const;

/** Latitude sentinelle des positions de test (décimales reconnaissables). */
export const LAT_SENTINELLE = 55.9533123;
export const LNG_SENTINELLE = -3.1883987;

export type LieuDouble = {
  readonly statut?: DetailsLieu["statut"];
  readonly position: Coordonnees;
  readonly horaires: DetailsLieu["horaires"];
};

export type AppelPlaces =
  | { readonly methode: "textSearch"; readonly requete: RequeteTextSearch }
  | { readonly methode: "details" | "position" | "identifiant"; readonly placeId: string };

export type OptionsPlacesDouble = {
  /** Lieux connus par `placeId` ; un `placeId` absent est introuvable (`ErreurAncrage("place_not_found")`, comme le client réel). */
  readonly lieux?: Readonly<Record<string, LieuDouble>>;
  /** Résultats de Text Search par texte exact de la requête ; texte absent : aucun résultat. */
  readonly textes?: Readonly<Record<string, readonly string[]>>;
  /** Nouvel identifiant rendu par `identifiant`. */
  readonly renommes?: Readonly<Record<string, string>>;
  /** Erreur levée par le n-ième appel (1 = premier), toutes méthodes confondues. */
  readonly erreur?: { readonly auAppel: number; readonly fabrique: () => unknown };
};

export type PlacesDouble = ClientPlacesMvp & { readonly appels: readonly AppelPlaces[] };

export function creerPlacesDouble(options: OptionsPlacesDouble): PlacesDouble {
  const appels: AppelPlaces[] = [];
  const lieux = new Map(Object.entries(options.lieux ?? {}));
  const textes = new Map(Object.entries(options.textes ?? {}));
  const renommes = new Map(Object.entries(options.renommes ?? {}));
  const noter = (appel: AppelPlaces) => {
    appels.push(appel);
    if (options.erreur !== undefined && appels.length === options.erreur.auAppel) throw options.erreur.fabrique();
  };
  const lieu = (placeId: string): LieuDouble => {
    const trouve = lieux.get(placeId);
    if (trouve === undefined) throw new ErreurAncrage("place_not_found");
    return trouve;
  };
  return {
    appels,
    async textSearch(requete) {
      noter({ methode: "textSearch", requete });
      return { placeIds: [...(textes.get(requete.texte) ?? [])] };
    },
    async details(placeId) {
      noter({ methode: "details", placeId });
      const { statut, position, horaires } = lieu(placeId);
      return {
        placeId,
        ...(statut === undefined ? {} : { statut }),
        position: { ...position },
        horaires: horaires === null ? null : horaires.map((plage) => ({ ...plage })),
        nom: SENTINELLES_B8.nom,
        adresse: SENTINELLES_B8.adresse,
        note: SENTINELLES_B8.note,
        niveauPrix: SENTINELLES_B8.niveauPrix,
      };
    },
    async position(placeId) {
      noter({ methode: "position", placeId });
      return { placeId, position: { ...lieu(placeId).position } };
    },
    async identifiant(placeId) {
      noter({ methode: "identifiant", placeId });
      const nouveau = renommes.get(placeId);
      if (nouveau !== undefined) return { placeId: nouveau };
      lieu(placeId);
      return { placeId };
    },
  };
}

export type OptionsRoutesDouble = {
  /** Durée en secondes d'une paire pour un mode ; `null` : aucun itinéraire. */
  readonly secondes: (de: string, vers: string, mode: ModeRoutes) => number | null;
  readonly erreur?: { readonly auAppel: number; readonly fabrique: () => unknown };
};

export type RoutesDouble = ClientRoutes & { readonly appels: readonly RequeteMatrice[] };

export function creerRoutesDouble(options: OptionsRoutesDouble): RoutesDouble {
  const appels: RequeteMatrice[] = [];
  return {
    appels,
    async matrice(requete) {
      appels.push(requete);
      if (options.erreur !== undefined && appels.length === options.erreur.auAppel) throw options.erreur.fabrique();
      // Un centre maison (0087 § 3.2) est désigné par sa clé de trajet (`maison:…`) dans `options.secondes`.
      const origines = requete.origines.map(clePointRoutes);
      const destinations = requete.destinations.map(clePointRoutes);
      return { secondes: origines.map((de) => destinations.map((vers) => (de === vers ? 0 : options.secondes(de, vers, requete.mode)))) };
    },
  };
}

/** Client Routes qui échoue s'il est appelé (aucun appel attendu). */
export function routesInterdit(): ClientRoutes {
  return { matrice: () => Promise.reject(new Error("appel Routes inattendu")) };
}

/** Client qui échoue s'il est appelé (aucun appel attendu). */
export function placesInterdit(): ClientPlacesMvp {
  const refus = () => Promise.reject(new Error("appel Places inattendu"));
  return { textSearch: refus, details: refus, position: refus, identifiant: refus };
}
