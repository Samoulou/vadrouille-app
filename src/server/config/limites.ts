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
  // M1f (décision 0141 § 4.1) : recherche de ville de l'écran 1 de `api`, suggestions et choix confondus, 20 actions par
  // minute et par adresse IP (0129 § 3 point 4). Écran anonyme : espèce `ip` seulement ; sans en-tête de confiance,
  // compartiment commun `no-trusted-ip`. Appelé avant la réservation du jour (§ 4.4).
  "ville-recherche": [{ kind: "ip", windowSeconds: 60, threshold: 20 }],
  // M1e (décision 0143 § 3) : photos du tri sur `api` (`src/server/photos/api.ts`), même nombre que le site d'essai
  // (`MAX_PHOTOS_PAR_HEURE`, 0128 § 4), compté par adresse IP (le limiteur n'a pas de règle par session ; le site d'essai
  // compte toutes sessions confondues). Lu seulement barrière B9-TL-8 ouverte, client branché et lieu admis.
  "photo-tri": [{ kind: "ip", windowSeconds: 3600, threshold: 40 }],
};

/** Lignes supprimées au plus par purge, les plus anciennes `expires_at` d'abord (B3-TL-6). */
export const RATE_LIMIT_PURGE_BATCH = 100;

/** Plafond de lignes surveillé d'`action_rate_limits` (amendement de 0007, point 5) : alerte, jamais limite dure. */
export const RATE_LIMIT_ROWS_ALERT = 50_000;

/** Étouffement de l'alerte `rate_limit.rows_high` : au plus une fois par processus et par 10 minutes. */
export const RATE_LIMIT_ROWS_ALERT_INTERVAL_MS = 600_000;
