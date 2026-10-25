import type { Metadata } from "next";

import { siteEssaiAutorise } from "@/adapters";
import { CreateTripForm } from "@/features/creation/CreateTripForm";
import * as messages from "@/i18n/messages";

// Rendue à chaque requête (comme l'accueil) : le site d'essai est lu côté serveur (`DATA_ADAPTER`), plus seulement dans
// l'adresse. Arrivé sur `/voyages/nouveau` sans `?site=essai` (adresse tapée, favori, retour après un brouillon perdu),
// l'écran 1 du site d'essai montrait le champ texte libre, sans recherche de ville ni état (constat de Samuel du
// 2026-10-25 : « Tro », aucune suggestion, aucun texte sous le champ).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.creation.titreDocument.nouveau,
  robots: { index: false, follow: false },
};

/**
 * `R1`, écran 1 « Créer le voyage » (spécification F8). Le brouillon vit dans l'onglet. Site d'essai (adaptateur
 * `prototype`, garde de la liste blanche) : la recherche de ville est montée quelle que soit l'adresse ; ailleurs,
 * `?site=essai` reste lu dans l'adresse (captures et e2e sur données simulées).
 */
export default function NouveauVoyagePage() {
  return <CreateTripForm {...(siteEssaiAutorise() ? { essai: true } : {})} />;
}
