import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { messages } from "@/i18n";

import { axeViolations } from "../../../tests/unit/axe";

import { Tag, type TagKind } from "./Tag";

const KINDS: TagKind[] = ["toReserve", "toConfirm", "unconfirmed"];

describe("Tag", () => {
  it("affiche le texte de son type depuis fr.json, avec le vocabulaire imposé", () => {
    expect(messages.ligne.tag).toEqual({
      toReserve: "À réserver",
      toConfirm: "À confirmer",
      unconfirmed: "Non confirmé",
    });
    for (const kind of KINDS) {
      const { unmount } = render(<Tag kind={kind} />);
      expect(screen.getByText(messages.ligne.tag[kind])).toHaveAttribute("data-kind", kind);
      unmount();
    }
  });

  it("n'utilise le jaune quai que pour toReserve", () => {
    render(
      <>
        {KINDS.map((kind) => (
          <Tag key={kind} kind={kind} />
        ))}
      </>,
    );
    const toReserve = screen.getByText(messages.ligne.tag.toReserve);
    expect(toReserve).toHaveClass("bg-quai", "text-ink", "rounded-tag", "h-6", "text-etiquette", "font-bold");
    for (const kind of ["toConfirm", "unconfirmed"] as const) {
      const tag = screen.getByText(messages.ligne.tag[kind]);
      expect(tag.className).not.toMatch(/quai/);
      expect(tag).toHaveClass("border-dashed", "border-ink", "bg-transparent", "text-ink");
    }
  });

  it("refuse un type hors des trois exceptions à la compilation", () => {
    // @ts-expect-error « Vérifié » n'est pas une exception (handover § 0, règle 5)
    const verified = <Tag kind="verified" />;
    expect(verified).toBeDefined();
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <p>
        {KINDS.map((kind) => (
          <Tag key={kind} kind={kind} />
        ))}
      </p>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
