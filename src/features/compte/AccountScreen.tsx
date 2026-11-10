"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { CreationShell, TITLE_CLASS } from "@/features/creation/CreationShell";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import { ARIA_DISABLED } from "@/features/sejour/aria-disabled";
import { mesVoyagesRoute } from "@/features/sejour/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { deleteAccount, hasRecentSignIn, signOut } from "@/server/actions/compte";

import { DeleteConfirmation, DeleteExplanation, type DeleteIssue } from "./DeleteAccountScreen";
import { demanderExport, enregistrerFichier, quitterVers } from "./export-client";
import { ReauthStep } from "./ReauthStep";
import { accueilApresSuppressionRoute, accueilRoute, compteRoute } from "./routes";
import { connexionRoute } from "./suite";

const t = messages.compte;

export interface AccountScreenProps {
  /** Adresse de la session, lue par la page (jamais une valeur du navigateur). */
  email: string;
  /**
   * Valeur serveur : vrai hors de `api` avec la connexion réelle. L'export télécharge alors le fichier du jeu simulé et la
   * suppression n'est pas proposée (spécification M9 § 6.4, critère 10).
   */
  simulated: boolean;
}

/** Étape affichée ; l'action choisie reste en mémoire pendant le code (§ 1.3 point 3). */
type Vue = { nom: "compte" } | { nom: "code"; pour: "export" | "suppression" } | { nom: "explication" } | { nom: "confirmation" };

type EtatExport = "pret" | "limite" | "erreur" | null;

/**
 * « Ton compte » (M9c, ticket 1122 ; spécification M9 § 1.3, § 6.4 et § 7 ; M9-PO-5 à M9-PO-9) : l'adresse de la session,
 * « Exporter mes données », « Supprimer mon compte » et « Se déconnecter ». Les étapes (code, explication, confirmation)
 * s'affichent à la même adresse, en mémoire de l'onglet ; le focus va sur le titre de chaque étape.
 *
 * - **Export** : connexion récente, le téléchargement démarre sans écran de plus ; sinon « Confirme que c'est toi », puis
 *   le téléchargement repart de lui-même après un code juste.
 * - **Suppression** : explication, puis le code si la connexion n'est pas récente (`hasRecentSignIn`), puis « Supprimer
 *   définitivement ». `reauthentication_required` reçu à ce moment ramène au code, sans rien supprimer ; paiement en
 *   attente : le texte, sans bouton de suppression.
 * - **Sortie** (déconnexion, compte supprimé, session absente) : chargement complet de la page d'arrivée
 *   (`quitterVers`). L'action vient d'effacer le cookie de session : une navigation du routeur concourrait avec le
 *   nouveau rendu de cette page, qui redirige vers la connexion faute de session.
 * - Hors ligne : bandeau ; les actions qui demandent le réseau sont en `aria-disabled="true"` ; « Garder mon compte »
 *   reste actif. Aucun événement de mesure, aucun stockage du navigateur.
 *
 * Rendu provisoire en composants Ligne existants (U1 à U3 : à valider par l'UX/UI).
 */
export function AccountScreen({ email, simulated }: AccountScreenProps) {
  const online = useOnline();
  const id = useId();
  const offlineId = `${id}-hors-ligne`;
  const exportAideId = `${id}-export-aide`;
  const suppressionAideId = `${id}-suppression-aide`;
  const [vue, setVue] = useState<Vue>({ nom: "compte" });
  const [exportEtat, setExportEtat] = useState<EtatExport>(null);
  const [suppression, setSuppression] = useState<DeleteIssue | null>(null);
  const [sortieEnEchec, setSortieEnEchec] = useState(false);
  /** Demande en cours, pour le retour visible et annoncé (le verrou reste `busy`). */
  const [enCours, setEnCours] = useState<"export" | "continuer" | "suppression" | null>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const premiere = useRef(true);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    // Remis à `true` à chaque montage : sous StrictMode, React monte, démonte puis remonte le composant.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Focus sur le titre de chaque étape (critère 8), sauf à l'ouverture de la page.
    if (premiere.current) {
      premiere.current = false;
      return;
    }
    titre.current?.focus();
  }, [vue]);

  async function exporter() {
    if (busy.current || !online) return;
    busy.current = true;
    setExportEtat(null);
    setEnCours("export");
    const issue = await demanderExport();
    busy.current = false;
    if (!mounted.current) return;
    setEnCours(null);
    if (issue.kind === "fichier") {
      enregistrerFichier(issue.nom, issue.contenu);
      setExportEtat("pret");
    } else if (issue.kind === "reauthentification") setVue({ nom: "code", pour: "export" });
    else if (issue.kind === "session") quitterVers(connexionRoute(compteRoute()));
    else setExportEtat(issue.kind);
  }

  async function continuer() {
    if (busy.current || !online) return;
    busy.current = true;
    setEnCours("continuer");
    let recente = false;
    try {
      recente = await hasRecentSignIn();
    } catch {
      // Erreur réseau ou serveur : le code est demandé.
    }
    busy.current = false;
    if (!mounted.current) return;
    setEnCours(null);
    setVue(recente ? { nom: "confirmation" } : { nom: "code", pour: "suppression" });
  }

  async function supprimer() {
    if (busy.current || !online) return;
    busy.current = true;
    setSuppression(null);
    setEnCours("suppression");
    let issue: "supprime" | "session" | "code" | DeleteIssue = "erreur";
    try {
      const result = await deleteAccount();
      if (result.ok) issue = "supprime";
      else if (result.error.code === "unauthenticated") issue = "session";
      else if (result.error.code === "reauthentication_required") issue = "code";
      else if (result.error.code === "payment_pending") issue = "paiement";
      else if (result.error.code === "rate_limited") issue = "limite";
    } catch {
      // Erreur réseau ou serveur : « Impossible de supprimer ton compte pour le moment. »
    }
    busy.current = false;
    if (!mounted.current) return;
    // Compte supprimé : l'état en cours reste jusqu'au chargement de l'accueil.
    if (issue !== "supprime") setEnCours(null);
    if (issue === "supprime") quitterVers(accueilApresSuppressionRoute());
    // Second onglet après la suppression (§ 4.3 point 2) : plus de session, l'écran mène à l'accueil.
    else if (issue === "session") quitterVers(accueilRoute());
    // Les 10 minutes ont expiré (critère 5) : retour au code, rien n'est supprimé.
    else if (issue === "code") setVue({ nom: "code", pour: "suppression" });
    else setSuppression(issue);
  }

  async function deconnecter() {
    if (busy.current) return;
    busy.current = true;
    setSortieEnEchec(false);
    let sortie = false;
    try {
      sortie = (await signOut()).ok;
    } catch {
      // Erreur réseau ou serveur : message, la personne reste connectée.
    }
    busy.current = false;
    if (!mounted.current) return;
    if (sortie) quitterVers(accueilRoute());
    else setSortieEnEchec(true);
  }

  function retourAuCompte() {
    setSuppression(null);
    setVue({ nom: "compte" });
  }

  if (vue.nom === "code") {
    const pour = vue.pour;
    return (
      <CreationShell onBack={() => setVue(pour === "suppression" ? { nom: "explication" } : { nom: "compte" })}>
        <ReauthStep
          email={email}
          titleRef={titre}
          onDone={() => {
            if (pour === "suppression") {
              setVue({ nom: "confirmation" });
              return;
            }
            // Retour à l'action choisie : le téléchargement démarre sans la choisir de nouveau (§ 1.3 point 3).
            setVue({ nom: "compte" });
            void exporter();
          }}
        />
      </CreationShell>
    );
  }

  if (vue.nom === "explication") {
    return (
      <CreationShell onBack={retourAuCompte}>
        <DeleteExplanation titleRef={titre} online={online} onKeep={retourAuCompte} pending={enCours === "continuer"} onContinue={() => void continuer()} />
      </CreationShell>
    );
  }

  if (vue.nom === "confirmation") {
    return (
      <CreationShell onBack={retourAuCompte}>
        <DeleteConfirmation
          titleRef={titre}
          online={online}
          onKeep={retourAuCompte}
          pending={enCours === "suppression"}
          onDelete={() => void supprimer()}
          issue={suppression}
          email={email}
        />
      </CreationShell>
    );
  }

  return (
    <CreationShell backHref={mesVoyagesRoute()}>
      <h1 ref={titre} tabIndex={-1} className={TITLE_CLASS}>
        {t.titre}
      </h1>
      <p data-part="adresse" className="text-corps text-ink-2 wrap-anywhere">
        {format(t.adresse, { email })}
      </p>
      {online ? null : (
        <div id={offlineId}>
          <StatusBanner kind="offline" message={t.horsLigne} />
        </div>
      )}

      <div data-part="export" className="flex flex-col gap-2 border-t border-hairline pt-6">
        <Button
          variant="secondary"
          className={cn("w-full", ARIA_DISABLED)}
          aria-disabled={online && enCours !== "export" ? undefined : true}
          aria-describedby={online ? exportAideId : `${exportAideId} ${offlineId}`}
          onClick={() => void exporter()}
        >
          {t.export.bouton}
        </Button>
        <p id={exportAideId} className="text-corps-s text-ink-soft">
          {t.export.aide}
        </p>
        {/* Région présente dès l'affichage ; texte rendu une seule fois (« Préparation… », puis « Ton fichier est prêt. »). */}
        <p
          role="status"
          className={exportEtat === "pret" ? "text-corps-s font-semibold text-ink" : enCours === "export" ? "text-corps-s text-ink-soft" : EMPTY_LIVE_REGION_CLASS}
        >
          {exportEtat === "pret" ? t.export.pret : enCours === "export" ? t.export.enCours : null}
        </p>
        {exportEtat === "limite" ? <StatusBanner kind="error" message={messages.connexion.erreurs.rate_limited} /> : null}
        {exportEtat === "erreur" ? (
          <StatusBanner
            kind="error"
            message={t.export.erreur}
            action={
              <Button variant="text" size="sm" className="-ml-2" onClick={() => void exporter()}>
                {t.export.reessayer}
              </Button>
            }
          />
        ) : null}
      </div>

      <div data-part="suppression" className="flex flex-col gap-2 border-t border-hairline pt-6">
        {simulated ? (
          <>
            <p className="text-corps font-bold text-ink">{t.suppression.bouton}</p>
            <p data-part="suppression-simulee" className="text-corps-s text-ink-soft">
              {t.suppression.simulee}
            </p>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className={cn("w-full", ARIA_DISABLED)}
              aria-disabled={online ? undefined : true}
              aria-describedby={online ? suppressionAideId : `${suppressionAideId} ${offlineId}`}
              onClick={() => {
                if (online) setVue({ nom: "explication" });
              }}
            >
              {t.suppression.bouton}
            </Button>
            <p id={suppressionAideId} className="text-corps-s text-ink-soft">
              {t.suppression.aide}
            </p>
          </>
        )}
      </div>

      <div data-part="deconnexion" className="flex flex-col gap-2 border-t border-hairline pt-6">
        <Button variant="secondary" className="w-full" onClick={() => void deconnecter()}>
          {t.deconnexion.bouton}
        </Button>
        {sortieEnEchec ? <StatusBanner kind="error" message={t.deconnexion.erreur} /> : null}
      </div>
    </CreationShell>
  );
}
