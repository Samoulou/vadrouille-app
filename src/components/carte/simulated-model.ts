import { boundsOf, type LatLng } from "./route";
import type { FitPadding } from "./types";

/**
 * Modèle de la carte simulée (F4-TL-2), déterministe et sans réseau :
 * projection équirectangulaire fixe, sans correction de Mercator.
 */

export interface Camera {
  center: LatLng;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Zoom maximal du cadrage (une seule position, ou positions confondues). */
export const MAX_ZOOM = 18;

/** Pixels par degré au zoom `zoom` : 256 × 2^zoom / 360, en longitude comme en latitude. */
export function scaleAt(zoom: number): number {
  return (256 * 2 ** zoom) / 360;
}

/** Décalage d'une position depuis le centre du conteneur : x vers la droite, y vers le haut. */
export function project(position: LatLng, camera: Camera): { x: number; y: number } {
  const scale = scaleAt(camera.zoom);
  return {
    x: (position.lng - camera.center.lng) * scale,
    y: (position.lat - camera.center.lat) * scale,
  };
}

/**
 * Cadrage : centre = milieu de la boîte englobante ; zoom = plus grand entier (0 à MAX_ZOOM)
 * qui fait tenir la boîte dans le conteneur moins la marge.
 */
export function fitCamera(positions: LatLng[], size: Size, padding: FitPadding): Camera | null {
  const box = boundsOf(positions);
  if (!box) {
    return null;
  }
  const center = { lat: (box.north + box.south) / 2, lng: (box.east + box.west) / 2 };
  const width = Math.max(0, size.width - padding.left - padding.right);
  const height = Math.max(0, size.height - padding.top - padding.bottom);
  const lngSpan = box.east - box.west;
  const latSpan = box.north - box.south;
  let zoom = 0;
  for (let z = MAX_ZOOM; z >= 0; z -= 1) {
    const scale = scaleAt(z);
    if (lngSpan * scale <= width && latSpan * scale <= height) {
      zoom = z;
      break;
    }
  }
  return { center, zoom };
}

/** Glisser de (dx, dy) pixels : le centre se déplace de l'opposé, converti par l'échelle. */
export function drag(camera: Camera, dx: number, dy: number): Camera {
  const scale = scaleAt(camera.zoom);
  return {
    zoom: camera.zoom,
    center: { lat: camera.center.lat + dy / scale, lng: camera.center.lng - dx / scale },
  };
}
