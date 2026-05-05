//WGS84 helpers for short range, no deps

const EARTH_RADIUS_M = 6_371_008.8;

export type LatLon = { lat: number; lon: number };

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

//finite lat lon inside normal bounds
export function isValidLatLon(p: { lat: number; lon: number } | null | undefined): p is LatLon {
  if (!p) return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
  if (p.lat < -90 || p.lat > 90) return false;
  if (p.lon < -180 || p.lon > 180) return false;
  return true;
}

//great circle length in m
export function haversineDistanceM(a: LatLon, b: LatLon): number {
  const phi1 = toRadians(a.lat);
  const phi2 = toRadians(b.lat);
  const dPhi = toRadians(b.lat - a.lat);
  const dLambda = toRadians(b.lon - a.lon);
  const s = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return EARTH_RADIUS_M * c;
}

//initial bearing true deg 0..360 from -> to
export function initialBearingDeg(from: LatLon, to: LatLon): number {
  const phi1 = toRadians(from.lat);
  const phi2 = toRadians(to.lat);
  const dLambda = toRadians(to.lon - from.lon);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return (toDegrees(theta) + 360) % 360;
}

//local east north offset m from anchor (ok for km scale)
export function enuFromAnchor(anchor: LatLon, point: LatLon): { east: number; north: number } {
  const dPhi = toRadians(point.lat - anchor.lat);
  const dLambda = toRadians(point.lon - anchor.lon);
  const meanPhi = toRadians((anchor.lat + point.lat) / 2);
  return {
    east: dLambda * Math.cos(meanPhi) * EARTH_RADIUS_M,
    north: dPhi * EARTH_RADIUS_M,
  };
}
