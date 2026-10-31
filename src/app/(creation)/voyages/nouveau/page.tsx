import type { Metadata } from "next";

import { isApiAdapter, siteEssaiAutorise } from "@/adapters";
import { CreateTripForm } from "@/features/creation/CreateTripForm";
import * as messages from "@/i18n/messages";
import { rechercheVilleApiOuverte } from "@/server/composition/villes-api";

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
 *
 * Adaptateur `api` (décision 0141 § 6.4) : la recherche de ville de `api` n'est montée que si `isApiAdapter()` **et**
 * `rechercheVilleApiOuverte()` (seuils validés par Samuel et barrière réelle, crochet de M1h) ; sinon le champ
 * d'aujourd'hui (62 villes, sans appel serveur). La page n'importe de `src/server` que ce prédicat, par le terminal
 * `@/server/composition/villes-api` (exception nominative de `eslint.config.mjs` et arête nominative de la frontière
 * P0r3b) ; elle n'importe directement ni la barrière, ni le crochet, ni la configuration, que le terminal lit pour elle.
 */
export default async function NouveauVoyagePage() {
  if (siteEssaiAutorise()) return <CreateTripForm essai />;
  // `api` (spécification M4 § 7.1) : les autres villes sont contrôlées à « Continuer » comme par `createTrip`.
  if (isApiAdapter()) return (await rechercheVilleApiOuverte()) ? <CreateTripForm recherche="api" controleVilles /> : <CreateTripForm controleVilles />;
  return <CreateTripForm />;
}
