import { expect, test } from "@playwright/test";

const INTERACTIVE = "button, a[href], input, [role='radio'], [tabindex]:not([tabindex='-1'])";

test.describe("/dev/composants", () => {
  test("montre les huit composants et tient dans 390 px sans défilement horizontal", async ({ page }) => {
    await page.goto("/dev/composants");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    for (const name of [
      "Button",
      "IconButton",
      "Tag",
      "Counter",
      "Chip",
      "SegmentedControl",
      "OtpInput",
      "StatusBanner",
    ]) {
      await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("tout élément interactif mesure au moins 44 × 44 px", async ({ page }) => {
    await page.goto("/dev/composants");
    const elements = page.locator(INTERACTIVE);
    const count = await elements.count();
    expect(count).toBeGreaterThan(20);
    for (let index = 0; index < count; index += 1) {
      const box = await elements.nth(index).boundingBox();
      const description = await elements.nth(index).evaluate((el) => el.outerHTML.slice(0, 120));
      expect(box, description).not.toBeNull();
      expect(box!.width, description).toBeGreaterThanOrEqual(44);
      expect(box!.height, description).toBeGreaterThanOrEqual(44);
    }
  });

  test("Button md mesure 52 px de haut, sm 44 px", async ({ page }) => {
    await page.goto("/dev/composants");
    const md = await page.locator("[data-demo='button-md']").boundingBox();
    expect(md?.height).toBe(52);
    const sm = await page.getByRole("region", { name: "Button", exact: true }).locator("button.h-11").first().boundingBox();
    expect(sm?.height).toBe(44);
  });

  test("au clavier, chaque élément interactif affiche un contour de 2 px en line décalé de 2 px", async ({
    page,
  }) => {
    await page.goto("/dev/composants");
    const tabbable = await page.evaluate((selector) => {
      return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0,
      ).length;
    }, INTERACTIVE);
    expect(tabbable).toBeGreaterThan(20);

    const line = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim(),
    );
    const visited = new Set<string>();
    for (let step = 0; step < tabbable; step += 1) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) {
          return null;
        }
        if (!el.dataset.focusProbe) {
          el.dataset.focusProbe = String(Math.random());
        }
        const style = getComputedStyle(el);
        // Couleur normalisée en hexadécimal pour la comparer au token.
        const probe = document.createElement("span");
        probe.style.color = style.outlineColor;
        document.body.append(probe);
        const rgb = getComputedStyle(probe).color.match(/\d+/g)!.slice(0, 3).map(Number);
        probe.remove();
        return {
          id: el.dataset.focusProbe,
          html: el.outerHTML.slice(0, 120),
          focusVisible: el.matches(":focus-visible"),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineOffset: style.outlineOffset,
          outlineHex: `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
        };
      });
      expect(focus, `tabulation ${step + 1}`).not.toBeNull();
      visited.add(focus!.id);
      expect(focus!.focusVisible, focus!.html).toBe(true);
      expect(focus!.outlineStyle, focus!.html).toBe("solid");
      expect(focus!.outlineWidth, focus!.html).toBe("2px");
      expect(focus!.outlineOffset, focus!.html).toBe("2px");
      expect(focus!.outlineHex, focus!.html).toBe(line);
    }
    expect(visited.size).toBe(tabbable);
  });

  test("SegmentedControl : un seul arrêt de tabulation, flèches pour changer d'option", async ({ page }) => {
    await page.goto("/dev/composants");
    const group = page.getByRole("radiogroup");
    const checked = group.locator("[aria-checked='true']");
    await checked.focus();
    const before = await checked.textContent();
    await page.keyboard.press("ArrowRight");
    const after = group.locator("[aria-checked='true']");
    await expect(after).not.toHaveText(before ?? "");
    await expect(after).toBeFocused();
    await expect(group.locator("[tabindex='0']")).toHaveCount(1);
  });

  test("OtpInput : coller un code remplit les six positions", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/dev/composants");
    const group = page.getByRole("group").first();
    const first = group.getByRole("textbox").first();
    await first.focus();
    await page.evaluate(() => navigator.clipboard.writeText("123456"));
    await page.keyboard.press("ControlOrMeta+V");
    const values = await group.getByRole("textbox").evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value).join(""),
    );
    expect(values).toBe("123456");
  });

  test("aucune animation sous prefers-reduced-motion, y compris generating", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/dev/composants");
    const rail = page.locator("[data-kind='generating'] [data-rail]");
    // Sans préférence, le filet de génération est animé : le test ci-dessous a un objet.
    expect(await rail.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");

    await page.emulateMedia({ reducedMotion: "reduce" });
    const animated = await page.evaluate(() => {
      const names = Array.from(document.querySelectorAll("*"))
        .filter((el) => getComputedStyle(el).animationName !== "none")
        .map((el) => el.outerHTML.slice(0, 80));
      return { names, running: document.getAnimations().length };
    });
    expect(animated.names).toEqual([]);
    expect(animated.running).toBe(0);
  });
});
