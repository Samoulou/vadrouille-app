"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ligne/Button";
import { SegmentedControl } from "@/components/ligne/SegmentedControl";
import { IconPlus } from "@/components/ligne/icons";
import {
  AREA_LENGTH,
  CITY_NAME_LENGTH,
  COMMITMENT_KINDS,
  COMMITMENT_LABEL_LENGTH,
  DESTINATION_LENGTH,
  KNOWN_LODGING_LENGTH,
  MAX_CITIES,
  MAX_COMMITMENTS,
  type CommitmentKind,
} from "@/contracts/values";
import { formatDateCourte } from "@/features/voyage/plate";
import { format, messages } from "@/i18n";

import { CreationShell, TITLE_CLASS } from "./CreationShell";
import { useDraft } from "./DraftProvider";
import { LODGING_ANSWERS, type LodgingAnswer, type LodgingForm } from "./draft";
import { describedBy, errorId, FieldHelp, FieldMessage, FieldRow, fieldId, focusField, TextField } from "./fields";
import { creationRoutes } from "./routes";
import { cityRanges, todayIso, validateTrip, type FieldError, type FormError } from "./validation";

const t = messages.creation;
const e1 = t.ecran1;
const err = e1.erreurs;

const LODGING_OPTIONS = LODGING_ANSWERS.map((value) => ({ value, label: e1.logement.options[value] }));
const KIND_OPTIONS = COMMITMENT_KINDS.map((value) => ({ value, label: e1.engagements.types[value] }));

const length = (bounds: { min: number; max: number }) => format(err.longueur, bounds);

/** Message d'un champ de l'écran 1 (textes provisoires, UX/UI, F8-Q1). */
function messageFor(field: string, code: FieldError): string {
  const last = field.split(".").pop() ?? field;
  const inCity = field.startsWith("otherCities.");
  const inCommitment = field.startsWith("commitments.");
  if (field === "destination") return code === "length" ? length(DESTINATION_LENGTH) : err.destination;
  if (field === "start") return code === "past" ? err.arriveePassee : err.arrivee;
  if (field === "end") return code === "endBeforeStart" ? err.departAvantArrivee : err.depart;
  if (last === "lodging") return err.logement;
  if (inCity && last === "name") return code === "length" ? length(CITY_NAME_LENGTH) : err.villeNom;
  if (inCity && last === "arrival") {
    return code === "cityOrder" ? err.villeOrdre : code === "cityBeforeEnd" ? err.villeAvantDepart : err.villeArrivee;
  }
  if (inCommitment && last === "kind") return err.type;
  if (inCommitment && last === "label") return code === "length" ? length(COMMITMENT_LABEL_LENGTH) : err.libelle;
  if (inCommitment && last === "date") return code === "outOfTrip" ? err.dateHorsVoyage : err.date;
  if (inCommitment && last === "start") return err.debut;
  return err.fin;
}

/**
 * Écran 1 « Créer le voyage » (`R1`, F8-PO-3 ; rendus et textes provisoires, décision 0018 § 15). Aucun appel
 * serveur : « Continuer » valide, garde la saisie dans le brouillon et mène à l'écran 2. Destination, logement,
 * villes et engagements sont saisis en texte libre, sans autocomplétion (aucune donnée Google, F8-PO-14).
 */
export function CreateTripForm() {
  const router = useRouter();
  const { state, dispatch } = useDraft();
  const { trip } = state;
  const [errors, setErrors] = useState<FormError[]>([]);
  const addCityButton = useRef<HTMLButtonElement>(null);
  const addCommitmentButton = useRef<HTMLButtonElement>(null);
  const focusAfterAdd = useRef<string | null>(null);

  // Brouillon perdu : le texte est écrit après le premier rendu, dans une région déjà présente (0018 § 14).
  useEffect(() => {
    if (state.lostNotice) dispatch({ type: "noticeShown" });
  }, [state.lostNotice, dispatch]);

  useEffect(() => {
    if (focusAfterAdd.current) {
      focusField(focusAfterAdd.current);
      focusAfterAdd.current = null;
    }
  });

  const errorOf = (field: string): string | null => {
    const found = errors.find((error) => error.field === field);
    if (!found) return null;
    // Le message du libellé du logement dépend de la réponse (« Oui » : 2 à 120 caractères ; « Un quartier » : 2 à 80).
    if (field.endsWith("lodging.label")) {
      const lodging = lodgingAt(field);
      if (found.code === "length") return length(lodging?.answer === "known" ? KNOWN_LODGING_LENGTH : AREA_LENGTH);
      return lodging?.answer === "known" ? err.nomAdresse : err.quartier;
    }
    return messageFor(field, found.code);
  };
  function lodgingAt(field: string): LodgingForm | undefined {
    const match = /^otherCities\.(\d+)\./.exec(field);
    return match ? trip.otherCities[Number(match[1])]?.lodging : trip.lodging;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateTrip(trip, todayIso());
    setErrors(found);
    const first = found[0];
    if (first) {
      requestAnimationFrame(() => focusField(first.field));
      return;
    }
    dispatch({ type: "tripReady" });
    router.push(creationRoutes.brief());
  }

  const ranges = trip.otherCities.length > 0 ? cityRanges(trip) : null;

  function lodgingFields(lodging: LodgingForm, city: number, base: string) {
    const groupError = errorOf(base);
    const labelField = `${base}.label`;
    const labelError = errorOf(labelField);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {/* Libellé visible ; le nom accessible du groupe est le même texte (aria-label), lu une seule fois. */}
          <p aria-hidden="true" className="text-corps font-bold text-ink">
            {e1.logement.question}
          </p>
          <SegmentedControl<LodgingAnswer>
            label={e1.logement.question}
            options={LODGING_OPTIONS}
            value={lodging.answer}
            onChange={(answer) => dispatch({ type: "lodging", city, patch: { answer } })}
            invalid={groupError !== null}
            describedBy={groupError ? errorId(fieldId(base)) : undefined}
            id={fieldId(base)}
          />
          <FieldMessage id={errorId(fieldId(base))} message={groupError} />
        </div>
        {lodging.answer === "known" || lodging.answer === "area" ? (
          <TextField
            key={lodging.answer}
            field={labelField}
            label={lodging.answer === "known" ? e1.logement.nomAdresse : e1.logement.quartier}
            value={lodging.label}
            maxLength={lodging.answer === "known" ? KNOWN_LODGING_LENGTH.max : AREA_LENGTH.max}
            onChange={(label) => dispatch({ type: "lodging", city, patch: { label } })}
            error={labelError}
          />
        ) : null}
      </div>
    );
  }

  const citiesFull = trip.otherCities.length >= MAX_CITIES - 1;
  const commitmentsFull = trip.commitments.length >= MAX_COMMITMENTS;

  return (
    <CreationShell backHref={creationRoutes.mesVoyages()}>
      {/* Bloc `muted` du brouillon perdu : région présente dès le chargement, texte écrit ensuite (0018 § 14). */}
      <div role="status" className={state.noticeVisible ? "rounded-block bg-muted p-4 text-corps-s text-ink-2" : undefined}>
        {state.noticeVisible ? t.brouillonPerdu : null}
      </div>
      <div role="alert" />
      <h1 className={TITLE_CLASS}>{e1.titre}</h1>
      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
        <TextField
          field="destination"
          label={e1.destination}
          value={trip.destination}
          maxLength={DESTINATION_LENGTH.max}
          onChange={(destination) => dispatch({ type: "trip", patch: { destination } })}
          error={errorOf("destination")}
        />
        <FieldRow>
          <TextField
            field="start"
            type="date"
            label={e1.arrivee}
            value={trip.start}
            onChange={(start) => dispatch({ type: "trip", patch: { start } })}
            error={errorOf("start")}
          />
          <TextField
            field="end"
            type="date"
            label={e1.depart}
            value={trip.end}
            onChange={(end) => dispatch({ type: "trip", patch: { end } })}
            error={errorOf("end")}
          />
        </FieldRow>
        {lodgingFields(trip.lodging, 0, "lodging")}

        <section aria-labelledby="villes-titre" aria-describedby="villes-aide" className="flex flex-col gap-3">
          <h2 id="villes-titre" className="text-section font-extrabold text-ink">
            {e1.villes.titre}
          </h2>
          <FieldHelp id="villes-aide">{e1.villes.aide}</FieldHelp>
          {trip.otherCities.map((city, index) => {
            const base = `otherCities.${index}`;
            const title = city.name.trim() || format(e1.villes.ville, { n: index + 2 });
            return (
              <section
                key={city.key}
                aria-labelledby={`${fieldId(base)}-titre`}
                className="flex flex-col gap-3 rounded-block border border-outline bg-raised p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 id={`${fieldId(base)}-titre`} className="min-w-0 pt-2.5 text-arret font-bold break-words text-ink">
                    {title}
                  </h3>
                  <Button
                    variant="text"
                    size="sm"
                    aria-label={format(e1.retirerNom, { nom: title })}
                    onClick={() => {
                      dispatch({ type: "removeCity", index });
                      setErrors([]);
                      requestAnimationFrame(() => addCityButton.current?.focus());
                    }}
                  >
                    {e1.retirer}
                  </Button>
                </div>
                <TextField
                  field={`${base}.name`}
                  label={e1.villes.nom}
                  value={city.name}
                  maxLength={CITY_NAME_LENGTH.max}
                  onChange={(name) => dispatch({ type: "city", index, patch: { name } })}
                  error={errorOf(`${base}.name`)}
                />
                <TextField
                  field={`${base}.arrival`}
                  type="date"
                  label={e1.villes.arrivee}
                  value={city.arrival}
                  onChange={(arrival) => dispatch({ type: "city", index, patch: { arrival } })}
                  error={errorOf(`${base}.arrival`)}
                />
                {lodgingFields(city.lodging, index + 1, `${base}.lodging`)}
              </section>
            );
          })}
          {ranges ? (
            <div className="flex flex-col gap-1">
              <p id="villes-recapitulatif" className="text-corps-s font-bold text-ink">
                {e1.villes.recapitulatif}
              </p>
              <ul aria-labelledby="villes-recapitulatif" className="flex flex-col gap-1">
                {ranges.map((range, index) => (
                  <li key={index} className="text-corps-s text-ink-soft tabular-nums">
                    {format(e1.villes.plage, { nom: range.name, debut: formatDateCourte(range.start), fin: formatDateCourte(range.end) })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button
            ref={addCityButton}
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={citiesFull}
            aria-describedby={describedBy(citiesFull && "villes-maximum")}
            onClick={() => {
              focusAfterAdd.current = `otherCities.${trip.otherCities.length}.name`;
              dispatch({ type: "addCity" });
            }}
          >
            <IconPlus className="size-(--ligne-icone-petite)" />
            {e1.villes.ajouter}
          </Button>
          {citiesFull ? (
            <p id="villes-maximum" className="text-legende text-ink-soft">
              {format(e1.villes.maximum, { max: MAX_CITIES })}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="engagements-titre" aria-describedby="engagements-aide" className="flex flex-col gap-3">
          <h2 id="engagements-titre" className="text-section font-extrabold text-ink">
            {e1.engagements.titre}
          </h2>
          <FieldHelp id="engagements-aide">{e1.engagements.aide}</FieldHelp>
          {trip.commitments.map((commitment, index) => {
            const base = `commitments.${index}`;
            const title = commitment.label.trim() || format(e1.engagements.engagement, { n: index + 1 });
            const kindError = errorOf(`${base}.kind`);
            return (
              <section
                key={commitment.key}
                aria-labelledby={`${fieldId(base)}-titre`}
                className="flex flex-col gap-3 rounded-block border border-outline bg-raised p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 id={`${fieldId(base)}-titre`} className="min-w-0 pt-2.5 text-arret font-bold break-words text-ink">
                    {title}
                  </h3>
                  <Button
                    variant="text"
                    size="sm"
                    aria-label={format(e1.retirerNom, { nom: title })}
                    onClick={() => {
                      dispatch({ type: "removeCommitment", index });
                      setErrors([]);
                      requestAnimationFrame(() => addCommitmentButton.current?.focus());
                    }}
                  >
                    {e1.retirer}
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <p aria-hidden="true" className="text-corps font-bold text-ink">
                    {e1.engagements.type}
                  </p>
                  <SegmentedControl<CommitmentKind>
                    label={e1.engagements.type}
                    options={KIND_OPTIONS}
                    value={commitment.kind}
                    onChange={(kind) => dispatch({ type: "commitment", index, patch: { kind } })}
                    invalid={kindError !== null}
                    describedBy={kindError ? errorId(fieldId(`${base}.kind`)) : undefined}
                    id={fieldId(`${base}.kind`)}
                  />
                  <FieldMessage id={errorId(fieldId(`${base}.kind`))} message={kindError} />
                </div>
                <TextField
                  field={`${base}.label`}
                  label={e1.engagements.libelle}
                  value={commitment.label}
                  maxLength={COMMITMENT_LABEL_LENGTH.max}
                  onChange={(label) => dispatch({ type: "commitment", index, patch: { label } })}
                  error={errorOf(`${base}.label`)}
                />
                <TextField
                  field={`${base}.date`}
                  type="date"
                  label={e1.engagements.date}
                  value={commitment.date}
                  onChange={(date) => dispatch({ type: "commitment", index, patch: { date } })}
                  error={errorOf(`${base}.date`)}
                />
                <FieldRow>
                  <TextField
                    field={`${base}.start`}
                    type="time"
                    label={e1.engagements.debut}
                    value={commitment.start}
                    onChange={(start) => dispatch({ type: "commitment", index, patch: { start } })}
                    error={errorOf(`${base}.start`)}
                  />
                  <TextField
                    field={`${base}.end`}
                    type="time"
                    label={e1.engagements.fin}
                    value={commitment.end}
                    onChange={(end) => dispatch({ type: "commitment", index, patch: { end } })}
                    error={errorOf(`${base}.end`)}
                  />
                </FieldRow>
              </section>
            );
          })}
          <Button
            ref={addCommitmentButton}
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={commitmentsFull}
            aria-describedby={describedBy(commitmentsFull && "engagements-maximum")}
            onClick={() => {
              focusAfterAdd.current = `commitments.${trip.commitments.length}.kind`;
              dispatch({ type: "addCommitment" });
            }}
          >
            <IconPlus className="size-(--ligne-icone-petite)" />
            {e1.engagements.ajouter}
          </Button>
          {commitmentsFull ? (
            <p id="engagements-maximum" className="text-legende text-ink-soft">
              {format(e1.engagements.maximum, { max: MAX_COMMITMENTS })}
            </p>
          ) : null}
        </section>

        <Button type="submit" className="mt-2 w-full">
          {t.continuer}
        </Button>
      </form>
    </CreationShell>
  );
}
