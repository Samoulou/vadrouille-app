"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ligne/Button";
import { OtpInput } from "@/components/ligne/OtpInput";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { OTP_LENGTH, type ApiErrorCode } from "@/contracts/values";
import { TITLE_CLASS } from "@/features/creation/CreationShell";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import { ARIA_DISABLED } from "@/features/sejour/aria-disabled";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { requestCode, verifyCode } from "@/server/actions/compte";

const t = messages.compte.reauthentification;
const c = messages.connexion;

/** Erreurs qui ont leur propre texte, celles de `/connexion` (spécification M9 § 1.3 point 2) ; toute autre : texte générique. */
type ErreurCode = "invalid_code" | "code_expired" | "too_many_attempts" | "rate_limited" | "generique";

function erreurDe(code: ApiErrorCode): ErreurCode {
  return code === "invalid_code" || code === "code_expired" || code === "too_many_attempts" || code === "rate_limited" ? code : "generique";
}

export interface ReauthStepProps {
  /** Adresse de la session, lue par la page : affichée, jamais modifiable (§ 1.3 point 2). */
  email: string;
  /** Titre de l'étape : l'écran y pose le focus à l'affichage. */
  titleRef: RefObject<HTMLHeadingElement | null>;
  /** Code juste : la personne revient à l'action qu'elle avait choisie (§ 1.3 point 3). */
  onDone: () => void;
}

/**
 * « Confirme que c'est toi » (M9c, ticket 1122 ; spécification M9 § 1.3, § 6.4 critères 3, 5 et 7, § 7) : l'export et la
 * suppression exigent une vérification de code de moins de 10 minutes. « Recevoir un code » envoie le code à l'adresse de
 * la session (`requestCode`, mêmes limites que `/connexion`), puis la personne le saisit (`OtpInput`, vérification au
 * sixième chiffre, `verifyCode`) : un code juste ouvre une nouvelle session, récente. Messages d'erreur de `/connexion`.
 * Hors ligne : bandeau, « Recevoir un code » en `aria-disabled="true"`. L'adresse et le code restent en mémoire de
 * l'onglet : ni stockage, ni journal, ni mesure.
 */
export function ReauthStep({ email, titleRef, onDone }: ReauthStepProps) {
  const online = useOnline();
  const id = useId();
  const offlineId = `${id}-hors-ligne`;
  const alertId = `${id}-alerte`;
  const [phase, setPhase] = useState<"demande" | "code">("demande");
  const [error, setError] = useState<ErreurCode | null>(null);
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState<"verification" | "nouveauCode" | null>(null);
  const [verifying, setVerifying] = useState(false);
  // Nouvelle `key` d'`OtpInput` : cases vidées et focus sur la première.
  const [round, setRound] = useState(0);
  const resendRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    // Remis à `true` à chaque montage : sous StrictMode, React monte, démonte puis remonte le composant.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Envoi du code : premier envoi (« Recevoir un code ») ou « Renvoyer le code ». */
  async function send(resend: boolean) {
    if (busy.current || !online) return;
    busy.current = true;
    setStatus(null);
    let next: ErreurCode | null = "generique";
    try {
      const result = await requestCode({ email });
      if (!mounted.current) return;
      next = result.ok ? null : erreurDe(result.error.code);
    } catch {
      // Erreur réseau ou serveur : texte générique.
    }
    busy.current = false;
    if (!mounted.current) return;
    setError(next);
    if (next !== null) return;
    // Nouveau code : l'ancien est invalidé, les essais repartent de zéro.
    setLocked(false);
    setPhase("code");
    if (resend) {
      setStatus("nouveauCode");
      setRound((value) => value + 1);
    }
  }

  async function verify(code: string) {
    if (busy.current) return;
    busy.current = true;
    setVerifying(true);
    setError(null);
    setStatus("verification");
    let next: ErreurCode = "generique";
    try {
      const result = await verifyCode({ email, code });
      if (!mounted.current) return;
      if (result.ok) {
        busy.current = false;
        onDone();
        return;
      }
      next = erreurDe(result.error.code);
    } catch {
      // Erreur réseau ou serveur : texte générique.
    }
    busy.current = false;
    if (!mounted.current) return;
    setVerifying(false);
    setStatus(null);
    setError(next);
    if (next === "too_many_attempts") {
      // Cases désactivées jusqu'à « Renvoyer le code » : le focus va sur ce bouton.
      setLocked(true);
      requestAnimationFrame(() => resendRef.current?.focus());
    } else {
      // Code faux ou expiré : cases vidées, focus sur la première.
      setRound((value) => value + 1);
    }
  }

  const codeError = error === "invalid_code" || error === "code_expired" || error === "too_many_attempts";

  return (
    <div data-part="reauthentification" className="flex flex-col gap-6">
      <h1 ref={titleRef} tabIndex={-1} className={TITLE_CLASS}>
        {t.titre}
      </h1>
      <p className="text-corps text-ink-2 wrap-anywhere">{format(t.texte, { email })}</p>
      {online ? null : (
        <div id={offlineId}>
          <StatusBanner kind="offline" message={messages.compte.horsLigne} />
        </div>
      )}
      {phase === "demande" ? (
        <>
          <p role="alert" className={error ? "text-corps-s font-semibold text-ink" : EMPTY_LIVE_REGION_CLASS}>
            {error ? c.erreurs[error] : null}
          </p>
          <Button
            className={cn("w-full", ARIA_DISABLED)}
            aria-disabled={online ? undefined : true}
            aria-describedby={online ? undefined : offlineId}
            onClick={() => void send(false)}
          >
            {t.recevoir}
          </Button>
        </>
      ) : (
        <>
          <p className="text-corps text-ink-2">{t.saisie}</p>
          <div className="flex flex-col gap-2">
            <OtpInput
              key={round}
              length={OTP_LENGTH}
              label={c.code.libelle}
              labelVisible
              autoFocus
              disabled={verifying || locked}
              invalid={codeError}
              describedBy={error ? alertId : undefined}
              onComplete={(code) => void verify(code)}
            />
            {/* Régions présentes dès l'affichage de l'étape, sous les cases (0018 § 18) ; texte rendu une seule fois. */}
            <p role="status" className={status ? "text-corps-s text-ink-soft" : EMPTY_LIVE_REGION_CLASS}>
              {status ? c.code[status] : null}
            </p>
            <p id={alertId} role="alert" className={error ? "text-corps-s font-semibold text-ink" : EMPTY_LIVE_REGION_CLASS}>
              {error ? c.erreurs[error] : null}
            </p>
          </div>
          {/* `-ml-2` compense le `px-2` du bouton `text` : le texte s'aligne sur la marge de la colonne. */}
          <div className="-ml-2">
            <Button
              ref={resendRef}
              variant="text"
              size="sm"
              className="aria-disabled:cursor-not-allowed aria-disabled:text-ink-soft"
              aria-disabled={online ? undefined : true}
              aria-describedby={online ? undefined : offlineId}
              onClick={() => void send(true)}
            >
              {c.code.renvoyer}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
