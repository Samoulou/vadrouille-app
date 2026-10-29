import "server-only";

/**
 * Adresse d'expédition des e-mails du code de connexion par le transport SMTP vers Mailpit (spécification B3b-envoi,
 * point 4.6). Constante de phase 0, en `exemple.test` : aucun domaine d'envoi réel.
 */
export const SENDER_ADDRESS = "connexion@exemple.test";

/**
 * Adresse d'expédition du transport Resend (spécification B3d, point 7 et B3d-PO-5 ; décision 0138) : adresse de test de
 * Resend tant qu'aucun domaine n'est vérifié (Q640, étape 10). Aucun nom d'affichage, aucune adresse de réponse. Chaque
 * transport choisit la sienne : `SENDER_ADDRESS` pour Mailpit, celle-ci pour Resend.
 */
export const RESEND_SENDER_ADDRESS = "onboarding@resend.dev";

/**
 * Plafond global quotidien des envois (spécification B3d, point 3 ; décision 0138 § 11, T1 et T2) : usages en liste
 * fermée, jour civil UTC à l'horloge de la base (B3d-PO-1). Un envoi d'un usage n'est réservé que si le total du jour,
 * tous usages confondus, est inférieur au seuil de cet usage : 100 pour la connexion (Q354, tranchée), 80 pour les
 * notifications (recommandation soumise à Samuel, Q641 ; B3d-PO-3). Seules ces valeurs changent si Samuel refuse le
 * partage.
 */
export const EMAIL_USAGES = ["connexion", "notification"] as const;
export type EmailUsage = (typeof EMAIL_USAGES)[number];

/** Plafond total du jour, tous usages confondus (Q354). */
export const EMAIL_DAILY_CAP = 100;
/** Seuil des notifications : réservées seulement tant que le total du jour est inférieur à 80 (Q641, B3d-PO-3). */
export const EMAIL_NOTIFICATION_THRESHOLD = 80;

/** Seuil de réservation de chaque usage : le total du jour doit lui être inférieur. */
export const EMAIL_THRESHOLDS: Readonly<Record<EmailUsage, number>> = Object.freeze({
  connexion: EMAIL_DAILY_CAP,
  notification: EMAIL_NOTIFICATION_THRESHOLD,
});

/** Jours gardés avant la purge : une ligne de plus de 7 jours est supprimée à l'écriture (décision 0138 § 11, T1). */
export const EMAIL_COUNTS_RETENTION_DAYS = 7;
