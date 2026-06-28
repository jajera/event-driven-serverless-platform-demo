import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { QueryDataRow } from '../api/client';

export interface IppMapProps {
  data: QueryDataRow[];
  loading: boolean;
  error: string | null;
}

interface ViewportBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface GeoPoint {
  lat: number;
  lon: number;
}

interface MapPoint extends QueryDataRow {
  mapLon: number;
}

/**
 * Interpolate a color between blue (low vtec) and red (high vtec).
 * Returns an rgb() CSS string.
 */
function vtecToColor(vtec: number, min: number, max: number): string {
  if (max === min) return 'rgb(0, 0, 255)';
  const t = Math.max(0, Math.min(1, (vtec - min) / (max - min)));
  // Blue (0,0,255) → Red (255,0,0)
  const r = Math.round(255 * t);
  const b = Math.round(255 * (1 - t));
  return `rgb(${r}, 0, ${b})`;
}

/**
 * Filter data points that have valid lat_ipp and lon_ipp coordinates.
 */
function getValidPoints(data: QueryDataRow[]): QueryDataRow[] {
  return data.filter(
    (row) =>
      row.lat_ipp != null &&
      row.lon_ipp != null &&
      isFinite(row.lat_ipp) &&
      isFinite(row.lon_ipp)
  );
}

function normalizeLongitude(lon: number): number {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function clusterAnchorLongitude(longitudes: number[]): number {
  if (longitudes.length === 0) return 0;
  const radians = longitudes.map((lon) => (lon * Math.PI) / 180);
  const sinSum = radians.reduce((acc, r) => acc + Math.sin(r), 0);
  const cosSum = radians.reduce((acc, r) => acc + Math.cos(r), 0);
  if (sinSum === 0 && cosSum === 0) {
    return normalizeLongitude(longitudes[0] ?? 0);
  }
  return (Math.atan2(sinSum, cosSum) * 180) / Math.PI;
}

function unwrapLongitude(lon: number, anchor: number): number {
  let unwrapped = normalizeLongitude(lon);
  while (unwrapped - anchor > 180) unwrapped -= 360;
  while (unwrapped - anchor < -180) unwrapped += 360;
  return unwrapped;
}

function normalizeMapPoints(points: QueryDataRow[]): MapPoint[] {
  if (points.length === 0) return [];
  const normalizedLons = points.map((point) => normalizeLongitude(point.lon_ipp));
  const anchor = clusterAnchorLongitude(normalizedLons);
  return points.map((point, index) => ({
    ...point,
    mapLon: unwrapLongitude(normalizedLons[index] ?? point.lon_ipp, anchor),
  }));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  if (lower === upper) return lowerValue;
  const weight = index - lower;
  return lowerValue * (1 - weight) + upperValue * weight;
}

/**
 * Compute viewport bounds that ignore extreme outliers while keeping the cluster in focus.
 */
function computeFocusedBoundsForGeoPoints(points: GeoPoint[]): ViewportBounds | null {
  if (points.length === 0) return null;

  let viewportPoints = points;
  if (points.length >= 8) {
    const lats = points.map((p) => p.lat).sort((a, b) => a - b);
    const lons = points.map((p) => p.lon).sort((a, b) => a - b);
    const latQ1 = percentile(lats, 0.25);
    const latQ3 = percentile(lats, 0.75);
    const lonQ1 = percentile(lons, 0.25);
    const lonQ3 = percentile(lons, 0.75);
    const latIqr = latQ3 - latQ1;
    const lonIqr = lonQ3 - lonQ1;
    const latLower = latQ1 - 1.5 * latIqr;
    const latUpper = latQ3 + 1.5 * latIqr;
    const lonLower = lonQ1 - 1.5 * lonIqr;
    const lonUpper = lonQ3 + 1.5 * lonIqr;

    const inlierPoints = points.filter(
      (p) =>
        p.lat >= latLower &&
        p.lat <= latUpper &&
        p.lon >= lonLower &&
        p.lon <= lonUpper
    );
    if (inlierPoints.length >= 3) {
      viewportPoints = inlierPoints;
    }
  }

  const lats = viewportPoints.map((p) => p.lat).sort((a, b) => a - b);
  const lons = viewportPoints.map((p) => p.lon).sort((a, b) => a - b);
  const trim = viewportPoints.length >= 20 ? 0.02 : 0;

  let south = percentile(lats, trim);
  let north = percentile(lats, 1 - trim);
  let west = percentile(lons, trim);
  let east = percentile(lons, 1 - trim);

  // Ensure a minimum span so the map does not over-zoom on near-identical points.
  const minSpan = 0.08;
  if (north - south < minSpan) {
    const center = (north + south) / 2;
    south = center - minSpan / 2;
    north = center + minSpan / 2;
  }
  if (east - west < minSpan) {
    const center = (east + west) / 2;
    west = center - minSpan / 2;
    east = center + minSpan / 2;
  }

  return { south, west, north, east };
}

export function computeFocusedBounds(points: QueryDataRow[]): ViewportBounds | null {
  const mapPoints = normalizeMapPoints(points).map((point) => ({
    lat: point.lat_ipp,
    lon: point.mapLon,
  }));
  return computeFocusedBoundsForGeoPoints(mapPoints);
}

function FitFocusedBounds({ bounds }: { bounds: ViewportBounds }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      {
        padding: [24, 24],
        maxZoom: 9,
      }
    );
  }, [map, bounds.south, bounds.west, bounds.north, bounds.east]);

  return null;
}

/**
 * IppMap renders a geographic Leaflet map with IPP coordinates color-coded by vtec magnitude.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
export default function IppMap({ data, loading, error }: IppMapProps) {
  const validPoints = useMemo(() => getValidPoints(data), [data]);
  const mapPoints = useMemo(() => normalizeMapPoints(validPoints), [validPoints]);

  const { minVtec, maxVtec } = useMemo(() => {
    if (mapPoints.length === 0) return { minVtec: 0, maxVtec: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const p of mapPoints) {
      if (p.vtec < min) min = p.vtec;
      if (p.vtec > max) max = p.vtec;
    }
    return { minVtec: min, maxVtec: max };
  }, [mapPoints]);

  const focusedBounds = useMemo(
    () =>
      computeFocusedBoundsForGeoPoints(
        mapPoints.map((point) => ({ lat: point.lat_ipp, lon: point.mapLon }))
      ),
    [mapPoints]
  );

  if (loading) {
    return (
      <div className="empty-state" style={{ minHeight: 400 }} data-testid="ipp-map-loading">
        Loading map…
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-banner status-banner--error" data-testid="ipp-map-error">
        {error}
      </div>
    );
  }

  if (mapPoints.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: 400 }} data-testid="ipp-map-no-data">
        <strong>No map points</strong>
        <p>IPP coordinates appear once TEC data is loaded.</p>
      </div>
    );
  }

  const firstPoint = mapPoints[0]!;

  return (
    <div data-testid="ipp-map-container">
      <MapContainer
        center={[firstPoint.lat_ipp, firstPoint.mapLon]}
        zoom={6}
        style={{ height: '500px', width: '100%' }}
      >
        {focusedBounds && <FitFocusedBounds bounds={focusedBounds} />}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mapPoints.map((point, index) => (
          <CircleMarker
            key={index}
            center={[point.lat_ipp, point.mapLon]}
            radius={5}
            pathOptions={{
              color: vtecToColor(point.vtec, minVtec, maxVtec),
              fillColor: vtecToColor(point.vtec, minVtec, maxVtec),
              fillOpacity: 0.8,
            }}
          >
            <Tooltip>
              <div>
                <strong>SV:</strong> {point.sv}
                <br />
                <strong>VTEC:</strong> {point.vtec.toFixed(2)} TECU
                <br />
                <strong>STEC:</strong> {point.stec.toFixed(2)} TECU
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <VtecLegend min={minVtec} max={maxVtec} />
    </div>
  );
}

/**
 * Color scale legend showing vtec gradient from low (blue) to high (red).
 */
function VtecLegend({ min, max }: { min: number; max: number }) {
  const steps = 5;
  const labels = Array.from({ length: steps + 1 }, (_, i) => {
    const value = min + ((max - min) * i) / steps;
    return value.toFixed(1);
  });

  return (
    <div
      data-testid="ipp-map-legend"
      style={{
        display: 'flex',
        alignItems: 'center',
        marginTop: '8px',
        gap: '4px',
      }}
    >
      <span style={{ fontSize: '12px' }}>VTEC:</span>
      <span style={{ fontSize: '12px' }}>{labels[0]}</span>
      <div
        style={{
          width: '200px',
          height: '16px',
          background: 'linear-gradient(to right, rgb(0, 0, 255), rgb(255, 0, 0))',
          borderRadius: '2px',
        }}
      />
      <span style={{ fontSize: '12px' }}>{labels[labels.length - 1]}</span>
      <span style={{ fontSize: '12px' }}>TECU</span>
    </div>
  );
}
