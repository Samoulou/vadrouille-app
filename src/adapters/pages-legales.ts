import { getPrevente, type Prevente } from "./prevente";

/**
 * Pages légales de la précommande (ticket 1125 ; décision 0168, « Conditions d'activation » ; textes :
 * `docs/commercial/textes-legaux-prevente.md`). Tout ce que les textes attendent de Samuel vient de variables
 * d'environnement non secrètes, lues ici, côté serveur, à chaque requête :
 *
 * - `VENDEUR_NOM`, `VENDEUR_STATUT`, `VENDEUR_ADRESSE`, `VENDEUR_CONTACT` : identité du vendeur (S1, S7) ;
 * - `VENDEUR_CONSERVATION` : durée de conservation des justificatifs de vente (S9) ;
 * - `TEXTES_LEGAUX_DATE` : date de publication des textes, « AAAA-MM-JJ » (S2).
 *
 * Précommande fermée, ou une seule valeur absente ou invalide : `null`, et les trois pages répondent 404. Aucune
 * valeur par défaut ni d'exemple : jamais un texte à trous en ligne.
 */
export interface PagesLegales {
  prevente: Prevente;
  vendeur: { nom: string; statut: string; adresse: string; contact: string };
  /** Durée de conservation, telle qu'elle s'écrit dans la phrase (« dix ans »). */
  conservation: string;
  /** Date de publication des textes, ISO « AAAA-MM-JJ ». */
  publication: string;
}

/**
 * Refusés dans toute valeur : caractères de contrôle (retours à la ligne compris) et de formatage invisibles,
 * séparateurs de ligne Unicode, et les crochets, accolades et chevrons (un emplacement « [NOM DU VENDEUR] » recopié
 * de la source, une variable `{nom}` ou une balise ne passent pas).
 */
const INTERDITS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}[\]{}<>]/u;

function texte(value: string | undefined, min: number, max: number): string | null {
  const brut = value?.trim();
  if (!brut || brut.length < min || brut.length > max || INTERDITS.test(brut)) return null;
  return brut;
}

/** Adresse e-mail de forme simple : une partie locale sans espace, un domaine à points, 254 caractères au plus. */
const EMAIL = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

function email(value: string | undefined): string | null {
  const brut = texte(value, 6, 254);
  return brut && EMAIL.test(brut) && !brut.includes("..") ? brut : null;
}

/** Date « AAAA-MM-JJ » qui existe au calendrier (le 30 février est refusé). */
function dateIso(value: string | undefined): string | null {
  const brut = value?.trim();
  const morceaux = brut ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(brut) : null;
  if (!brut || !morceaux) return null;
  const [annee, mois, jour] = [Number(morceaux[1]), Number(morceaux[2]), Number(morceaux[3])];
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour ? brut : null;
}

/** Ce que les pages légales affichent, ou `null` (404) : précommande fermée, ou valeur absente ou invalide. */
export function getPagesLegales(): PagesLegales | null {
  const prevente = getPrevente();
  if (!prevente) return null;
  const nom = texte(process.env.VENDEUR_NOM, 2, 80);
  const statut = texte(process.env.VENDEUR_STATUT, 2, 120);
  const adresse = texte(process.env.VENDEUR_ADRESSE, 5, 200);
  const contact = email(process.env.VENDEUR_CONTACT);
  const conservation = texte(process.env.VENDEUR_CONSERVATION, 2, 60);
  const publication = dateIso(process.env.TEXTES_LEGAUX_DATE);
  if (!nom || !statut || !adresse || !contact || !conservation || !publication) return null;
  return { prevente, vendeur: { nom, statut, adresse, contact }, conservation, publication };
}

/** Vrai quand les trois pages légales répondent (pour n'afficher un lien vers elles que dans ce cas). */
export function pagesLegalesDisponibles(): boolean {
  return getPagesLegales() !== null;
}
