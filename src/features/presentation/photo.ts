"use client";

import { useEffect, useState } from "react";

import type { PlacePhoto, PlacePhotoResponse } from "@/contracts/photo";
import { photoDuLieuEssai } from "@/server/actions/photo-essai";

/**
 * Photo d'une carte du tri d'un voyage d'essai (décision 0128) : demandée à l'action `photoDuLieuEssai` **quand la carte
 * s'affiche**, jamais avant. Rien n'est écrit dans le navigateur (ni stockage, ni cache HTTP) : la seule mémoire est celle
 * de la page, pour que la carte et sa feuille de détail partagent la même demande, et elle s'efface après
 * `DUREE_MEMOIRE_MS` (l'adresse de l'image est de courte durée). Échec, refus ou forme inattendue : `null`, sans message
 * (la carte garde son emplacement).
 */

/** Durée de la mémoire de la page (5 minutes), en deçà de la durée de vie d'une adresse d'image de Google. */
export const DUREE_MEMOIRE_MS = 5 * 60_000;

/** Pont vers l'action serveur (injectable dans les tests). */
export type DemanderPhoto = (placeId: string) => Promise<PlacePhotoResponse>;
const demanderParDefaut: DemanderPhoto = (placeId) => photoDuLieuEssai({ placeId });

type Entree = { readonly instant: number; readonly photo: Promise<PlacePhoto | null> };
const memoire = new Map<string, Entree>();

/** Efface la mémoire de la page (tests). */
export function oublierPhotos(): void {
  memoire.clear();
}

const https = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur.startsWith("https://");

/** Contrôle de forme côté client (sans Zod, décision 0016 § 3.1) : toute anomalie vaut « aucune photo ». */
export function lirePhoto(corps: unknown): PlacePhoto | null {
  const photo = (corps as { photo?: unknown } | null)?.photo;
  if (typeof photo !== "object" || photo === null) return null;
  const { url, authors, mapsUrl } = photo as { url?: unknown; authors?: unknown; mapsUrl?: unknown };
  if (!https(url) || !Array.isArray(authors)) return null;
  const auteurs: PlacePhoto["authors"] = [];
  for (const auteur of authors.slice(0, 10)) {
    const { name, profileUrl } = (auteur ?? {}) as { name?: unknown; profileUrl?: unknown };
    if (typeof name !== "string" || name.trim() === "") return null;
    auteurs.push(https(profileUrl) ? { name, profileUrl } : { name });
  }
  return { url, authors: auteurs, ...(https(mapsUrl) ? { mapsUrl } : {}) };
}

async function demander(placeId: string, demande: DemanderPhoto): Promise<PlacePhoto | null> {
  try {
    return lirePhoto(await demande(placeId));
  } catch {
    return null;
  }
}

/** Demande partagée de la page (une seule par lieu tant qu'elle est récente). */
export function chargerPhoto(placeId: string, maintenant = Date.now(), demande: DemanderPhoto = demanderParDefaut): Promise<PlacePhoto | null> {
  const connue = memoire.get(placeId);
  if (connue && maintenant - connue.instant < DUREE_MEMOIRE_MS) return connue.photo;
  const photo = demander(placeId, demande);
  memoire.set(placeId, { instant: maintenant, photo });
  return photo;
}

/**
 * Photo du lieu `placeId`, ou `null` tant qu'elle n'est pas arrivée, sans lieu, désactivée (`active` faux : hors
 * adaptateur `prototype`) ou en échec.
 */
export function usePhotoLieu(placeId: string | undefined, active: boolean, demande?: DemanderPhoto): PlacePhoto | null {
  const cle = active && placeId ? placeId : null;
  const [etat, setEtat] = useState<{ cle: string; photo: PlacePhoto | null } | null>(null);
  useEffect(() => {
    if (cle === null) return;
    let vivant = true;
    void chargerPhoto(cle, Date.now(), demande).then((photo) => {
      if (vivant) setEtat({ cle, photo });
    });
    return () => {
      vivant = false;
    };
  }, [cle, demande]);
  return etat !== null && etat.cle === cle ? etat.photo : null;
}
