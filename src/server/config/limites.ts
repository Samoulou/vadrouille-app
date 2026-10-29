import "server-only";

/**
 * Configuration du limiteur maison (spécification B3, B3a point 6 ; décision 0050, B3-TL-6 et amendement de 0007),
 * lue côté serveur seulement, sur le modèle de `offer.ts`. Seuils et durées ne sont jamais codés dans une action.
 *
 * Valeurs de départ : **reprises** de la décision 0008 (B3-PO-6), aucune n'est fixée par le studio ; seuils réels :
 * Q86 (Tech Lead, Sécurité). Compartiment commun (`no-trusted-ip`) : seuils d'une seule adresse IP de l'action.
 */

/** Espèce d'une règle : par clé d'adresse IP (ou compartiment commun), ou par adresse e-mail canonique. */
export type RateLimitKind = "ip" | "email";

/** Une règle : au plus `threshold` appels admis par fenêtre fixe de `windowSeconds` secondes (horloge de la base). */
export type RateLimitRule = { readonly kind: RateLimitKind; readonly windowSeconds: number; readonly threshold: number };

/** Règles par nom d'action (`^[a-z][a-z0-9-]{0,47}$`), dans l'ordre fixe d'évaluation : adresse IP, puis e-mail. */
export type RateLimitConfig = Readonly<Record<string, readonly RateLimitRule[]>>;

export const RATE_LIMITS: RateLimitConfig = {
  // Envoi de code : 3 par 10 minutes et par adresse IP, 5 par heure et par adresse e-mail.
  "request-code": [
    { kind: "ip", windowSeconds: 600, threshold: 3 },
    { kind: "email", windowSeconds: 3600, threshold: 5 },
  ],
  // Vérification : 10 par 10 minutes et par adresse IP, 10 par heure et par adresse e-mail.
  "verify-code": [
    { kind: "ip", windowSeconds: 600, threshold: 10 },
    { kind: "email", windowSeconds: 3600, threshold: 10 },
  ],
  // B4a (décision 0097 B4-TL-6 point 2) : actions du paiement simulé, par adresse IP (le limiteur n'a pas de règle par
  // personne). En `local` et `ci`, sans en-tête de confiance, tous les appels partagent le compartiment commun. Seuils
  // de la phase simulée seulement : ils ne valent pas pour `stripe` (B4c, Q86).
  "payment-start": [{ kind: "ip", windowSeconds: 3600, threshold: 20 }],
  "payment-simulate": [{ kind: "ip", windowSeconds: 3600, threshold: 60 }],
  // M1e (ticket 879) : photos du tri sur `api` (`src/server/photos/api.ts`), même plafond que le site d'essai, 40 par
  // heure (décision 0128 § 4, F13-TL-2), ici par adresse IP (le limiteur n'a pas de règle par session). Lu seulement
  // barrière B9-TL-8 ouverte et lieu admis : aucun appel aujourd'hui. Seuil proposé, à confirmer (Q86, PR 879).
  "photo-tri": [{ kind: "ip", windowSeconds: 3600, threshold: 40 }],
};

/** Lignes supprimées au plus par purge, les plus anciennes `expires_at` d'abord (B3-TL-6). */
export const RATE_LIMIT_PURGE_BATCH = 100;

/** Plafond de lignes surveillé d'`action_rate_limits` (amendement de 0007, point 5) : alerte, jamais limite dure. */
export const RATE_LIMIT_ROWS_ALERT = 50_000;

/** Étouffement de l'alerte `rate_limit.rows_high` : au plus une fois par processus et par 10 minutes. */
export const RATE_LIMIT_ROWS_ALERT_INTERVAL_MS = 600_000;
