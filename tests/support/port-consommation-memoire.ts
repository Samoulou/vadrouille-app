import type {
  Consommation,
  DemandeReservation,
  Etat,
  FiltreConsommation,
  Horloge,
  Periode,
  Plafond,
  PortConsommation,
  ResultatReservation,
} from "@/server/usage/port";

/**
 * Implémentation **en mémoire** du port de consommation (P0r1 : tests seulement, d'où sa place sous `tests/support/` ;
 * décision 0046, D13). Réservation
 * atomique par construction : la vérification des plafonds et l'insertion de la ligne se font sans `await` entre les
 * deux. L'implémentation Neon (forfait `prototype.forfaits`, 0046 D13 point 3) arrive avec P0r2.
 */

export type LigneMemoire = {
  readonly id: string;
  readonly demande: DemandeReservation;
  readonly instant: number;
  etat: Etat;
  coutReelMicros: number | null;
};

export type PortMemoire = PortConsommation & { readonly lignes: readonly LigneMemoire[] };

const dansPeriode = (instant: number, periode: Periode | null) => periode === null || (instant >= periode.du && instant < periode.au);

const correspond = (demande: DemandeReservation, filtre: FiltreConsommation) =>
  (filtre.fournisseur === undefined || demande.fournisseur === filtre.fournisseur) &&
  (filtre.methode === undefined || demande.methode === filtre.methode) &&
  (filtre.sku === undefined || demande.sku === filtre.sku) &&
  (filtre.executionId === undefined || demande.executionId === filtre.executionId);

const coutDe = (ligne: LigneMemoire) => (ligne.etat === "confirmee" && ligne.coutReelMicros !== null ? ligne.coutReelMicros : ligne.demande.coutEstimeMicros);

export function creerPortMemoire(horloge: Pick<Horloge, "maintenant">): PortMemoire {
  const lignes: LigneMemoire[] = [];
  let suivant = 0;

  const totaliser = (periode: Periode | null, filtre: FiltreConsommation): Consommation => {
    let requetes = 0;
    let elements = 0;
    let coutMicros = 0;
    for (const ligne of lignes) {
      if (ligne.etat === "liberee" || !dansPeriode(ligne.instant, periode) || !correspond(ligne.demande, filtre)) continue;
      requetes += ligne.demande.unites.requetes;
      elements += ligne.demande.unites.elements;
      coutMicros += coutDe(ligne);
    }
    return { requetes, elements, coutMicros };
  };

  const depasse = (plafond: Plafond, demande: DemandeReservation): boolean => {
    if (plafond.fournisseur !== demande.fournisseur) return false;
    if (plafond.methode !== undefined && plafond.methode !== demande.methode) return false;
    let periode: Periode | null = null;
    const filtre: { fournisseur: typeof plafond.fournisseur; methode?: typeof plafond.methode; executionId?: string } = {
      fournisseur: plafond.fournisseur,
      ...(plafond.methode !== undefined ? { methode: plafond.methode } : {}),
    };
    if (plafond.portee === "jour") periode = demande.periodes.jour;
    else if (plafond.portee === "mois") periode = demande.periodes.mois;
    else if (plafond.portee === "execution") {
      if (demande.executionId === null) return false;
      filtre.executionId = demande.executionId;
    }
    const deja = totaliser(periode, filtre);
    return (
      (plafond.maxRequetes !== undefined && deja.requetes + demande.unites.requetes > plafond.maxRequetes) ||
      (plafond.maxElements !== undefined && deja.elements + demande.unites.elements > plafond.maxElements) ||
      (plafond.maxCoutMicros !== undefined && deja.coutMicros + demande.coutEstimeMicros > plafond.maxCoutMicros)
    );
  };

  const changer = (id: string, depuis: Etat, vers: Etat, coutReelMicros?: number | null) => {
    const ligne = lignes.find((l) => l.id === id);
    if (ligne === undefined || ligne.etat !== depuis) throw new Error("reservation_unknown");
    ligne.etat = vers;
    if (coutReelMicros !== undefined) ligne.coutReelMicros = coutReelMicros;
  };

  return {
    lignes,
    async reserve(demande): Promise<ResultatReservation> {
      for (const plafond of demande.plafonds) {
        if (depasse(plafond, demande)) return { ok: false, code: plafond.portee === "enveloppe" ? "envelope_reached" : "cap_reached" };
      }
      suivant += 1;
      const id = `res_${suivant}`;
      lignes.push({ id, demande, instant: horloge.maintenant(), etat: "reservee", coutReelMicros: null });
      return { ok: true, reservationId: id };
    },
    async confirm(id, reel) {
      changer(id, "reservee", "confirmee", reel.coutMicros);
    },
    async abandon(id) {
      changer(id, "reservee", "abandonnee");
    },
    async release(id) {
      changer(id, "reservee", "liberee");
    },
    async consumption(periode, filtre = {}) {
      return totaliser(periode, filtre);
    },
  };
}
