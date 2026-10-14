"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { OtpInput } from "@/components/ligne/OtpInput";
import { EMAIL_MAX_LENGTH, OTP_LENGTH, isEmailShape, type ApiErrorCode, type AuthMode } from "@/contracts/values";
import { CreationShell, TITLE_CLASS } from "@/features/creation/CreationShell";
import { useDraft } from "@/features/creation/DraftProvider";
import { describedBy, EMPTY_LIVE_REGION_CLASS, errorId, FieldLabel, FieldMessage, INPUT_CLASS } from "@/features/creation/fields";
import { creationRoutes } from "@/features/creation/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { requestCode, verifyCode } from "@/server/actions/compte";

const t = messages.connexion;

const EMAIL_ID = "champ-email";
const CODE_ALERT_ID = "code-alerte";

/** Erreurs de l'écran 4 qui ont leur propre texte ; toute autre a le texte générique. */
type SignInError = "invalid_code" | "code_expired" | "too_many_attempts" | "rate_limited" | "generique";

function signInError(code: ApiErrorCode): SignInError {
  return code === "invalid_code" || code === "code_expired" || code === "too_many_attempts" || code === "rate_limited" ? code : "generique";
}

export interface SignInFormProps {
  /** Valeur de `suite` déjà normalisée par `normaliserSuite` (liste blanche, jamais la valeur brute). */
  suite: string;
  /** Durée de validité du code, lue dans la configuration de l'adaptateur `auth` (jamais en dur). */
  codeTtlMs: number;
  /** Valeur serveur : l'avertissement de la connexion simulée n'est jamais déduit côté client (0017 § 3.5). */
  authMode: AuthMode;
}

/**
 * Écran 4 « Compte » (`R4`, F8-PO-9 à F8-PO-11 ; rendu 0018 § 18) : email puis code sur la même adresse. La
 * vérification part d'elle-même au sixième chiffre (pas de bouton « Valider ») ; à la réussite, l'adresse est
 * remplacée par la cible de `suite` (le retour du navigateur ne ramène pas au formulaire de code). Les régions
 * `role="status"` et `role="alert"` de chaque étape sont présentes dès son affichage. L'email et le code restent en
 * mémoire de l'onglet : ni stockage, ni adresse, ni journal, ni mesure.
 */
export function SignInForm({ suite, codeTtlMs, authMode }: SignInFormProps) {
  const router = useRouter();
  const { state } = useDraft();
  const fromCreation = suite === creationRoutes.lancer();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");

  function back() {
    // Depuis la création : dernier écran 3 affiché, sinon écran 2 (« Vérification »), jamais `R-lancer` (F8-PO-2).
    if (!fromCreation) router.push(creationRoutes.mesVoyages());
    else router.push(state.lodgingCity !== null ? creationRoutes.logement() : creationRoutes.brief());
  }

  return (
    <CreationShell onBack={back}>
      <h1 className={TITLE_CLASS}>{fromCreation ? t.titreCreation : t.titre}</h1>
      <p className="text-corps text-ink-soft">{t.aide}</p>
      {authMode === "simulated" ? (
        <p data-part="connexion-simulee" className="rounded-block bg-muted p-4 text-corps-s text-ink-2">
          {t.simulee}
        </p>
      ) : null}
      {step === "email" ? (
        <EmailStep
          email={email}
          onEmailChange={setEmail}
          onSent={(sent) => {
            setEmail(sent);
            setStep("code");
          }}
        />
      ) : (
        <CodeStep
          email={email}
          minutes={Math.round(codeTtlMs / 60_000)}
          onSignedIn={() => router.replace(suite)}
          onChangeAddress={() => setStep("email")}
        />
      )}
    </CreationShell>
  );
}

interface EmailStepProps {
  email: string;
  onEmailChange: (email: string) => void;
  onSent: (email: string) => void;
}

function EmailStep({ email, onEmailChange, onSent }: EmailStepProps) {
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<SignInError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    // Remis à `true` à chaque montage : sous StrictMode, React monte, démonte puis remonte le composant.
    mounted.current = true;
    // « Changer d'adresse » : retour à l'étape email, adresse conservée, focus sur le champ.
    if (email) inputRef.current?.focus();
    return () => {
      mounted.current = false;
    };
    // Au montage seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (pending) return;
    const value = email.trim();
    if (!isEmailShape(value)) {
      setInvalid(true);
      setAlert(null);
      inputRef.current?.focus();
      return;
    }
    setInvalid(false);
    setAlert(null);
    setPending(true);
    let error: SignInError = "generique";
    try {
      const result = await requestCode({ email: value });
      if (!mounted.current) return;
      if (result.ok) {
        onSent(value);
        return;
      }
      error = signInError(result.error.code);
    } catch {
      // Erreur réseau ou serveur : texte générique.
    }
    if (!mounted.current) return;
    setPending(false);
    setAlert(error);
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={EMAIL_ID}>{t.email.libelle}</FieldLabel>
        <input
          ref={inputRef}
          id={EMAIL_ID}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={EMAIL_MAX_LENGTH}
          value={email}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(invalid && errorId(EMAIL_ID))}
          onChange={(event) => onEmailChange(event.target.value)}
          className={INPUT_CLASS}
        />
        <FieldMessage id={errorId(EMAIL_ID)} message={invalid ? t.email.erreur : null} />
      </div>
      <div role="alert" className={alert ? "text-corps-s font-semibold text-ink" : EMPTY_LIVE_REGION_CLASS}>
        {alert ? t.erreurs[alert] : null}
      </div>
      <div role="status" className={EMPTY_LIVE_REGION_CLASS} />
      <Button
        type="submit"
        className="mt-2 w-full aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-ink-soft"
        aria-disabled={pending || undefined}
      >
        {t.email.recevoir}
      </Button>
    </form>
  );
}

interface CodeStepProps {
  email: string;
  minutes: number;
  onSignedIn: () => void;
  onChangeAddress: () => void;
}

function CodeStep({ email, minutes, onSignedIn, onChangeAddress }: CodeStepProps) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState<"verification" | "nouveauCode" | null>(null);
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

  async function verify(code: string) {
    if (busy.current) return;
    busy.current = true;
    setVerifying(true);
    setError(null);
    setStatus("verification");
    let next: SignInError = "generique";
    try {
      const result = await verifyCode({ email, code });
      if (!mounted.current) return;
      if (result.ok) {
        onSignedIn();
        return;
      }
      next = signInError(result.error.code);
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

  async function resend() {
    if (busy.current) return;
    busy.current = true;
    setStatus(null);
    let next: SignInError | null = "generique";
    try {
      const result = await requestCode({ email });
      if (!mounted.current) return;
      next = result.ok ? null : signInError(result.error.code);
    } catch {
      // Erreur réseau ou serveur : texte générique.
    }
    busy.current = false;
    if (!mounted.current) return;
    setError(next);
    if (next === null) {
      // Nouveau code : l'ancien est invalidé, les essais repartent de zéro (F8-PO-9).
      setLocked(false);
      setStatus("nouveauCode");
      setRound((value) => value + 1);
    }
  }

  const codeError = error === "invalid_code" || error === "code_expired" || error === "too_many_attempts";

  return (
    <div className="flex flex-col gap-6">
      <p className="text-corps text-ink-2">
        {t.code.envoyeAvant} <span className="font-bold break-all">{email}</span>
        {format(t.code.envoyeApres, { minutes })}
      </p>
      <div className="flex flex-col gap-2">
        <OtpInput
          key={round}
          length={OTP_LENGTH}
          label={t.code.libelle}
          labelVisible
          autoFocus
          disabled={verifying || locked}
          invalid={codeError}
          describedBy={error ? CODE_ALERT_ID : undefined}
          onComplete={(code) => void verify(code)}
        />
        {/* Régions présentes dès l'affichage de l'étape code, sous les cases (0018 § 18) ; texte rendu une seule fois. */}
        <p role="status" className={status ? "text-corps-s text-ink-soft" : EMPTY_LIVE_REGION_CLASS}>
          {status ? t.code[status] : null}
        </p>
        <p id={CODE_ALERT_ID} role="alert" className={cn(error ? "text-corps-s font-semibold text-ink" : EMPTY_LIVE_REGION_CLASS)}>
          {error ? t.erreurs[error] : null}
        </p>
      </div>
      {/* `-ml-2` compense le `px-2` des boutons `text` : le texte s'aligne sur la marge de la colonne. */}
      <div className="-ml-2 flex flex-wrap gap-x-4 gap-y-2">
        <Button ref={resendRef} variant="text" size="sm" onClick={() => void resend()}>
          {t.code.renvoyer}
        </Button>
        <Button variant="text" size="sm" onClick={onChangeAddress}>
          {t.code.changerAdresse}
        </Button>
      </div>
    </div>
  );
}
