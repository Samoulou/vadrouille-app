import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { DayBadge, dayBadgeName } from "./DayBadge";
import { DayTabs } from "./DayTabs";

/**
 * Prop facultative `ville` de `DayBadge` (spécification M4 § 7.7 ; critère 17) : ajoutée au nom accessible après le jour
 * abrégé et avant « complet », sans effet quand elle est absente. Les tests de `DayBadge.test.tsx` ne changent pas.
 */
describe("DayBadge : ville du jour (M4c)", () => {
  it("ordre du nom : jour, jour abrégé, ville, puis « complet »", () => {
    expect(dayBadgeName({ day: 3, weekday: "lun.", ville: "de Rome à Florence" })).toBe("Jour 3, lun., de Rome à Florence");
    expect(dayBadgeName({ day: 3, weekday: "lun.", ville: "de Rome à Florence", disabled: true })).toBe("Jour 3, lun., de Rome à Florence, complet");
    expect(dayBadgeName({ day: 1, ville: "Rome" })).toBe("Jour 1, Rome");
    expect(dayBadgeName({ day: 1 })).toBe("Jour 1");
    expect(dayBadgeName({ day: 1, weekday: "sam." })).toBe("Jour 1, sam.");
  });

  it("Journée : la pastille active d'un changement de ville s'appelle « Jour 3, lun., de Rome à Florence » ; l'état reste aria-current", async () => {
    const { container } = render(<DayBadge day={3} weekday="lun." ville="de Rome à Florence" href="/j3" active currentValue="page" />);
    const link = screen.getByRole("link", { name: "Jour 3, lun., de Rome à Florence" });
    expect(link).toHaveAttribute("aria-current", "page");
    // Le texte visible reste « J3 » : la ville n'est que dans le nom.
    expect(link.querySelector("[aria-hidden='true']")).toHaveTextContent(/^J3$/);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("pastille réduite (écran 5) : texte masqué « Jour 1, Rome » et « Jour 3, de Rome à Florence »", () => {
    const { container } = render(
      <>
        <DayBadge day={1} size="sm" ville="Rome" />
        <DayBadge day={3} size="sm" ville="de Rome à Florence" />
      </>,
    );
    expect(Array.from(container.querySelectorAll(".sr-only")).map((node) => node.textContent)).toEqual(["Jour 1, Rome", "Jour 3, de Rome à Florence"]);
  });

  it("DayTabs transmet la ville d'un jour à sa pastille, les autres jours sont inchangés", () => {
    render(
      <DayTabs
        days={[
          { index: 2, href: "/j2", weekday: "dim." },
          { index: 3, href: "/j3", weekday: "lun.", ville: "de Rome à Florence" },
        ]}
        current={3}
        sejourHref="/"
      />,
    );
    expect(screen.getByRole("link", { name: "Jour 2, dim." })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Jour 3, lun., de Rome à Florence" })).toHaveAttribute("aria-current", "page");
  });
});
