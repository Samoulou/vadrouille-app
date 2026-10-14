import { z } from "zod";

import { isEmailShape, OTP_PATTERN } from "./values";

/**
 * Connexion par code à 6 chiffres (décision 0017 § 2.4, F8b ; écran 4). La forme de l'adresse est celle de
 * `isEmailShape` (0017 § 2.1) : l'interface et le serveur acceptent exactement les mêmes adresses. Le code est fait
 * d'exactement 6 chiffres ASCII.
 */

const EmailSchema = z.string().refine(isEmailShape, "adresse mal formée");

export const CodeRequestSchema = z.strictObject({ email: EmailSchema });
export type CodeRequest = z.infer<typeof CodeRequestSchema>;

export const CodeVerificationSchema = z.strictObject({
  email: EmailSchema,
  code: z.string().regex(OTP_PATTERN),
});
export type CodeVerification = z.infer<typeof CodeVerificationSchema>;

/** Session simulée en phase 0 (0017 § 3.5) ; réelle avec B3. L'organisation est celle de la session, jamais du navigateur. */
export const SessionSchema = z.strictObject({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  organizationId: z.string().min(1),
});
export type Session = z.infer<typeof SessionSchema>;
