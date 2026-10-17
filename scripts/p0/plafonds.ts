import type { ClientModeles } from "@/ai/client";
import type { ClientPlaces, ClientRoutes } from "@/grounding/interfaces";
import type { CompteurPlafonne, ConfigPlafonds } from "@/prototype/config";
import type { LecteurPages } from "@/research/fetch-page";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { lire } from "@/domain/tables";

/**
 * Plafonds par exécution et registre de coût (spécification P0, « Plafonds de dépense » ; décision 0032, A3.1).
 * Un seul mécanisme : des **décorateurs** posés par l'orchestrateur autour des clients injectés, qui vérifient le
 * plafond **avant** chaque appel. Un dépassement lève `PlafondAtteint` : l'exécution s'arrête sans programme
 * partiel (raison `cost_cap_reached` ou `quota_reached`). Aucun drapeau ne le contourne.
 */

const COMPTEURS_QUOTA: readonly CompteurPlafonne[] = ["placesTextSearch", "placesDetails", "routesRequetes", "routesElements"];

export class PlafondAtteint extends Error {
  readonly code: "cost_cap_reached" | "quota_reached";
  readonly compteur: CompteurPlafonne;
  constructor(compteur: CompteurPlafonne) {
    const code = COMPTEURS_QUOTA.includes(compteur) ? "quota_reached" : "cost_cap_reached";
    super(code);
    this.code = code;
    this.compteur = compteur;
    this.name = "PlafondAtteint";
  }
}

export type Registre = {
  /** Coût cumulé en USD, d'après le coût renvoyé par le fournisseur. */
  cout: { modeles: number; rechercheWeb: number };
  utilise: Record<Exclude<CompteurPlafonne, "coutUsd" | "dureeMs">, number>;
};

export class Compteurs {
  readonly registre: Registre = {
    cout: { modeles: 0, rechercheWeb: 0 },
    utilise: {
      recherchesWeb: 0,
      pagesLues: 0,
      candidatsTrouves: 0,
      placesTextSearch: 0,
      placesDetails: 0,
      routesRequetes: 0,
      routesElements: 0,
    },
  };
  private readonly debut: number;
  private readonly plafonds: ConfigPlafonds;
  private readonly horloge: () => number;

  constructor(plafonds: ConfigPlafonds, horloge: () => number) {
    this.plafonds = plafonds;
    this.horloge = horloge;
    this.debut = horloge();
  }

  coutTotal(): number {
    return this.registre.cout.modeles + this.registre.cout.rechercheWeb;
  }

  /** Coût et durée, vérifiés avant tout appel. */
  verifierBudget(): void {
    if (this.coutTotal() >= this.plafonds.coutUsd) throw new PlafondAtteint("coutUsd");
    if (this.horloge() - this.debut > this.plafonds.dureeMs) throw new PlafondAtteint("dureeMs");
  }

  /** Réserve `quantite` unités d'un compteur avant l'appel ; refuse si le plafond serait dépassé. */
  consommer(compteur: keyof Registre["utilise"], quantite = 1): void {
    this.verifierBudget();
    const utilise = lire(this.registre.utilise, compteur);
    if (utilise + quantite > lire(this.plafonds, compteur)) throw new PlafondAtteint(compteur);
    Object.assign(this.registre.utilise, { [compteur]: utilise + quantite });
  }

  ajouterCout(poste: keyof Registre["cout"], usd: number): void {
    if (!Number.isFinite(usd) || usd < 0) return;
    Object.assign(this.registre.cout, { [poste]: lire(this.registre.cout, poste) + usd });
    if (this.coutTotal() > this.plafonds.coutUsd) throw new PlafondAtteint("coutUsd");
  }
}

export function plafonnerModeles(client: ClientModeles, compteurs: Compteurs): ClientModeles {
  return {
    async envoyer(requete) {
      compteurs.verifierBudget();
      const reponse = await client.envoyer(requete);
      compteurs.ajouterCout("modeles", reponse.coutUsd);
      return reponse;
    },
  };
}

export function plafonnerRecherche(client: ClientRechercheWeb, compteurs: Compteurs): ClientRechercheWeb {
  return {
    async rechercher(requete) {
      compteurs.consommer("recherchesWeb");
      const reponse = await client.rechercher(requete);
      compteurs.ajouterCout("rechercheWeb", reponse.coutUsd);
      return reponse;
    },
  };
}

export function plafonnerLecteur(lecteur: LecteurPages, compteurs: Compteurs): LecteurPages {
  return {
    async lire(url, autorisees) {
      compteurs.consommer("pagesLues");
      return lecteur.lire(url, autorisees);
    },
  };
}

export function plafonnerPlaces(client: ClientPlaces, compteurs: Compteurs): ClientPlaces {
  return {
    async textSearch(requete) {
      compteurs.consommer("placesTextSearch");
      return client.textSearch(requete);
    },
    async details(placeId) {
      compteurs.consommer("placesDetails");
      return client.details(placeId);
    },
  };
}

export function plafonnerRoutes(client: ClientRoutes, compteurs: Compteurs): ClientRoutes {
  return {
    async matrice(requete) {
      compteurs.consommer("routesRequetes");
      compteurs.consommer("routesElements", requete.origines.length * requete.destinations.length);
      return client.matrice(requete);
    },
  };
}
