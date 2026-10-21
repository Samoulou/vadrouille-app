// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ErreurModele, type ClientModeles, type RequeteModele } from "@/ai/client";
import { creerCoucheIa } from "@/ai/couche";
import { CODES_ERREUR_IA } from "@/ai/erreurs";
import { CONFIGURATION_IA } from "@/server/config/ia";

import { ENTREE } from "../../support/recherche-doubles";

/**
 * Décision 0096 § 4.1 point 5 : `zdr: true` pour la seule étape `structuration`, lu de la configuration de production ;
 * un refus du fournisseur rend un code fermé et ne déclenche **aucun** second appel sans `zdr`. Le corps envoyé au
 * fournisseur (`provider.zdr`) est contrôlé avec le client réel dans `src/ai/openrouter-client.test.ts`. Client simulé.
 */

const REPONSES = {
  structuration: JSON.stringify({ pace: "relaxed", wishes: ["museum"], inferredFields: ["pace"] }),
  quartier: JSON.stringify({ zone: null, logements: [] }),
  plan: JSON.stringify({ secteurs: [], requetes: [{ requete: "musées", creneau: "activity" }] }),
  notation: JSON.stringify({ notes: [] }),
  raisons: JSON.stringify({ raisons: [] }),
  recherche: JSON.stringify({ actions: [], candidats: [], termine: true }),
  // Étape du prototype seulement (décision 0115) : jamais appelée par la couche du MVP.
  programme: JSON.stringify({ jours: [] }),
} as const;
const DEMANDE = { story: "Nous aimons marcher.", trip: { destination: "Édimbourg", start: "2026-11-23", end: "2026-11-26", otherCities: [] } };
const CANDIDAT = { id: "c_001", nom: "Musée", resume: "Un musée.", categorie: "museum" as const, typeEtape: "activity" as const };

function monter(erreur?: Error) {
  const requetes: RequeteModele[] = [];
  const client: ClientModeles = {
    async envoyer(requete) {
      requetes.push(structuredClone(requete));
      if (erreur !== undefined) throw erreur;
      return { texte: REPONSES[requete.etape], coutUsd: 0 };
    },
  };
  return { couche: creerCoucheIa({ modeles: client, reglages: CONFIGURATION_IA.reglages }), requetes };
}

describe("ia: zdr pour la seule étape structuration", () => {
  it("la configuration de production pose zdr pour structuration et pour elle seule", () => {
    const { reglages, recherche, rechercheWeb } = CONFIGURATION_IA;
    expect(reglages.structuration.routage).toEqual({ data_collection: "deny", zdr: true });
    for (const reglage of [reglages.quartier, reglages.plan, reglages.notation, reglages.raisons, recherche, rechercheWeb]) {
      expect(reglage.routage).toEqual({ data_collection: "deny" });
    }
  });

  it("la requête structuration porte zdr: true ; les quatre autres étapes de la couche n'en portent pas", async () => {
    const { couche, requetes } = monter();
    await couche.structurerBrief(DEMANDE);
    await couche.proposerQuartier({ quartier: { ville: "Édimbourg", debut: "2026-11-23", fin: "2026-11-26" }, resultats: [] });
    await couche.planifierRecherche({ entree: ENTREE });
    await couche.noter({ entree: ENTREE, candidats: [CANDIDAT] });
    await couche.rediger({ entree: ENTREE, lieux: [{ ...CANDIDAT, sourceDomaine: "guide.example" }] });
    expect(requetes.map((requete) => requete.etape)).toEqual(["structuration", "quartier", "plan", "notation", "raisons"]);
    for (const requete of requetes) {
      if (requete.etape === "structuration") expect(requete.routage).toEqual({ data_collection: "deny", zdr: true });
      else expect(requete.routage).toEqual({ data_collection: "deny" });
    }
  });

  it("un refus du fournisseur sur structuration rend un code fermé, sans le message, et aucun second appel sans zdr", async () => {
    const { couche, requetes } = monter(new ErreurModele("model_error"));
    const resultat = await couche.structurerBrief(DEMANDE);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(CODES_ERREUR_IA).toContain(resultat.code);
    expect(JSON.stringify(resultat)).not.toContain("SENTINELLE");
    expect(requetes).toHaveLength(1);
    expect(requetes[0]?.routage).toEqual({ data_collection: "deny", zdr: true });
  });
});
