"use client";

import { useState, type ReactNode } from "react";

import {
  ActionBanner,
  Button,
  ChangeSet,
  ChecklistRow,
  Chip,
  Counter,
  DayBadge,
  DayBadgeGroup,
  DayLine,
  DayTabs,
  DeckCard,
  DeckProgress,
  DestinationPlate,
  IconButton,
  IconPartager,
  IconRetour,
  OtpInput,
  ReasonBlock,
  SegmentedControl,
  Sheet,
  StatusBanner,
  StopMarker,
  Tag,
  UndoToast,
  UndoToastRegion,
  type DayLineViewItem,
  type StatusBannerKind,
  type TagKind,
} from "@/components/ligne";
import type { Change, ChecklistMoment, DayLineItem, Proposal, Stop, Trip, Weekday } from "@/contracts";
import { formatContexte } from "@/features/presentation/contexte";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

const t = messages.dev.composants;
const ex = t.exemples;

const TAG_KINDS: TagKind[] = ["toReserve", "toConfirm", "unconfirmed"];
/**
 * `overlap` (spécification M4-suite § 5) n'est pas encore au catalogue : l'ajouter change la capture de référence de cette
 * page ; il est rendu et testé par la Journée (`BandeauChevauchement.test.tsx`, `chevauchement.a11y.spec.ts`).
 */
const BANNER_KINDS: Exclude<StatusBannerKind, "overlap">[] = ["offline", "conflict", "noOption", "error", "generating", "travel"];
/** Message de l'état invalide d'OtpInput, relié au groupe par `describedBy` (0012, Q13). */
const OTP_MESSAGE_ID = "otp-invalide-message";
const SEGMENT_OPTIONS = [
  { value: "a", label: ex.segmente.options.a },
  { value: "b", label: ex.segmente.options.b },
  { value: "c", label: ex.segmente.options.c },
] as const;
type SegmentValue = (typeof SEGMENT_OPTIONS)[number]["value"];

const lx = ex.ligne;
const WEEKDAYS: Weekday[] = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const TEN_DAYS = Array.from({ length: 10 }, (_, i) => ({
  index: i + 1,
  href: `#ligne-j${i + 1}`,
  weekday: WEEKDAYS[i % WEEKDAYS.length],
}));

/** Séquence du preview.html de DayLine : données de démonstration propres à la page (pas de src/mocks). */
const DEMO_STOP_BASE: Pick<Stop, "kind" | "exceptions" | "locked" | "facts"> = { kind: "activity", exceptions: [], locked: false, facts: {} };
const DEMO_LINE: DayLineItem[] = [
  { type: "terminus", role: "start", time: "09:15", label: lx.hotel },
  { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
  {
    type: "stop",
    stop: { ...DEMO_STOP_BASE, id: "demo-1", name: lx.arret1.nom, start: "09:30", facts: { durationMinutes: 45, costPerPerson: 0 }, reason: lx.arret1.raison },
  },
  { type: "segment", segment: { mode: "transit", minutes: 25, estimated: true } },
  {
    type: "stop",
    stop: { ...DEMO_STOP_BASE, id: "demo-2", name: lx.arret2.nom, start: "15:00", facts: { area: lx.arret2.secteur, durationMinutes: 90 }, exceptions: ["toReserve"] },
  },
  { type: "free", from: "17:00", to: "19:00" },
  { type: "segment", segment: { mode: "walk", minutes: 6, estimated: false } },
  { type: "terminus", role: "end", time: "22:30", label: lx.hotel },
];
const DEMO_CAR: DayLineItem[] = [{ type: "segment", segment: { mode: "car", minutes: 15, estimated: false } }];
const stopHref = (stop: Stop) => `#arret-${stop.id}`;
const ideasHref = () => "#idees";
/** Lien « Idées » par plage (F5-TL-8) : l'adresse de démonstration reprend la plage. */
const ideasHrefForFree = (free: { from: string; to: string }) => `#idees-${free.from}-${free.to}`;

/** Ajouts de F5b à DayLine : étape verrouillée, repas pas encore choisis, lien « Idées » par plage. */
const DEMO_ADDITIONS: DayLineItem[] = [
  { type: "openMeal", time: "12:30", meal: "lunch" },
  { type: "free", from: "14:00", to: "18:30" },
  { type: "openMeal", time: "19:00", meal: "dinner" },
  { type: "segment", segment: { mode: "walk", minutes: 15, estimated: false } },
  {
    type: "stop",
    stop: {
      ...DEMO_STOP_BASE,
      id: "demo-verrou",
      name: ex.programme.verrouillee.nom,
      start: "21:30",
      facts: { durationMinutes: 90 },
      locked: true,
    },
  },
];

/** F7a (critère C10) : un changement de chaque type, budget en hausse puis en baisse ; `unchanged` et un budget nul ne sont pas rendus. */
const rv = ex.revision;
const DEMO_CHANGES: Change[] = [
  { type: "replaced", time: "10:55", before: rv.ancien, after: rv.nouveau },
  { type: "added", time: "15:00", label: rv.ajoute },
  { type: "moved", label: rv.deplace, before: { day: 2, time: "13:25" }, after: { day: 2, time: "14:10" } },
  { type: "moved", label: rv.deplace, before: { day: 2, time: "13:25" }, after: { day: 4, time: "15:45" } },
  { type: "segment", label: rv.nouveau, before: 20, after: 25, estimated: false },
  { type: "segment", label: rv.trajet, before: 15, after: 10, estimated: true },
  { type: "budget", deltaPerPerson: 15 },
];
const DEMO_CHANGES_DOWN: Change[] = [
  { type: "unchanged", time: "19:00", label: rv.trajet },
  { type: "budget", deltaPerPerson: 0 },
  { type: "budget", deltaPerPerson: -8 },
];
/** Étape surlignée après « Appliquer » : la deuxième étape de la séquence de DayLine. */
const DEMO_HIGHLIGHTED = ["demo-2"] as const;
const REASON_DEMO_OPTIONS = [
  { value: "notMyStyle", label: messages.revision.remplacer.raisons.notMyStyle },
  { value: "tooBusy", label: messages.revision.remplacer.raisons.tooBusy },
  { value: "other", label: messages.revision.remplacer.raisons.other },
] as const;

/** F10a (F10-TL-12) : ligne compacte de l'écran 15, en lecture seule, avec une étape terminée et une en cours. */
const pd = ex.pendant;
const DEMO_COMPACT: DayLineItem[] = [
  DEMO_LINE[0]!,
  DEMO_LINE[1]!,
  DEMO_LINE[2]!,
  { type: "segment", segment: { mode: "walk", minutes: 15, estimated: false } },
  { type: "stop", stop: { ...DEMO_STOP_BASE, id: "demo-3", name: pd.arret3, start: "11:00", end: "12:30", facts: { area: lx.arret2.secteur, durationMinutes: 90 } } },
  DEMO_LINE[3]!,
  DEMO_LINE[4]!,
];
const isDemoPast = (stop: Stop) => stop.id === "demo-1";

/**
 * Éléments réduits de la vue partagée (F10-TL-12) : terminus sans libellé, étapes sans `id` ni raison. L'étape
 * n'a aucun fait (`facts: {}`, B2) : la ligne de faits n'est pas affichée.
 */
const DEMO_REDUITE: DayLineViewItem[] = [
  { type: "terminus", role: "start", time: "09:15" },
  { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
  { type: "stop", stop: { key: "1", name: lx.arret1.nom, start: "09:30", facts: {}, exceptions: [] } },
  { type: "terminus", role: "end", time: "22:30" },
];

/** Cartes de présentation de démonstration (DeckCard/preview.html), sans src/mocks. */
const DEMO_CONCERT = { id: "demo-concert", name: ex.programme.verrouillee.nom };
const px = ex.presentation;
const DEMO_ACTIVITE: Proposal = {
  id: "demo-activite",
  kind: "activity",
  day: 5,
  time: "13:30",
  neighbours: { before: { type: "meal", meal: "lunch" }, after: { type: "free" } },
  category: "tasting",
  stop: {
    ...DEMO_STOP_BASE,
    id: "demo-distillerie",
    name: px.activite.nom,
    start: "13:30",
    facts: { area: px.activite.secteur, durationMinutes: 90 },
    reason: px.activite.raison,
    exceptions: ["toReserve", "toConfirm"],
  },
  travelFromPrevious: { mode: "transit", minutes: 50, estimated: true },
  detour: px.activite.detour,
};
const DEMO_REPAS: Proposal = {
  id: "demo-repas-1",
  kind: "meal",
  day: 1,
  time: "18:45",
  neighbours: { after: { type: "stop", stopId: DEMO_CONCERT.id } },
  category: "restaurant",
  stop: {
    ...DEMO_STOP_BASE,
    kind: "meal",
    id: "demo-repas-1",
    name: px.repas.nom,
    start: "18:45",
    facts: { area: px.repas.secteur, durationMinutes: 90, costPerPerson: 45 },
    reason: px.repas.raison,
    exceptions: ["toReserve"],
  },
  option: { index: 1, total: 2 },
};
const DEMO_REPAS_2: Proposal = {
  ...DEMO_REPAS,
  id: "demo-repas-2",
  // Proposition sans voisin (B2-PO-13) : aucune ligne de contexte.
  neighbours: {},
  stop: { ...DEMO_REPAS.stop, id: "demo-repas-2", name: px.repas2.nom, facts: { area: px.repas2.secteur, durationMinutes: 90 } },
  option: { index: 2, total: 2 },
};
/** Étapes du jour de démonstration, pour composer le contexte des cartes (comme `PresentationDay.stops`). */
const DEMO_DAY_STOPS = [DEMO_CONCERT];
const contextOf = (proposal: Proposal) => formatContexte(proposal.neighbours, DEMO_DAY_STOPS);
const noop = () => {};

/** Panneau coulissant à chacune de ses hauteurs, dans un cadre (F5) ; noms de région distincts. */
const pg = ex.programme;
const SHEET_DEMOS = [
  { snap: 0.25, label: pg.panneaux.petit },
  { snap: 0.55, label: pg.panneaux.moyen },
  { snap: 0.92, label: pg.panneaux.grand },
] as const;

/** Les quatre couleurs de la palette fermée des plaques (DestinationPlate/README). */
const DEST_COLORS: Trip["destinationColor"][] = ["bruyere", "azulejo", "ocre", "granit"];

/** ChecklistRow dans ses quatre états, cliquable (F5c) : à faire, faite, sans lien, lien rémunéré. */
/** Jours du groupe radio de démonstration (F7b, C10) : J3 « complet ». */
const DAY_GROUP_DEMO = [{ day: 1 }, { day: 2 }, { day: 3, disabled: true }, { day: 4 }];

/** Groupe radio `DayBadgeGroup` (décision 0019 § 1) : cocher un jour ne fait qu'afficher, rien n'est envoyé. */
function DayBadgeGroupDemo({ id, initial }: { id: string; initial: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <div className="flex w-full flex-col gap-2">
      <h3 id={id} className="text-corps font-bold text-ink">
        {rv.versQuelJour}
      </h3>
      <DayBadgeGroup days={DAY_GROUP_DEMO} value={value} onChange={setValue} labelledBy={id} />
    </div>
  );
}

function ChecklistDemo() {
  const cl = pg.checklist;
  const [done, setDone] = useState<Record<string, boolean>>({ aFaire: false, faite: true, sansLien: false, remuneree: false });
  // Les quatre moments (évolution E4 de B2) : « J2 », « À l'arrivée », « Avant le départ », « Avant le sam. 22.08 ».
  const rows: { key: string; label: string; when: ChecklistMoment; bookingUrl: string | undefined; sponsored: boolean }[] = [
    { key: "aFaire", ...cl.aFaire, when: { type: "tripDay", day: 2 }, bookingUrl: "#reserver-distillerie", sponsored: false },
    { key: "faite", ...cl.faite, when: { type: "tripDay", day: 1 }, bookingUrl: "#reserver-tattoo", sponsored: false },
    { key: "sansLien", ...cl.sansLien, when: { type: "beforeDeparture" }, bookingUrl: undefined, sponsored: false },
    {
      key: "remuneree",
      ...cl.remuneree,
      when: { type: "deadline", date: "2026-08-22" },
      bookingUrl: "#reserver-assurance",
      sponsored: true,
    },
  ];
  return (
    <ul className="w-full">
      {rows.map(({ key, label, when, bookingUrl, sponsored }) => (
        <li key={key} className="border-b border-hairline last:border-b-0">
          <ChecklistRow
            label={label}
            when={when}
            done={done[key] ?? false}
            bookingUrl={bookingUrl}
            sponsored={sponsored}
            onToggle={(next) => setDone((current) => ({ ...current, [key]: next }))}
          />
        </li>
      ))}
    </ul>
  );
}

/** Fond de carte des marqueurs de démonstration (StopMarker/preview.html). */
const MAP_CELL = "flex h-14 w-16 items-center justify-center rounded-control bg-map-land";

/** Anneau de focus affiché en permanence, pour montrer l'état « focus » sans clavier. */
const FOCUS_DEMO = "outline-2 outline-offset-2 outline-line";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-component={title} className="flex flex-col gap-4">
      <h2 id={id} className="text-section font-extrabold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-legende text-ink-soft">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/** Chaque composant Ligne (F2, puis F3 dans la section « Ligne ») dans chacun de ses états. */
export function ComposantsShowcase() {
  const [segment, setSegment] = useState<SegmentValue>("b");
  const [inferredSegment, setInferredSegment] = useState<SegmentValue>("b");
  const [inferredMarked, setInferredMarked] = useState(true);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-5 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-titre-jour font-extrabold tracking-[-0.015em] text-ink">{t.titre}</h1>
        <p className="text-corps-s text-ink-soft">{t.intro}</p>
      </header>

      <Section id="button" title="Button">
        <State label={t.etats.variantes}>
          <Button data-demo="button-md">{ex.garder}</Button>
          <Button variant="secondary">{ex.remplacer}</Button>
          <Button variant="text">{ex.passer}</Button>
        </State>
        <State label={t.etats.tailles}>
          <Button size="sm">{ex.appliquer}</Button>
          <Button variant="secondary" size="sm">
            {ex.remplacer}
          </Button>
          <Button variant="text" size="sm" tone="soft">
            {ex.plusTard}
          </Button>
        </State>
        <State label={t.etats.desactive}>
          <Button disabled>{ex.debloquer}</Button>
          <Button variant="secondary" disabled>
            {ex.remplacer}
          </Button>
          <Button variant="text" disabled>
            {ex.passer}
          </Button>
        </State>
        <State label={t.etats.focus}>
          <Button className={FOCUS_DEMO}>{ex.appliquer}</Button>
        </State>
        <State label={t.etats.bascule}>
          <Button variant="secondary" size="sm" aria-pressed={false} data-demo="bascule-relache">
            {ex.verrouiller}
          </Button>
          <Button variant="secondary" size="sm" aria-pressed data-demo="bascule-enfonce">
            {ex.verrouiller}
          </Button>
          <Button variant="secondary" size="sm" aria-pressed className={FOCUS_DEMO} data-demo="bascule-focus">
            {ex.verrouiller}
          </Button>
        </State>
        <State label={t.etats.lien}>
          <Button asChild variant="secondary">
            <a href="/dev/tokens">{ex.reserver}</a>
          </Button>
        </State>
      </Section>

      <Section id="icon-button" title="IconButton">
        <State label={t.etats.formes}>
          <IconButton icon={<IconRetour />} label={ex.retour} />
          <IconButton icon={<IconPartager />} label={ex.partager} />
          <IconButton icon={<IconRetour />} label={ex.retour} shape="round" />
          <IconButton icon={<IconPartager />} label={ex.partager} shape="round" />
        </State>
        <State label={t.etats.desactive}>
          <IconButton icon={<IconPartager />} label={ex.partager} disabled />
        </State>
        <State label={t.etats.focus}>
          <IconButton icon={<IconRetour />} label={ex.retour} className={FOCUS_DEMO} />
        </State>
      </Section>

      <Section id="tag" title="Tag">
        <State label={t.etats.types}>
          {TAG_KINDS.map((kind) => (
            <Tag key={kind} kind={kind} />
          ))}
        </State>
      </Section>

      <Section id="counter" title="Counter">
        <State label={t.etats.compteur}>
          <span className="flex items-center gap-2 text-section font-extrabold text-ink">
            {ex.compteurTitre}
            <Counter value={4} label={ex.compteurLabel} />
          </span>
          <span className="flex items-center gap-2 text-section font-extrabold text-ink">
            {ex.compteurTitre}
            <Counter value={0} label={ex.compteurZeroLabel} />
          </span>
        </State>
      </Section>

      <Section id="chip" title="Chip">
        <State label={t.etats.selection}>
          <Chip label={ex.chips.histoire} />
          <Chip label={ex.chips.balades} defaultSelected />
        </State>
        <State label={t.etats.deduit}>
          <Chip label={ex.chips.musees} inferred />
          <Chip label={ex.chips.marches} inferred defaultSelected />
        </State>
        <State label={t.etats.desactive}>
          <Chip label={ex.chips.histoire} disabled />
        </State>
        <State label={t.etats.indisponible}>
          <Chip label={ex.chips.musees} aria-disabled="true" />
        </State>
        <State label={t.etats.focus}>
          <Chip label={ex.chips.balades} className={FOCUS_DEMO} />
        </State>
      </Section>

      <Section id="segmented-control" title="SegmentedControl">
        <SegmentedControl
          label={ex.segmente.label}
          options={SEGMENT_OPTIONS}
          value={segment}
          onChange={setSegment}
        />
        {/* F8-TL-4 : marque « déduit » (0018 § 16) ; choisir une autre option la retire, comme sur l'écran 2. */}
        <State label={t.etats.segmenteDeduit}>
          <div className="flex w-full flex-col gap-3">
            <SegmentedControl
              label={ex.segmente.label}
              options={SEGMENT_OPTIONS}
              value={inferredSegment}
              inferredValue={inferredSegment === "b" && inferredMarked ? "b" : undefined}
              onChange={(value) => {
                setInferredSegment(value);
                setInferredMarked(false);
              }}
            />
            <SegmentedControl label={ex.segmente.label} options={SEGMENT_OPTIONS} value={null} onChange={() => {}} />
          </div>
        </State>
      </Section>

      <Section id="otp-input" title="OtpInput">
        <State label={t.etats.vide}>
          <OtpInput />
        </State>
        <State label={t.etats.rempli}>
          <OtpInput defaultValue="482913" />
        </State>
        <State label={t.etats.invalide}>
          <div className="flex flex-col gap-2">
            <OtpInput invalid describedBy={OTP_MESSAGE_ID} />
            <p id={OTP_MESSAGE_ID} className="text-corps text-ink">
              {ex.codeInvalide}
            </p>
          </div>
        </State>
      </Section>

      <Section id="status-banner" title="StatusBanner">
        {BANNER_KINDS.map((kind) => (
          <StatusBanner key={kind} kind={kind} message={ex.bandeaux[kind]} />
        ))}
      </Section>

      <Section id="ligne" title="Ligne">
        <State label={t.etats.pastilles}>
          <DayBadge day={1} weekday="dim." href="#ligne-j1" />
          <DayBadge day={2} weekday="lun." href="#ligne-j2" active />
          <DayBadge day={3} weekday="mar." href="#ligne-j3" disabled />
          <DayBadge day={4} weekday="mer." size="sm" />
        </State>
        <State label={t.etats.rangeeSejour}>
          <DayTabs days={TEN_DAYS} current="sejour" sejourHref="#ligne-sejour" label={lx.rangeeSejour} className="w-full" />
        </State>
        <State label={t.etats.rangeeJour}>
          <DayTabs days={TEN_DAYS} current={9} sejourHref="#ligne-sejour" label={lx.rangeeJour} className="w-full" />
        </State>
        <State label={t.etats.ligneDuJour}>
          <DayLine items={DEMO_LINE} getStopHref={stopHref} getIdeasHref={ideasHref} className="w-full" />
        </State>
        <State label={t.etats.voiture}>
          <DayLine items={DEMO_CAR} getStopHref={stopHref} className="w-full" />
        </State>
        <State label={t.etats.marqueursLigne}>
          <StopMarker kind="stop" variant="ligne" />
          <StopMarker kind="terminus" variant="ligne" />
        </State>
        <State label={t.etats.marqueursCarte}>
          <span className={MAP_CELL}>
            <StopMarker kind="stop" number={2} />
          </span>
          <span className={MAP_CELL}>
            <StopMarker kind="stop" number={2} selected />
          </span>
          <span className={MAP_CELL}>
            <StopMarker kind="terminus" number={1} />
          </span>
          <span className={MAP_CELL}>
            <StopMarker kind="overview" />
          </span>
        </State>
      </Section>

      <Section id="presentation" title="Présentation">
        <State label={t.etats.progression}>
          <DeckProgress
            current={4}
            total={8}
            label={format(messages.presentation.progression, { current: 4, total: 8 })}
            text={format(messages.presentation.progressionVisible, { current: 4, total: 8 })}
          />
        </State>
        <State label={t.etats.deckActivite}>
          <DeckCard proposal={DEMO_ACTIVITE} context={contextOf(DEMO_ACTIVITE)} onLike={noop} onDislike={noop} onOpen={noop} className="w-full" />
        </State>
        <State label={t.etats.deckRepas}>
          <DeckCard proposal={DEMO_REPAS} context={contextOf(DEMO_REPAS)} onLike={noop} onDislike={noop} onOpen={noop} className="w-full" />
        </State>
        <State label={t.etats.deckDerniere}>
          <DeckCard proposal={DEMO_REPAS_2} context={contextOf(DEMO_REPAS_2)} isLastOption onLike={noop} onDislike={noop} onOpen={noop} className="w-full" />
        </State>
        <State label={t.etats.toast}>
          <UndoToastRegion className="w-full">
            <UndoToast message={px.toast} onUndo={noop} onExpire={noop} />
          </UndoToastRegion>
        </State>
      </Section>

      <Section id="programme" title="Programme">
        <State label={t.etats.panneau}>
          {SHEET_DEMOS.map(({ snap, label }) => (
            <div key={snap} data-demo="panneau" className="relative h-72 w-full overflow-hidden rounded-block bg-map-land">
              <Sheet label={label} defaultSnap={snap}>
                <p className="px-5 text-corps text-ink-2">{pg.contenu}</p>
              </Sheet>
            </div>
          ))}
        </State>
        <State label={t.etats.raison}>
          <ReasonBlock text={pg.raison} sourceLabel={pg.source} sourceUrl="#programme" verifiedAt="2026-08-15" className="w-full" />
          <ReasonBlock text={pg.raison} sourceLabel={pg.source} sourceUrl="#programme" className="w-full" />
        </State>
        <State label={t.etats.ligneAjouts}>
          <DayLine items={DEMO_ADDITIONS} getStopHref={stopHref} getIdeasHref={ideasHrefForFree} className="w-full" />
        </State>
        <State label={t.etats.bandeauTrajet}>
          <StatusBanner kind="travel" message={ex.bandeaux.travel} className="w-full" />
        </State>
        <State label={t.etats.plaque}>
          {DEST_COLORS.map((color) => (
            <DestinationPlate key={color} as="p" name={pg.plaque.noms[color]} meta={pg.plaque.meta} color={color} className="w-full" />
          ))}
        </State>
        <State label={t.etats.checklist}>
          <ChecklistDemo />
        </State>
      </Section>

      <Section id="pendant" title={pd.titre}>
        <State label={t.etats.bandeauAction}>
          <ActionBanner title={pd.bandeauTitre} titleId="demo-a-reserver" headingLevel={3} className="w-full">
            <p className="text-corps text-ink tabular-nums">{pd.bandeauLigne}</p>
            <p className="text-corps-s text-ink">{pd.bandeauTexte}</p>
          </ActionBanner>
        </State>
        <State label={t.etats.ligneCompacte}>
          <DayLine items={DEMO_COMPACT} compact currentKey="demo-3" isPast={isDemoPast} className="w-full" />
        </State>
        <State label={t.etats.ligneReduite}>
          <DayLine items={DEMO_REDUITE} className="w-full" />
        </State>
      </Section>

      <Section id="revision" title={rv.titre}>
        <State label={t.etats.changeSet}>
          <ChangeSet changes={DEMO_CHANGES} className="w-full" />
        </State>
        <State label={t.etats.changeSetBaisse}>
          <ChangeSet changes={DEMO_CHANGES_DOWN} className="w-full" />
        </State>
        <State label={t.etats.surlignee}>
          <DayLine items={DEMO_LINE} getStopHref={stopHref} highlightedStopIds={DEMO_HIGHLIGHTED} className="w-full" />
        </State>
        <State label={t.etats.raisonsVerticales}>
          <div className="flex w-full flex-col gap-4">
            <SegmentedControl label={rv.raisons} options={REASON_DEMO_OPTIONS} value={null} orientation="vertical" onChange={() => {}} />
            <SegmentedControl label={rv.raisons} options={REASON_DEMO_OPTIONS} value="tooBusy" orientation="vertical" onChange={() => {}} />
          </div>
        </State>
        <State label={t.etats.groupeJours}>
          <DayBadgeGroupDemo id="demo-groupe-jours" initial={1} />
        </State>
        <State label={t.etats.groupeJoursVide}>
          <DayBadgeGroupDemo id="demo-groupe-jours-vide" initial={null} />
        </State>
      </Section>
    </main>
  );
}
