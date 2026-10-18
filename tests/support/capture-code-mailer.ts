import type { CodeMailer, LoginCodeMessage } from "@/server/mail/port";

/**
 * Double de capture du port d'envoi (spécification B3, B3b point 2 ; nom fixé par la décision 0077 § 5.6), **hors de
 * `src/`** : garde les envois en mémoire du processus de test, sans rien écrire ni journaliser. `echouerAvec` simule
 * une panne de l'implémentation (l'erreur levée peut porter l'adresse dans son message : critère B13).
 */
export type CaptureCodeMailer = CodeMailer & {
  readonly envois: LoginCodeMessage[];
  /** Dernier code envoyé à `to`, ou `undefined`. */
  dernierCode(to: string): string | undefined;
  /** Erreur levée au prochain envoi (puis remise à `null`), sans rien capturer. */
  echouerAvec: Error | null;
};

export function createCaptureCodeMailer(): CaptureCodeMailer {
  const envois: LoginCodeMessage[] = [];
  const double: CaptureCodeMailer = {
    envois,
    echouerAvec: null,
    async sendLoginCode(message) {
      const erreur = double.echouerAvec;
      if (erreur !== null) {
        double.echouerAvec = null;
        throw erreur;
      }
      envois.push({ to: message.to, code: message.code, expiresInMinutes: message.expiresInMinutes });
    },
    dernierCode(to) {
      return envois.findLast((envoi) => envoi.to === to)?.code;
    },
  };
  return double;
}
