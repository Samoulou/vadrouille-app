import { OFFER_CONFIG } from "@/server/config/offer";

/**
 * Précommande (prévente, décision 0168, `docs/commercial/page-prevente.md` ; seuils G0 de la décision 0044). Fermée par défaut.
 *
 * - `PREVENTE` vaut exactement `1` : la page d'accueil devient la page de précommande.
 * - `PREVENTE_LIEN_PAIEMENT` : lien de paiement hébergé par Stripe (`https://buy.stripe.com/…`). L'application ne lit
 *   aucune clé et ne reçoit aucun webhook : le paiement, le reçu et l'adresse e-mail restent chez Stripe. Absent ou
 *   de forme invalide : la page « ouvre très bientôt » remplace le paiement, sans erreur.
 *
 * Le prix vient de `OFFER_CONFIG`, seule source du prix (décision 0020 § 4).
 */
export interface Prevente {
  amount: number;
  currency: (typeof OFFER_CONFIG)["currency"];
  /** Lien de paiement validé, ou `null` tant que le paiement n'est pas ouvert. */
  lienPaiement: string | null;
}

const HOTE_PAIEMENT = "buy.stripe.com";

/** Provenance d'une visite (`?src=`, `docs/commercial/suivi.md`) : lettres minuscules, chiffres et tirets, 30 au plus. */
const SRC = /^[a-z0-9-]{1,30}$/;

export function sourcePrevente(value: string | string[] | undefined): string | null {
  return typeof value === "string" && SRC.test(value) ? value : null;
}

function lienValide(value: string | undefined): string | null {
  const brut = value?.trim();
  if (!brut) return null;
  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== HOTE_PAIEMENT || url.username !== "" || url.port !== "") return null;
  // Un lien de paiement a toujours un chemin : la racine de l'hôte n'en est pas un.
  if (url.pathname.length < 2) return null;
  return `${url.origin}${url.pathname}`;
}

/** Précommande ouverte sur ce déploiement, ou `null` (accueil habituel). */
export function getPrevente(): Prevente | null {
  if (process.env.PREVENTE !== "1") return null;
  return { amount: OFFER_CONFIG.amount, currency: OFFER_CONFIG.currency, lienPaiement: lienValide(process.env.PREVENTE_LIEN_PAIEMENT) };
}

/**
 * Adresse de paiement d'une précommande, avec la provenance en `client_reference_id` (lue dans Stripe pour le suivi
 * « hors cercle proche », sans donnée personnelle côté application) ; `null` si le paiement n'est pas ouvert.
 */
export function adressePaiementPrevente(prevente: Prevente | null, src: string | null): string | null {
  if (!prevente?.lienPaiement) return null;
  return src ? `${prevente.lienPaiement}?client_reference_id=${encodeURIComponent(`src-${src}`)}` : prevente.lienPaiement;
}
