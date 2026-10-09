"use client";

import { useState, type ReactNode } from "react";

import {
  Button,
  Chip,
  Counter,
  DayBadge,
  DayLine,
  DayTabs,
  DeckCard,
  DeckProgress,
  IconButton,
  IconPartager,
  IconRetour,
  OtpInput,
  SegmentedControl,
  StatusBanner,
  StopMarker,
  Tag,
  UndoToast,
  UndoToastRegion,
  type StatusBannerKind,
  type TagKind,
} from "@/components/ligne";
import type { DayLineItem, Proposal, Stop, Weekday } from "@/contracts";
import { format, messages } from "@/i18n";

const t = messages.dev.composants;
const ex = t.exemples;

const TAG_KINDS: TagKind[] = ["toReserve", "toConfirm", "unconfirmed"];
const BANNER_KINDS: StatusBannerKind[] = ["offline", "conflict", "noOption", "error", "generating"];
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
const DEMO_STOP_BASE: Pick<Stop, "kind" | "exceptions" | "locked"> = { kind: "activity", exceptions: [], locked: false };
const DEMO_LINE: DayLineItem[] = [
  { type: "terminus", role: "start", time: "09:15", label: lx.hotel },
  { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
  {
    type: "stop",
    stop: { ...DEMO_STOP_BASE, id: "demo-1", name: lx.arret1.nom, start: "09:30", meta: lx.arret1.meta, reason: lx.arret1.raison },
  },
  { type: "segment", segment: { mode: "transit", minutes: 25, estimated: true } },
  {
    type: "stop",
    stop: { ...DEMO_STOP_BASE, id: "demo-2", name: lx.arret2.nom, start: "15:00", meta: lx.arret2.meta, exceptions: ["toReserve"] },
  },
  { type: "free", from: "17:00", to: "19:00" },
  { type: "segment", segment: { mode: "walk", minutes: 6, estimated: false } },
  { type: "terminus", role: "end", time: "22:30", label: lx.hotel },
];
const DEMO_CAR: DayLineItem[] = [{ type: "segment", segment: { mode: "car", minutes: 15, estimated: false } }];
const stopHref = (stop: Stop) => `#arret-${stop.id}`;

/** Cartes de présentation de démonstration (DeckCard/preview.html), sans src/mocks. */
const px = ex.presentation;
const DEMO_ACTIVITE: Proposal = {
  id: "demo-activite",
  kind: "activity",
  day: 5,
  weekday: "mer.",
  time: "13:30",
  context: px.activite.contexte,
  category: "tasting",
  stop: {
    ...DEMO_STOP_BASE,
    id: "demo-distillerie",
    name: px.activite.nom,
    start: "13:30",
    meta: px.activite.meta,
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
  weekday: "sam.",
  time: "18:45",
  context: px.repas.contexte,
  category: "restaurant",
  stop: { ...DEMO_STOP_BASE, kind: "meal", id: "demo-repas-1", name: px.repas.nom, start: "18:45", meta: px.repas.meta, reason: px.repas.raison, exceptions: ["toReserve"] },
  option: { index: 1, total: 2 },
};
const DEMO_REPAS_2: Proposal = {
  ...DEMO_REPAS,
  id: "demo-repas-2",
  stop: { ...DEMO_REPAS.stop, id: "demo-repas-2", name: px.repas2.nom, meta: px.repas2.meta },
  option: { index: 2, total: 2 },
};
const noop = () => {};

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
      </Section>

      <Section id="otp-input" title="OtpInput">
        <State label={t.etats.vide}>
          <OtpInput />
        </State>
        <State label={t.etats.rempli}>
          <OtpInput defaultValue="482913" />
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
          <DayLine items={DEMO_LINE} getStopHref={stopHref} ideasHref="#idees" className="w-full" />
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
          <DeckProgress current={4} total={8} label={format(messages.presentation.progression, { current: 4, total: 8 })} />
        </State>
        <State label={t.etats.deckActivite}>
          <DeckCard proposal={DEMO_ACTIVITE} onLike={noop} onDislike={noop} onOpen={noop} className="w-full" />
        </State>
        <State label={t.etats.deckRepas}>
          <DeckCard proposal={DEMO_REPAS} onLike={noop} onDislike={noop} onOpen={noop} className="w-full" />
        </State>
        <State label={t.etats.deckDerniere}>
          <DeckCard proposal={DEMO_REPAS_2} isLastOption onLike={noop} onDislike={noop} onOpen={noop} className="w-full" />
        </State>
        <State label={t.etats.toast}>
          <UndoToastRegion className="w-full">
            <UndoToast message={px.toast} onUndo={noop} onExpire={noop} />
          </UndoToastRegion>
        </State>
      </Section>
    </main>
  );
}
