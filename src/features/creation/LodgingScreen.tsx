"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AreaMap } from "@/components/carte/AreaMap";
import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { LodgingSuggestion } from "@/contracts";
import { connexionRoute } from "@/features/compte/suite";
import { format, messages } from "@/i18n";
import { suggestLodging } from "@/server/actions/creation";

import { CreationShell, TITLE_CLASS } from "./CreationShell";
import { useDraft } from "./DraftProvider";
import { adjacentLodgingCity, cityKey, pendingLodgingCities, type LodgingChoice } from "./draft";
import { EMPTY_LIVE_REGION_CLASS } from "./fields";
import { creationRoutes } from "./routes";
import { toTripDraft } from "./validation";

const t = messages.creation.ecran3;

const SECTION_TITLE_CLASS = "text-section font-extrabold text-ink";

/**
 * Écran 3 « Où loger » (`R3`, F8-PO-8, décision 0017 § 1 et § 7 ; rendu 0018 § 17) : un écran par ville « Pas
 * encore », dans l'ordre des villes, sur la même adresse (la ville courante est l'état du brouillon, jamais un
 * paramètre). Sans brief validé ni ville à loger (rechargement, accès direct), l'adresse est remplacée par `R1`, qui
 * annonce « Ton brouillon n'a pas été conservé. ». « Retour » mène à l'écran 3 de la ville précédente sans
 * logement, sinon à l'écran 2 (état « Vérification »).
 */
export function LodgingScreen() {
  const router = useRouter();
  const { state, dispatch } = useDraft();
  const city = state.lodgingCity;
  const valid = state.briefReady && city !== null && pendingLodgingCities(state.trip).includes(city);
  // Le titre reçoit le focus quand la ville change sur la même adresse, jamais au premier affichage de l'écran.
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (!valid) {
      dispatch({ type: "lost" });
      router.replace(creationRoutes.nouveau());
    }
  }, [valid, dispatch, router]);

  if (!valid || city === null) return null;

  function back() {
    const previous = adjacentLodgingCity(state.trip, city as number, -1);
    if (previous === null) {
      router.push(creationRoutes.brief());
    } else {
      setMoved(true);
      dispatch({ type: "lodgingCity", city: previous });
    }
  }

  function choose(choice: LodgingChoice) {
    const next = adjacentLodgingCity(state.trip, city as number, 1);
    setMoved(next !== null);
    dispatch({ type: "lodgingChoice", city: city as number, choice, next });
    if (next === null) router.push(connexionRoute(creationRoutes.lancer()));
  }

  const name = city === 0 ? state.trip.destination.trim() : (state.trip.otherCities[city - 1]?.name.trim() ?? "");

  return (
    <CreationShell onBack={back}>
      <LodgingCity
        key={cityKey(state.trip, city)}
        city={city}
        name={name}
        focusTitle={moved}
        request={() => suggestLodging({ draft: toTripDraft(state.trip, state.lodgingChoices), city })}
        onChoose={choose}
      />
    </CreationShell>
  );
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; suggestion: LodgingSuggestion }
  | { kind: "noOption" }
  | { kind: "failed" };

interface LodgingCityProps {
  city: number;
  name: string;
  focusTitle: boolean;
  request: () => ReturnType<typeof suggestLodging>;
  onChoose: (choice: LodgingChoice) => void;
}

function LodgingCity({ name, focusTitle, request, onChoose }: LodgingCityProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Numéro de la demande en cours : une réponse arrivée après une nouvelle demande ou le démontage est ignorée.
  const attempt = useRef(0);
  const requestRef = useRef(request);

  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  /** Demande `current` ; seul le résultat de la dernière demande est écrit. */
  async function fetchSuggestion(current: number) {
    let next: Status = { kind: "failed" };
    try {
      const result = await requestRef.current();
      if (result.ok) next = { kind: "ready", suggestion: result.value };
      else if (result.error.code === "no_option") next = { kind: "noOption" };
    } catch {
      // Erreur réseau ou serveur : même bandeau qu'une erreur de la suggestion.
    }
    if (attempt.current === current) setStatus(next);
  }

  function retry() {
    attempt.current += 1;
    setStatus({ kind: "loading" });
    void fetchSuggestion(attempt.current);
  }

  useEffect(() => {
    // Une demande à l'arrivée sur la ville (état initial « attente ») ; « Réessayer » la relance.
    attempt.current += 1;
    void fetchSuggestion(attempt.current);
    return () => {
      attempt.current += 1;
    };
  }, []);

  const statusText = status.kind === "loading" ? t.attente : status.kind === "noOption" ? t.aucunQuartier : null;
  const withoutLodging = () => onChoose({ kind: "none" });

  return (
    <>
      <h1 ref={titleRef} tabIndex={-1} className={TITLE_CLASS}>
        {format(t.titre, { ville: name })}
      </h1>
      {status.kind === "loading" ? <Skeleton /> : null}
      {/* Attente puis « aucun quartier » : région présente dès l'affichage, texte visible (0018 § 17). */}
      <p role="status" className={statusText ? "text-corps text-ink-2" : EMPTY_LIVE_REGION_CLASS}>
        {statusText}
      </p>
      <div role="alert" className={status.kind === "failed" ? undefined : EMPTY_LIVE_REGION_CLASS}>
        {status.kind === "failed" ? (
          <StatusBanner
            kind="error"
            announce={false}
            message={t.echec}
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={retry}>
                  {t.reessayer}
                </Button>
                <Button variant="text" size="sm" onClick={withoutLodging}>
                  {t.continuerSansLogement}
                </Button>
              </div>
            }
          />
        ) : null}
      </div>
      {status.kind === "noOption" ? (
        <Button variant="secondary" className="w-full" onClick={withoutLodging}>
          {t.continuerSansLogement}
        </Button>
      ) : null}
      {status.kind === "ready" ? <Suggestion suggestion={status.suggestion} onChoose={onChoose} /> : null}
    </>
  );
}

/** Squelette immobile de la forme du contenu attendu (0018, « Attente ») : quartier, carte, deux logements. */
function Skeleton() {
  return (
    <div aria-hidden="true" data-part="squelette" className="flex flex-col gap-3">
      <div className="h-6 w-1/2 rounded-block bg-muted" />
      <div className="h-5 w-full rounded-block bg-muted" />
      <div className="aspect-video w-full rounded-block bg-muted" />
      <div className="h-24 w-full rounded-block bg-muted" />
      <div className="h-24 w-full rounded-block bg-muted" />
    </div>
  );
}

function Suggestion({ suggestion, onChoose }: { suggestion: LodgingSuggestion; onChoose: (choice: LodgingChoice) => void }) {
  const { area, lodgings } = suggestion;
  return (
    <>
      <section aria-labelledby="quartier-titre" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-corps-s text-ink-soft">{t.quartierConseille}</p>
          <h2 id="quartier-titre" className={SECTION_TITLE_CLASS}>
            {area.name}
          </h2>
        </div>
        <p className="text-corps text-ink-2">{area.reason}</p>
        <AreaMap center={area.center} radiusM={area.radiusM} name={area.name} />
      </section>
      {lodgings.length > 0 ? (
        <section aria-labelledby="logements-titre" className="flex flex-col gap-3">
          <h2 id="logements-titre" className={SECTION_TITLE_CLASS}>
            {t.logements}
          </h2>
          <ul className="flex flex-col gap-3">
            {lodgings.map((lodging) => (
              <li key={lodging.lodgingId} className="flex flex-col gap-3 rounded-block border border-outline bg-raised p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-arret font-bold text-ink">{lodging.name}</p>
                  <p className="text-corps-s text-ink-soft">{lodging.meta}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  aria-label={format(t.choisirNom, { nom: lodging.name })}
                  onClick={() =>
                    onChoose({
                      kind: "suggestedLodging",
                      lodgingId: lodging.lodgingId,
                      ...(lodging.placeId ? { placeId: lodging.placeId } : {}),
                    })
                  }
                >
                  {t.choisir}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Button className="mt-8 w-full" onClick={() => onChoose({ kind: "suggestedArea", areaId: area.areaId })}>
        {t.partirDuQuartier}
      </Button>
    </>
  );
}
