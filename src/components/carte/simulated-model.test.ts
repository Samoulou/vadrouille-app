// @vitest-environment node
import { describe, expect, it } from "vitest";

import { MAX_ZOOM, drag, fitCamera, project, scaleAt } from "./simulated-model";

const PADDING = { top: 44, right: 44, bottom: 44, left: 44 };

describe("modèle de la carte simulée", () => {
  it("échelle : 256 × 2^z / 360 pixels par degré", () => {
    expect(scaleAt(0)).toBeCloseTo(256 / 360);
    expect(scaleAt(13)).toBeCloseTo((256 * 8192) / 360);
  });

  it("projette depuis le centre, latitude croissante vers le haut", () => {
    const camera = { center: { lat: 10, lng: 20 }, zoom: 0 };
    const { x, y } = project({ lat: 11, lng: 22 }, camera);
    expect(x).toBeCloseTo(2 * scaleAt(0));
    expect(y).toBeCloseTo(scaleAt(0));
  });

  it("cadre sur le milieu de la boîte avec le plus grand zoom entier qui tient", () => {
    const camera = fitCamera([{ lat: 55.95, lng: -3.2 }, { lat: 55.96, lng: -3.18 }], { width: 390, height: 320 }, PADDING)!;
    expect(camera.center.lat).toBeCloseTo(55.955);
    expect(camera.center.lng).toBeCloseTo(-3.19);
    // Largeur utile 302 px : 0,02° tient au zoom 14 (233 px), pas au zoom 15 (466 px).
    expect(camera.zoom).toBe(14);
  });

  it("plafonne le zoom pour une seule position et renvoie null sans position", () => {
    expect(fitCamera([{ lat: 1, lng: 1 }], { width: 390, height: 320 }, PADDING)?.zoom).toBe(MAX_ZOOM);
    expect(fitCamera([], { width: 390, height: 320 }, PADDING)).toBeNull();
  });

  it("glisser vers la gauche augmente la longitude du centre, zoom inchangé", () => {
    const camera = { center: { lat: 55, lng: -3 }, zoom: 13 };
    const moved = drag(camera, -100, 0);
    expect(moved.zoom).toBe(13);
    expect(moved.center.lng).toBeCloseTo(-3 + 100 / scaleAt(13));
    expect(moved.center.lat).toBe(55);
    expect(drag(camera, 0, 50).center.lat).toBeCloseTo(55 + 50 / scaleAt(13));
  });
});
