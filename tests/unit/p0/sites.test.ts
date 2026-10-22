// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { lireProgramme, ordreEcrit } from "@/ai/sorties";
import { reduireSite } from "@/research/fetch-page";
import {
  avecSiteGarde,
  SITES_DUREE_MAX_MS,
  SITES_MAX,
  SITES_SIMULTANES,
  sitesDuProgramme,
  verifierSites,
  type CompteursSites,
  type VerificateurSites,
} from "@/server/p0/sites";

/**
 * Orchestration des vérifications de sites de `p0Run` (lot 2a : la spécification P0-programme-par-ia § 11.3 et § 11.5, A19,
 * A22 ; décision 0121 § 3.4 ; verdict 0122 § 1 condition 10 et § 2.1). Vérificateur **simulé** (aucune requête),
 * horloge simulée.
 */

afterEach(() => {
  vi.useRealTimers();
});

const relations = (compteurs: CompteursSites) => {
  expect(compteurs.sitesProposed).toBe(compteurs.sitesChecked + compteurs.sitesUnchecked);
  expect(compteurs.sitesRemoved).toBeLessThanOrEqual(compteurs.sitesChecked);
  for (const valeur of Object.values(compteurs)) expect(Number.isInteger(valeur) && valeur >= 0).toBe(true);
  expect(Object.keys(compteurs).sort()).toEqual(["sitesChecked", "sitesProposed", "sitesRemoved", "sitesUnchecked"]);
};

/** Vérificateur simulé : verdict par adresse, compte des appels et des vérifications simultanées. */
function verificateurSimule(verdict: (adresse: string) => boolean | "attendre" = () => true, barriereFermee = false) {
  const appels: string[] = [];
  let enCours = 0;
  let maxEnCours = 0;
  const verificateur: VerificateurSites = {
    barriereFermee,
    async verifier(adresse, signal) {
      appels.push(adresse);
      enCours += 1;
      maxEnCours = Math.max(maxEnCours, enCours);
      try {
        const v = verdict(adresse);
        if (v === "attendre") {
          // Ne répond qu'à l'abandon (fin des 60 s ou erreur de l'étape).
          await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
          return { ok: false };
        }
        await Promise.resolve();
        return { ok: v };
      } finally {
        enCours -= 1;
      }
    },
  };
  return { verificateur, appels, maxEnCours: () => maxEnCours };
}

const adresses = (n: number) => Array.from({ length: n }, (_, i) => `https://lieu-${i}.example.org/`);
const options = (debut = Date.now()) => ({ limite: debut + 10 * 60_000, maintenant: () => Date.now() });

describe("sites: plafonds, dédoublonnage, barrière (A19)", () => {
  it("sites: plafond par exécution, programme entier écrit", async () => {
    const { verificateur, appels, maxEnCours } = verificateurSimule();
    const resultat = await verifierSites(adresses(100), verificateur, options());
    expect(appels).toEqual(adresses(SITES_MAX));
    expect(resultat.compteurs).toEqual({ sitesProposed: 100, sitesChecked: 80, sitesRemoved: 0, sitesUnchecked: 20 });
    expect(resultat.gardees.size).toBe(80);
    expect(maxEnCours()).toBeLessThanOrEqual(SITES_SIMULTANES);
    expect(maxEnCours()).toBe(SITES_SIMULTANES);
    relations(resultat.compteurs);
    expect([SITES_MAX, SITES_SIMULTANES, SITES_DUREE_MAX_MS]).toEqual([80, 8, 60_000]);
  });

  it("sites: une adresse citée deux fois vérifiée une fois (dédoublonnage par adresse réduite)", async () => {
    const lecture = lireProgramme(
      JSON.stringify({
        jours: [
          {
            date: "2026-11-23",
            creneaux: [
              { debut: "12:00", nature: "repas_midi", lieu: "Trattoria", pourquoi: "Midi.", site: "https://trattoria.example.org/?midi=1" },
              { debut: "20:00", nature: "repas_soir", lieu: "Trattoria", pourquoi: "Soir.", site: "https://TRATTORIA.example.org/#soir" },
              { debut: "15:00", nature: "visite", lieu: "Musée", pourquoi: "Voir.", site: "http://musee.example.org/" },
            ],
          },
        ],
      }),
      { arrivee: "2026-11-23", depart: "2026-11-24" },
    );
    const sites = sitesDuProgramme(ordreEcrit(lecture.valeur!), reduireSite);
    expect(sites.adresses).toEqual(["https://trattoria.example.org/"]);
    expect(sites.formesRefusees).toBe(1);
    // Ordre écrit : 12:00, 15:00, 20:00.
    expect([sites.adresseDe(0, 0), sites.adresseDe(0, 1), sites.adresseDe(0, 2)]).toEqual(["https://trattoria.example.org/", undefined, "https://trattoria.example.org/"]);
    const { verificateur, appels } = verificateurSimule();
    const resultat = await verifierSites(sites.adresses, verificateur, options());
    expect(appels).toHaveLength(1);
    expect(resultat.compteurs).toEqual({ sitesProposed: 1, sitesChecked: 1, sitesRemoved: 0, sitesUnchecked: 0 });
  });

  it("sites: refus comptés, gardées seules dans l'ensemble ; vérificateur qui rejette : refus de cette adresse", async () => {
    const liste = adresses(10);
    const verificateur: VerificateurSites = {
      barriereFermee: false,
      async verifier(adresse) {
        if (adresse.includes("lieu-3")) throw new Error("SENTINELLE");
        return { ok: !adresse.includes("lieu-5") };
      },
    };
    const resultat = await verifierSites(liste, verificateur, options());
    expect(resultat.compteurs).toEqual({ sitesProposed: 10, sitesChecked: 10, sitesRemoved: 2, sitesUnchecked: 0 });
    expect([...resultat.gardees].sort()).toEqual(liste.filter((a) => !a.includes("lieu-3") && !a.includes("lieu-5")).sort());
    relations(resultat.compteurs);
  });

  it("sites: épuisement des 60 s avec vérifications en cours : celles-ci vérifiées et refusées, les autres non soumises", async () => {
    vi.useFakeTimers();
    const { verificateur, appels } = verificateurSimule(() => "attendre");
    const promesse = verifierSites(adresses(30), verificateur, { limite: Date.now() + 10 * 60_000, maintenant: () => Date.now() });
    await vi.advanceTimersByTimeAsync(SITES_DUREE_MAX_MS);
    const resultat = await promesse;
    expect(appels).toHaveLength(SITES_SIMULTANES);
    expect(resultat.compteurs).toEqual({ sitesProposed: 30, sitesChecked: 8, sitesRemoved: 8, sitesUnchecked: 22 });
    expect(resultat.gardees.size).toBe(0);
    relations(resultat.compteurs);
  });

  it("sites: une adresse n'est soumise que si son délai entier tient avant la limite", async () => {
    const { verificateur, appels } = verificateurSimule();
    // Limite dans 5,5 s : 5 s + 1 s de marge ne tiennent pas, rien n'est soumis.
    const resultat = await verifierSites(adresses(5), verificateur, { limite: Date.now() + 5_500, maintenant: () => Date.now() });
    expect(appels).toEqual([]);
    expect(resultat.compteurs).toEqual({ sitesProposed: 5, sitesChecked: 0, sitesRemoved: 0, sitesUnchecked: 5 });
  });

  it("sites: abandon par l'étape (erreur de la vérification des lieux) : en cours refusées, aucune nouvelle soumission", async () => {
    const controleur = new AbortController();
    const { verificateur, appels } = verificateurSimule(() => "attendre");
    const promesse = verifierSites(adresses(20), verificateur, { ...options(), signal: controleur.signal });
    await vi.waitFor(() => expect(appels).toHaveLength(SITES_SIMULTANES));
    controleur.abort();
    const resultat = await promesse;
    expect(resultat.compteurs).toEqual({ sitesProposed: 20, sitesChecked: 8, sitesRemoved: 8, sitesUnchecked: 12 });
  });

  it("sites: barrière de sortie fermée : aucune adresse soumise, sitesChecked = 0, sitesUnchecked = sitesProposed", async () => {
    const { verificateur, appels } = verificateurSimule(() => true, true);
    const resultat = await verifierSites(adresses(12), verificateur, options());
    expect(appels).toEqual([]);
    expect(resultat.compteurs).toEqual({ sitesProposed: 12, sitesChecked: 0, sitesRemoved: 0, sitesUnchecked: 12 });
    expect(resultat.gardees.size).toBe(0);
  });

  it("sites: aucune adresse : vérificateur jamais lu", async () => {
    const intouchable: VerificateurSites = {
      get barriereFermee(): boolean {
        throw new Error("vérificateur lu sans adresse");
      },
      verifier: () => {
        throw new Error("vérificateur appelé sans adresse");
      },
    };
    const resultat = await verifierSites([], intouchable, options());
    expect(resultat.compteurs).toEqual({ sitesProposed: 0, sitesChecked: 0, sitesRemoved: 0, sitesUnchecked: 0 });
  });
});

describe("sites: aucune réponse stockée ni journalisée (A22)", () => {
  it("sites: aucune réponse stockée ni journalisée (résultat : ensemble d'adresses gardées et nombres seulement)", async () => {
    const SENTINELLE = "SENTINELLE-REPONSE";
    const verificateur = {
      barriereFermee: false,
      // Un vérificateur fautif qui rendrait plus que le résultat fermé : rien d'autre ne sort de l'orchestration.
      async verifier() {
        return { ok: true, statut: 200, entetes: { server: SENTINELLE }, location: `https://${SENTINELLE}.example.org/` };
      },
    } as VerificateurSites;
    const resultat = await verifierSites(["https://lieu.example.org/"], verificateur, options());
    expect(Object.keys(resultat).sort()).toEqual(["compteurs", "gardees"]);
    expect(JSON.stringify({ ...resultat, gardees: [...resultat.gardees] })).not.toContain(SENTINELLE);
    relations(resultat.compteurs);
  });

  it("sites: le site lu ne passe jamais tel quel à l'assemblage ; seule l'adresse réduite gardée est remise", () => {
    const creneau = { debut: "10:00", nature: "visite" as const, lieu: "Musée", pourquoi: "Voir.", site: "https://musee.example.org/?ref=ia#x" };
    const reduite = reduireSite(creneau.site)!;
    expect(avecSiteGarde(creneau, reduite, new Set([reduite]))).toEqual({ ...creneau, site: "https://musee.example.org/" });
    const refuse = avecSiteGarde(creneau, reduite, new Set());
    expect(refuse).not.toHaveProperty("site");
    expect(refuse).toEqual({ debut: "10:00", nature: "visite", lieu: "Musée", pourquoi: "Voir." });
    expect(avecSiteGarde(creneau, undefined, new Set([reduite]))).not.toHaveProperty("site");
  });
});
