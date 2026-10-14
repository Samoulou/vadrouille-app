import "server-only";

import type { Forfait } from "@/server/usage/forfait";
import type {
  Consommation,
  DemandeReservation,
  Etat,
  FiltreConsommation,
  Periode,
  PortConsommation,
  ResultatReservation,
} from "@/server/usage/port";

/**
 * Registre **en mémoire** des appels d'une exécution ou d'une relecture, **borné par son forfait** (décision 0046,
 * D13 points 3, 4 et 6) : `reserve`, `confirm`, `abandon` et `release` n'agissent que sur ce registre ; **rien n'en est
 * écrit en base** (aucune ligne par appel, S4). Le forfait a été réservé en base au lancement (`neon.ts`) : il seul
 * applique les plafonds par jour, par mois et l'enveloppe. Ainsi le nombre d'appels réels ne dépasse jamais le forfait,
 * par construction.
 *
 * États (D13 point 4) : `liberee` (transport jamais appelé) n'est pas comptée ; `abandonnee` (requête partie puis
 * interrompue) est comptée au coût et aux unités estimés ; `confirmee` au coût réel s'il est connu.
 *
 * Réservation atomique par construction : la vérification et l'insertion se font sans `await` entre les deux.
 */

type Ligne = {
  readonly id: string;
  readonly demande: DemandeReservation;
  readonly instant: number;
  etat: Etat;
  coutReelMicros: number | null;
};

export type RegistreForfait = PortConsommation & {
  /** Nombre de lignes comptées (toutes sauf `liberee`), pour les tests et l'affichage pendant l'exécution. */
  comptees(): number;
};

/** Identifiant de l'exécution couverte (nul pour une relecture). */
export function creerRegistreForfait(forfait: Forfait, executionId: string | null, horloge: { maintenant(): number }): RegistreForfait {
  if ((forfait.nature === "execution") !== (executionId !== null)) throw new Error("registre: exécution et forfait incohérents");
  const lignes: Ligne[] = [];
  let suivant = 0;

  const coutDe = (ligne: Ligne) => (ligne.etat === "confirmee" && ligne.coutReelMicros !== null ? ligne.coutReelMicros : ligne.demande.coutEstimeMicros);

  const totaliser = (periode: Periode | null, filtre: FiltreConsommation): Consommation => {
    let requetes = 0;
    let elements = 0;
    let coutMicros = 0;
    for (const ligne of lignes) {
      if (ligne.etat === "liberee") continue;
      if (periode !== null && (ligne.instant < periode.du || ligne.instant >= periode.au)) continue;
      const d = ligne.demande;
      if (filtre.fournisseur !== undefined && d.fournisseur !== filtre.fournisseur) continue;
      if (filtre.methode !== undefined && d.methode !== filtre.methode) continue;
      if (filtre.sku !== undefined && d.sku !== filtre.sku) continue;
      if (filtre.executionId !== undefined && d.executionId !== filtre.executionId) continue;
      requetes += d.unites.requetes;
      elements += d.unites.elements;
      coutMicros += coutDe(ligne);
    }
    return { requetes, elements, coutMicros };
  };

  /** Vrai si la demande ferait dépasser le forfait pour sa méthode. */
  const depasse = (demande: DemandeReservation): boolean => {
    const deja = totaliser(null, { methode: demande.methode });
    const requetes = deja.requetes + demande.unites.requetes;
    switch (demande.methode) {
      case "places_text_search":
        return requetes > forfait.textSearchRequetes;
      case "places_details":
        return requetes > forfait.placeDetailsRequetes;
      case "routes_matrix":
        return requetes > forfait.routesRequetes || deja.elements + demande.unites.elements > forfait.routesElements;
      case "chat":
        return forfait.coutModelesMicros === null || deja.coutMicros + demande.coutEstimeMicros > forfait.coutModelesMicros;
    }
  };

  const changer = (id: string, vers: Etat, coutReelMicros?: number | null) => {
    const ligne = lignes.find((l) => l.id === id);
    if (ligne === undefined || ligne.etat !== "reservee") throw new Error("reservation_unknown");
    ligne.etat = vers;
    if (coutReelMicros !== undefined) ligne.coutReelMicros = coutReelMicros;
  };

  return {
    async reserve(demande): Promise<ResultatReservation> {
      // Une demande d'une autre nature ou d'une autre exécution est une erreur de composition : échec fermé.
      if (demande.nature !== forfait.nature || demande.executionId !== executionId) return { ok: false, code: "usage_unavailable" };
      const fournisseurAttendu = demande.methode === "chat" ? "modeles" : "google";
      if (demande.fournisseur !== fournisseurAttendu) return { ok: false, code: "usage_unavailable" };
      if (depasse(demande)) return { ok: false, code: "cap_reached" };
      suivant += 1;
      const id = `reg_${suivant}`;
      lignes.push({ id, demande, instant: horloge.maintenant(), etat: "reservee", coutReelMicros: null });
      return { ok: true, reservationId: id };
    },
    async confirm(id, reel) {
      changer(id, "confirmee", reel.coutMicros);
    },
    async abandon(id) {
      changer(id, "abandonnee");
    },
    async release(id) {
      changer(id, "liberee");
    },
    async consumption(periode, filtre = {}) {
      return totaliser(periode, filtre);
    },
    comptees: () => lignes.filter((l) => l.etat !== "liberee").length,
  };
}
