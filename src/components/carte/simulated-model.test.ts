// @vitest-environment node
import { describe, expect, it } from "vitest";

import { MAX_ZOOM, drag, fitCamera, offsetCamera, project, scaleAt } from "./simulated-model";

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

  it("marge asymétrique (panneau en bas) : la boîte est centrée dans la zone hors marge", () => {
    const positions = [{ lat: 55.95, lng: -3.2 }, { lat: 55.96, lng: -3.18 }];
    const size = { width: 390, height: 844 };
    const camera = fitCamera(positions, size, { top: 44, right: 44, bottom: 464, left: 44 })!;
    // Centre de la boîte projeté au milieu de la zone visible : (844 − 464 + 44) / 2 = 212 px depuis le haut.
    const { x, y } = project({ lat: 55.955, lng: -3.19 }, camera);
    expect(x).toBeCloseTo(0);
    expect(size.height / 2 - y).toBeCloseTo((44 + (844 - 464)) / 2);
  });

  it("plafonne le zoom pour une seule position et renvoie null sans position", () => {
    expect(fitCamera([{ lat: 1, lng: 1 }], { width: 390, height: 320 }, PADDING)?.zoom).toBe(MAX_ZOOM);
    expect(fitCamera([], { width: 390, height: 320 }, PADDING)).toBeNull();
  });

  describe("offsetCamera (décision 0016 § 2)", () => {
    const target = { lat: 55.9486, lng: -3.1999 };
    const size = { width: 390, height: 844 };

    it("inserts absents, nuls ou symétriques : centre sur la cible", () => {
      expect(offsetCamera(target, undefined, 14)).toEqual(target);
      expect(offsetCamera(target, { top: 0, right: 0, bottom: 0, left: 0 }, 14)).toEqual(target);
      expect(offsetCamera(target, { top: 100, right: 30, bottom: 100, left: 30 }, 14)).toEqual(target);
    });

    it("panneau en bas : centre au sud de la cible, longitude inchangée", () => {
      const center = offsetCamera(target, { top: 0, right: 0, bottom: 464, left: 0 }, 14);
      expect(center.lat).toBeLessThan(target.lat);
      expect(center.lng).toBe(target.lng);
    });

    it.each([0.25, 0.55, 0.92])(
      "panneau à %s : la cible tombe au milieu de la zone non couverte, à 10⁻⁶ px près",
      (part) => {
        const zoom = 15;
        const insets = { top: 0, right: 0, bottom: part * size.height, left: 0 };
        const camera = { center: offsetCamera(target, insets, zoom), zoom };
        const { x, y } = project(target, camera);
        expect(Math.abs(size.width / 2 + x - size.width / 2)).toBeLessThan(1e-6);
        expect(Math.abs(size.height / 2 - y - (size.height - insets.bottom) / 2)).toBeLessThan(1e-6);
      },
    );

    it("marge à gauche : centre à l'ouest de la cible, cible au milieu de la zone à droite de la marge", () => {
      const zoom = 15;
      const insets = { top: 0, right: 0, bottom: 0, left: 100 };
      const camera = { center: offsetCamera(target, insets, zoom), zoom };
      expect(camera.center.lng).toBeLessThan(target.lng);
      const { x } = project(target, camera);
      expect(Math.abs(size.width / 2 + x - (100 + (size.width - 100) / 2))).toBeLessThan(1e-6);
    });

    it("fitCamera applique la même formule à sa marge asymétrique", () => {
      const positions = [{ lat: 55.95, lng: -3.2 }, { lat: 55.96, lng: -3.18 }];
      const padding = { top: 44, right: 10, bottom: 464, left: 44 };
      const camera = fitCamera(positions, size, padding)!;
      const middle = { lat: (55.96 + 55.95) / 2, lng: (-3.18 + -3.2) / 2 };
      expect(camera.center).toEqual(offsetCamera(middle, padding, camera.zoom));
    });
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
