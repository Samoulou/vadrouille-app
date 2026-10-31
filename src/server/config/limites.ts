import "server-only";

/**
 * Configuration du limiteur maison (spécification B3, B3a point 6 ; décision 0050, B3-TL-6 et amendement de 0007),
 * lue côté serveur seulement, sur le modèle de `offer.ts`. Seuils et durées ne sont jamais codés dans une action.
 *
 * Valeurs de départ : **reprises** de la décision 0008 (B3-PO-6), aucune n'est fixée par le studio ; seuils réels :
 * Q86 (Tech Lead, Sécurité). Compartiment commun (`no-trusted-ip`) : seuils d'une seule adresse IP de l'action.
 */

/**
 * Espèce d'une règle : par clé d'adresse IP (ou compartiment commun), par adresse e-mail canonique, ou par voyage
 * (`trip`, décision 0147 § 6.4 point 1 : identifiant `uuid` du voyage, contrôlé dans l'organisation avant le limiteur).
 */
export type RateLimitKind = "ip" | "email" | "trip";

/** Une règle : au plus `threshold` appels admis par fenêtre fixe de `windowSeconds` secondes (horloge de la base). */
export type RateLimitRule = { readonly kind: RateLimitKind; readonly windowSeconds: number; readonly threshold: number };

/**
 * Règles par nom d'action (`^[a-z][a-z0-9-]{0,47}$`), dans l'ordre fixe d'évaluation : adresse IP, puis e-mail, puis voyage
 * (0147 § 6.4 point 1), chaque espèce dans l'ordre de la configuration.
 */
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
  // M5c (décision 0147 § 6.4 point 2 et § 12 S5) : signalement d'une erreur sur une étape (`reportStop`), 10 par minute et
  // par adresse IP (proposition). Vérifié après le doublon, avant le plafond par voyage et par jour UTC
  // (`SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR`, `src/server/config/lieux.ts`) : un signalement rejoué n'est jamais refusé.
  signalement: [{ kind: "ip", windowSeconds: 60, threshold: 10 }],
  // M5a (décision 0147 § 6.4 point 4 et § 12 S5, mineur 11 de sa revue, arbitrage du CEO) : retouches de la personne,
  // 60 gestes par heure et par adresse IP (proposition), communs à `lockStop`, `unlockStop`, à l'aperçu et à l'application
  // d'un ajout, à `listTripVersions`, `previewRevert`, `applyRevert` (et au déplacement quand il viendra sur `api`).
  // Vérifié après le contrôle du voyage dans l'organisation et du déblocage, avant toute relecture ou écriture.
  retouche: [{ kind: "ip", windowSeconds: 3600, threshold: 60 }],
  // M5d-1 (décision 0147 § 6.4 point 1 et § 12 S5) : recherche d'un lieu à soi (`searchPlaces`), 5 par minute et par adresse
  // IP, puis 20 par voyage et par 24 heures (fenêtre fixe partie de la première recherche, écart assumé avec « par jour »).
  // Propositions. Vérifié après le contrôle du voyage dans l'organisation et du déblocage, avant le compteur global du jour.
  "lieu-recherche": [
    { kind: "ip", windowSeconds: 60, threshold: 5 },
    { kind: "trip", windowSeconds: 86_400, threshold: 20 },
  ],
  // M6b (ticket 1005 ; décision 0157 § 1.6 point 2 et § 2.5, S5 confirmée) : téléchargement du fichier `.ics`, 30 par heure
  // et par voyage (proposition). La route a une session : l'espèce `trip` ne dépend pas de l'en-tête d'adresse, et le
  // compte ne se partage pas entre personnes. Vérifié après la session et le contrôle du voyage dans l'organisation, avant
  // la lecture de la version ; `api` seulement (limiteur en base).
  calendrier: [{ kind: "trip", windowSeconds: 3600, threshold: 30 }],
};

/** Lignes supprimées au plus par purge, les plus anciennes `expires_at` d'abord (B3-TL-6). */
export const RATE_LIMIT_PURGE_BATCH = 100;

/** Plafond de lignes surveillé d'`action_rate_limits` (amendement de 0007, point 5) : alerte, jamais limite dure. */
export const RATE_LIMIT_ROWS_ALERT = 50_000;

/** Étouffement de l'alerte `rate_limit.rows_high` : au plus une fois par processus et par 10 minutes. */
export const RATE_LIMIT_ROWS_ALERT_INTERVAL_MS = 600_000;
