import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parametresAjoutDeLieu } from "@/adapters";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

import { AjouterLieuView } from "./AjouterLieu";
import { lireEntree } from "./ajouter-lieu";
import { dayFromParam, loadTrip } from "./load";

const ROBOTS = { index: false, follow: false } as const;

/**
 * « Ajouter un lieu » (tâche M5d-2, ticket 961 ; spécification M5 § 6 ; F7, F7-PO-8 à F7-PO-11 ; décision 0147 § 3), dans
 * le panneau du voyage : la page valide `n` (404 hors du voyage) et l'adaptateur (`mock` ou `api` ; 404 pour le site
 * d'essai, qui n'a pas d'ajout), lit les paramètres de l'adresse et passe à `AjouterLieuView` les durées prévues et la
 * version du jeu simulé. Module propre à l'écran : ni le Séjour ni la Journée ne chargent son JavaScript (voir
 * `screens.tsx`). Aucune donnée Google n'est lue ici : la recherche est faite par l'écran, à la demande.
 */
export async function AjouterScreen({
  tripId,
  n,
  searchParams,
}: {
  tripId: string;
  n: string;
  searchParams: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadTrip(tripId);
  const day = data ? dayFromParam(data.trip, n) : null;
  const parametres = parametresAjoutDeLieu();
  if (!day || parametres === null) notFound();
  const { entree, invalide } = lireEntree(searchParams);
  return (
    <AjouterLieuView
      dayIndex={day.index}
      entree={entree}
      cleanAddress={invalide}
      durees={parametres.durees}
      versionSimulee={parametres.versionSimulee}
      resultatsGoogle={parametres.resultatsGoogle}
    />
  );
}

/** Titre du document : « Ajouter un lieu · Jour {n} » (F7, « Ajouter un lieu ») ; rien hors du voyage (404). */
export async function ajouterMetadata(tripId: string, n: string): Promise<Metadata> {
  const data = await loadTrip(tripId);
  const day = data ? dayFromParam(data.trip, n) : null;
  if (!day) return { robots: ROBOTS };
  return { title: format(messages.sejour.titreDocument.ajouter, { n: day.index }), robots: ROBOTS };
}
