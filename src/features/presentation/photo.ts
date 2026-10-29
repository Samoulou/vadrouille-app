"use client";

import { useEffect, useState } from "react";

import type { PlacePhoto, PlacePhotoRequest, PlacePhotoResponse } from "@/contracts/photo";
import { photoDuLieuEssai } from "@/server/actions/photo-essai";

/**
 * Photo d'une carte du tri (décision 0128 ; site d'essai, et `api` depuis le ticket 879) : demandée à l'action
 * `photoDuLieuEssai` **quand la carte s'affiche**, jamais avant, par la carte (`tripId`, `proposalId`) et jamais par un identifiant de lieu (le serveur lit
 * le lieu sur la proposition du voyage). Rien n'est écrit dans le navigateur (ni stockage, ni cache HTTP) : la seule
 * mémoire est celle de la page, pour que la carte et sa feuille de détail partagent la même demande ; chaque entrée en
 * est **supprimée** au bout de `DUREE_MEMOIRE_MS` (minuterie, et purge à chaque demande), exception nommée par 0128 § 2.
 * Échec, refus ou forme inattendue : `null`, sans message (la carte garde son emplacement).
 */

/** Durée de la mémoire de la page (5 minutes), en deçà de la durée de vie d'une adresse d'image de Google. */
export const DUREE_MEMOIRE_MS = 5 * 60_000;

/** Pont vers l'action serveur (injectable dans les tests). */
export type DemanderPhoto = (carte: PlacePhotoRequest) => Promise<PlacePhotoResponse>;
const demanderParDefaut: DemanderPhoto = (carte) => photoDuLieuEssai(carte);

type Entree = {
  readonly instant: number;
  readonly photo: Promise<PlacePhoto | null>;
  /** Réponse arrivée (lue sans attendre par une feuille de détail qui s'ouvre) ; absente tant qu'elle est en route. */
  resultat?: PlacePhoto | null;
  minuterie?: ReturnType<typeof setTimeout>;
};
const memoire = new Map<string, Entree>();

const cleDe = ({ tripId, proposalId }: PlacePhotoRequest) => `${tripId}\u0000${proposalId}`;

/** Efface la mémoire de la page (tests). */
export function oublierPhotos(): void {
  for (const entree of memoire.values()) clearTimeout(entree.minuterie);
  memoire.clear();
}

/** Nombre d'entrées gardées par la page (tests : aucune au-delà de `DUREE_MEMOIRE_MS`). */
export function photosEnMemoire(): number {
  return memoire.size;
}

function supprimer(cle: string, entree: Entree): void {
  if (memoire.get(cle) !== entree) return;
  clearTimeout(entree.minuterie);
  memoire.delete(cle);
}

function purger(maintenant: number): void {
  for (const [cle, entree] of memoire) if (maintenant - entree.instant >= DUREE_MEMOIRE_MS) supprimer(cle, entree);
}

/** Mêmes hôtes que le contrat (`src/contracts/photo.ts`), contrôlés à nouveau ici (défense en profondeur, sans Zod). */
const HOTES_IMAGE = ["googleusercontent.com"];
const HOTES_LIENS = ["google.com", "goo.gl"];

function adresseSure(valeur: unknown, hotes: readonly string[]): valeur is string {
  if (typeof valeur !== "string" || valeur.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return false;
  const hote = url.hostname.toLowerCase();
  return hotes.some((suffixe) => hote === suffixe || hote.endsWith(`.${suffixe}`));
}

/** Contrôle de forme côté client (sans Zod, décision 0016 § 3.1) : toute anomalie vaut « aucune photo ». */
export function lirePhoto(corps: unknown): PlacePhoto | null {
  const photo = (corps as { photo?: unknown } | null)?.photo;
  if (typeof photo !== "object" || photo === null) return null;
  const { url, authors, mapsUrl } = photo as { url?: unknown; authors?: unknown; mapsUrl?: unknown };
  if (!adresseSure(url, HOTES_IMAGE) || !Array.isArray(authors)) return null;
  const auteurs: PlacePhoto["authors"] = [];
  for (const auteur of authors.slice(0, 10)) {
    const { name, profileUrl } = (auteur ?? {}) as { name?: unknown; profileUrl?: unknown };
    if (typeof name !== "string" || name.trim() === "") return null;
    auteurs.push(adresseSure(profileUrl, HOTES_LIENS) ? { name, profileUrl } : { name });
  }
  return { url, authors: auteurs, ...(adresseSure(mapsUrl, HOTES_LIENS) ? { mapsUrl } : {}) };
}

async function demander(carte: PlacePhotoRequest, demande: DemanderPhoto): Promise<PlacePhoto | null> {
  try {
    return lirePhoto(await demande({ tripId: carte.tripId, proposalId: carte.proposalId }));
  } catch {
    return null;
  }
}

/** Demande partagée de la page : une seule par carte tant qu'elle est récente ; supprimée au bout de 5 minutes. */
export function chargerPhoto(carte: PlacePhotoRequest, maintenant = Date.now(), demande: DemanderPhoto = demanderParDefaut): Promise<PlacePhoto | null> {
  purger(maintenant);
  const cle = cleDe(carte);
  const connue = memoire.get(cle);
  if (connue) return connue.photo;
  const photo = demander(carte, demande);
  const entree: Entree = { instant: maintenant, photo };
  entree.minuterie = setTimeout(() => supprimer(cle, entree), DUREE_MEMOIRE_MS);
  memoire.set(cle, entree);
  void photo.then((resultat) => {
    entree.resultat = resultat;
  });
  return photo;
}

/** Réponse déjà arrivée pour cette carte (entrée encore gardée : moins de 5 minutes), sinon `undefined`. */
function photoConnue(cle: string): PlacePhoto | null | undefined {
  return memoire.get(cle)?.resultat;
}

/** Photo d'une carte : `attente` tant que la demande est en route (l'emplacement est gardé, sans libellé). */
export type EtatPhoto = { readonly attente: boolean; readonly photo: PlacePhoto | null };
const SANS_PHOTO: EtatPhoto = { attente: false, photo: null };

/**
 * Photo de la carte `proposalId` du voyage `tripId`. Aucune demande sans lieu (`avecLieu` faux), désactivée (`active`
 * faux : ni site d'essai, ni `api` barrière ouverte) ou sans carte. Une réponse déjà arrivée pour la même carte est
 * rendue dès le premier rendu (la feuille de détail s'ouvre avec la photo de la carte, sans saut de mise en page).
 */
export function usePhotoCarte(
  tripId: string,
  carte: { readonly proposalId: string; readonly avecLieu: boolean } | null,
  active: boolean,
  demande?: DemanderPhoto,
): EtatPhoto {
  const requete = active && carte !== null && carte.avecLieu ? { tripId, proposalId: carte.proposalId } : null;
  const cle = requete === null ? null : cleDe(requete);
  const [etat, setEtat] = useState<{ cle: string; photo: PlacePhoto | null } | null>(null);
  useEffect(() => {
    if (requete === null || cle === null) return;
    let vivant = true;
    void chargerPhoto(requete, Date.now(), demande).then((photo) => {
      if (vivant) setEtat({ cle, photo });
    });
    return () => {
      vivant = false;
    };
    // `requete` est reconstruite à chaque rendu ; `cle` la résume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, demande]);
  if (cle === null) return SANS_PHOTO;
  if (etat !== null && etat.cle === cle) return { attente: false, photo: etat.photo };
  const connue = photoConnue(cle);
  return connue === undefined ? { attente: true, photo: null } : { attente: false, photo: connue };
}
