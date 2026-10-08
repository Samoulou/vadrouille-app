import { expect, test, type Page } from "@playwright/test";

/** Critères F3 sur la section « Ligne » de /dev/composants, en 390 × 844. */

function section(page: Page) {
  return page.getByRole("region", { name: "Ligne", exact: true });
}

async function token(page: Page, name: string) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
}

/** Couleur calculée normalisée en hexadécimal, pour la comparer aux tokens. */
async function hexOf(page: Page, color: string) {
  return page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color.match(/\d+/g)!.slice(0, 3).map(Number);
    probe.remove();
    return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }, color);
}

test.describe("/dev/composants, section Ligne", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/composants");
    await expect(section(page)).toBeVisible();
  });

  test("DayLine : colonnes 52 / 28 px, écart 8 px, marqueurs de 20 px, heures à droite et tabulaires", async ({
    page,
  }) => {
    const line = section(page).locator("ol").first();
    const rows = line.locator(":scope > li");
    await expect(rows).toHaveCount(8);
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const heure = (await row.locator("[data-part='heure']").boundingBox())!;
      const rail = (await row.locator("[data-part='rail']").boundingBox())!;
      expect(heure.width).toBeCloseTo(52, 0);
      expect(rail.width).toBeCloseTo(28, 0);
      expect(rail.x - (heure.x + heure.width)).toBeCloseTo(8, 0);
    }
    const stop = (await line.locator("[data-kind='stop'][data-variant='ligne']").first().boundingBox())!;
    expect([stop.width, stop.height]).toEqual([20, 20]);
    const terminus = (await line.locator("[data-kind='terminus'][data-variant='ligne']").first().boundingBox())!;
    expect([terminus.width, terminus.height]).toEqual([20, 20]);

    const heures = await line.locator("[data-part='heure']").evaluateAll((els) =>
      els.map((el) => ({
        align: getComputedStyle(el).textAlign,
        numeric: getComputedStyle(el).fontVariantNumeric,
      })),
    );
    for (const h of heures) {
      expect(h.align).toBe("right");
      expect(h.numeric).toBe("tabular-nums");
    }
  });

  test("DayLine : rails en line (4 px), temps libre en track-free (2 px), pointillé à pied", async ({ page }) => {
    const line = await token(page, "--color-line");
    const trackFree = await token(page, "--color-track-free");
    const rails = await section(page)
      .locator("[data-rail]")
      .evaluateAll((els) =>
        els.map((el) => {
          const style = getComputedStyle(el);
          return {
            texture: (el as HTMLElement).dataset.rail,
            width: style.width,
            background: style.backgroundColor,
            color: style.color,
            image: style.backgroundImage,
          };
        }),
      );
    expect(rails.map((r) => r.texture)).toEqual(expect.arrayContaining(["plein", "pointille", "libre"]));
    for (const rail of rails) {
      if (rail.texture === "libre") {
        expect(await hexOf(page, rail.background)).toBe(trackFree);
        expect(rail.width).toBe(await token(page, "--ligne-rail-free"));
      } else if (rail.texture === "pointille") {
        expect(await hexOf(page, rail.color)).toBe(line);
        expect(rail.image).toContain("repeating-linear-gradient");
        expect(rail.width).toBe(await token(page, "--ligne-rail"));
      } else {
        expect(await hexOf(page, rail.background)).toBe(line);
        expect(rail.image).toBe("none");
        expect(rail.width).toBe(await token(page, "--ligne-rail"));
      }
    }
  });

  test("DayLine : arrêts et « Idées » d'au moins 44 px", async ({ page }) => {
    const stops = section(page).locator("[data-part='arret']");
    await expect(stops).toHaveCount(2);
    for (const box of await Promise.all([stops.nth(0).boundingBox(), stops.nth(1).boundingBox()])) {
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const ideas = (await section(page).locator("[data-part='idees']").boundingBox())!;
    expect(ideas.width).toBeGreaterThanOrEqual(44);
    expect(ideas.height).toBeGreaterThanOrEqual(44);
  });

  test("DayBadge : interactive ≥ 44 × 44 px ; réduite 26 px, ni lien ni focusable", async ({ page }) => {
    const pastilles = section(page).locator("a[data-day]");
    const count = await pastilles.count();
    expect(count).toBeGreaterThan(20);
    for (let i = 0; i < count; i += 1) {
      const box = (await pastilles.nth(i).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const small = section(page).locator("[data-day='4']").first();
    expect(await small.evaluate((el) => el.tagName)).toBe("SPAN");
    expect((await small.boundingBox())!.height).toBe(26);
    expect(await small.evaluate((el) => (el as HTMLElement).tabIndex)).toBe(-1);
    expect(await small.getAttribute("role")).toBeNull();
  });

  test("DayTabs : 44 px de haut, J9 visible à l'ouverture, seule la rangée défile", async ({ page }) => {
    const navs = section(page).getByRole("navigation", { name: /^Jours du séjour/ });
    await expect(navs).toHaveCount(2);
    for (let n = 0; n < 2; n += 1) {
      const links = navs.nth(n).getByRole("link");
      const count = await links.count();
      expect(count).toBe(11);
      for (let i = 0; i < count; i += 1) {
        expect((await links.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    const row = navs.nth(1).locator("ul");
    const metrics = await row.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.overflowX).toBe("auto");

    const j9 = navs.nth(1).locator("[aria-current='page']");
    await expect(j9).toHaveAccessibleName(/^Jour 9/);
    const rowBox = (await row.boundingBox())!;
    const box = (await j9.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(rowBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
    expect(box.x + box.width).toBeLessThanOrEqual(390);

    const page_ = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
    }));
    expect(page_.width).toBe(390);
    expect(page_.scrollWidth).toBe(page_.width);
  });

  test("ordre de tabulation = ordre de lecture dans DayTabs et DayLine", async ({ page }) => {
    const order = await section(page).evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>("a[href], [tabindex]"))
        .filter((el) => el.tabIndex >= 0)
        .map((el, i) => {
          el.dataset.ordre = String(i);
          return i;
        }),
    );
    expect(order.length).toBeGreaterThan(20);
    await section(page).locator("a[href]").first().focus();
    const visited: string[] = [];
    for (let i = 0; i < order.length; i += 1) {
      visited.push(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.ordre ?? "hors"));
      await page.keyboard.press("Tab");
    }
    expect(visited).toEqual(order.map(String));
  });

  test("StopMarker : diamètres 20, 26, 38, 12 px ; terminus de carte 24 px ; décoratifs", async ({ page }) => {
    const size = async (selector: string) => {
      const box = (await section(page).locator(selector).last().boundingBox())!;
      return [Math.round(box.width), Math.round(box.height)];
    };
    expect(await size("[data-kind='stop'][data-variant='ligne']")).toEqual([20, 20]);
    expect(await size("[data-kind='terminus'][data-variant='ligne']")).toEqual([20, 20]);
    expect(await size("[data-kind='stop'][data-variant='carte']:not([data-selected])")).toEqual([26, 26]);
    expect(await size("[data-kind='stop'][data-selected='true']")).toEqual([38, 38]);
    expect(await size("[data-kind='terminus'][data-variant='carte']")).toEqual([24, 24]);
    expect(await size("[data-kind='overview']")).toEqual([12, 12]);
    const hidden = await section(page)
      .locator("[data-variant]")
      .evaluateAll((els) => els.every((el) => el.getAttribute("aria-hidden") === "true"));
    expect(hidden).toBe(true);
  });

  test("aucune animation ni transition sur la section Ligne", async ({ page }) => {
    const animated = await section(page).evaluate((root) =>
      [root, ...Array.from(root.querySelectorAll("*"))]
        .filter((el) => {
          const style = getComputedStyle(el);
          return style.animationName !== "none" || style.transitionDuration.split(",").some((d) => d.trim() !== "0s");
        })
        .map((el) => el.outerHTML.slice(0, 100)),
    );
    expect(animated).toEqual([]);
  });
});
