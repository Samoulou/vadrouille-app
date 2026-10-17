import { z } from "zod";

import { EMAIL_INPUT_MAX_LENGTH, isEmailShape, OTP_PATTERN, stripEdgeSpaces } from "./values";

/**
 * Connexion par code à 6 chiffres (décision 0017 § 2.4, F8b ; écran 4). La forme de l'adresse est celle de
 * `isEmailShape` (0017 § 2.1) : l'interface et le serveur acceptent exactement les mêmes adresses. Le code est fait
 * d'exactement 6 chiffres ASCII.
 *
 * Décision 0084 (amendement de `src/contracts` pour ce seul point ; critères C3 et C5 de la spécification B3) : le
 * contrat tolère les espaces U+0020 aux extrémités de l'adresse, et eux seuls (`stripEdgeSpaces`), puis applique
 * `isEmailShape` ; l'entrée brute est bornée à `EMAIL_INPUT_MAX_LENGTH` (320). Le schéma **ne transforme pas** la
 * valeur : elle arrive intacte à l'adaptateur, où `parseEmailAddress` (seul producteur de `CanonicalEmail`) retire ces
 * espaces avant le limiteur, Better Auth et le port d'envoi.
 */

const EmailSchema = z
  .string()
  .max(EMAIL_INPUT_MAX_LENGTH)
  .refine((value) => isEmailShape(stripEdgeSpaces(value)), "adresse mal formée");

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
