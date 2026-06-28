import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import IppMap, { computeFocusedBounds } from './IppMap';
import type { QueryDataRow } from '../api/client';

const fitBoundsMock = vi.fn();

// Mock react-leaflet components since jsdom doesn't support Leaflet's DOM requirements
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="leaflet-map">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="circle-marker">{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  useMap: () => ({
    fitBounds: fitBoundsMock,
  }),
}));

function makeRow(overrides: Partial<QueryDataRow> = {}): QueryDataRow {
  return {
    epoch: '2024-05-29T01:00:00Z',
    sv: 'G01',
    id_arc: 1,
    lat_ipp: -36.85,
    lon_ipp: 174.76,
    azi: 45.2,
    ele: 30.1,
    bias: 0.5,
    stec: 12.3,
    vtec: 8.7,
    veq: 9.1,
    ...overrides,
  };
}

describe('IppMap', () => {
  it('computeFocusedBounds returns null for empty points', () => {
    expect(computeFocusedBounds([])).toBeNull();
  });

  it('computeFocusedBounds trims extreme outliers for dense point sets', () => {
    const clusteredRows = Array.from({ length: 24 }, (_, i) =>
      makeRow({
        lat_ipp: -36.9 + i * 0.005,
        lon_ipp: 174.7 + i * 0.005,
      })
    );
    const rows = [
      ...clusteredRows,
      makeRow({ lat_ipp: 60, lon_ipp: 10 }),
      makeRow({ lat_ipp: -70, lon_ipp: -150 }),
    ];

    const bounds = computeFocusedBounds(rows);
    expect(bounds).not.toBeNull();
    expect(bounds!.north).toBeLessThan(0);
    expect(bounds!.south).toBeGreaterThan(-50);
    expect(bounds!.east).toBeLessThan(180);
    expect(bounds!.west).toBeGreaterThan(100);
  });

  it('computeFocusedBounds keeps dateline-crossing clusters focused', () => {
    const rows = [
      makeRow({ lat_ipp: -36.85, lon_ipp: 179.4 }),
      makeRow({ lat_ipp: -36.82, lon_ipp: -179.8 }),
      makeRow({ lat_ipp: -36.79, lon_ipp: 179.9 }),
      makeRow({ lat_ipp: -36.8, lon_ipp: -179.6 }),
    ];
    const bounds = computeFocusedBounds(rows);
    expect(bounds).not.toBeNull();
    expect((bounds!.east - bounds!.west) < 10).toBe(true);
  });

  it('shows loading state', () => {
    render(<IppMap data={[]} loading={true} error={null} />);
    expect(screen.getByTestId('ipp-map-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading map…')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<IppMap data={[]} loading={false} error="Something went wrong" />);
    expect(screen.getByTestId('ipp-map-error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows no-data message when data is empty', () => {
    render(<IppMap data={[]} loading={false} error={null} />);
    expect(screen.getByTestId('ipp-map-no-data')).toBeInTheDocument();
    expect(screen.getByText(/No map points/)).toBeInTheDocument();
  });

  it('shows no-data message when coordinates are invalid', () => {
    const rows = [
      makeRow({ lat_ipp: NaN, lon_ipp: NaN }),
      makeRow({ lat_ipp: Infinity, lon_ipp: 174.76 }),
    ];
    render(<IppMap data={rows} loading={false} error={null} />);
    expect(screen.getByTestId('ipp-map-no-data')).toBeInTheDocument();
  });

  it('renders map with circle markers for valid data', () => {
    fitBoundsMock.mockClear();
    const rows = [
      makeRow({ sv: 'G01', vtec: 5.0, stec: 10.0 }),
      makeRow({ sv: 'G02', vtec: 15.0, stec: 20.0, lat_ipp: -37.0, lon_ipp: 175.0 }),
    ];
    render(<IppMap data={rows} loading={false} error={null} />);
    expect(screen.getByTestId('ipp-map-container')).toBeInTheDocument();
    expect(screen.getByTestId('leaflet-map')).toBeInTheDocument();
    const markers = screen.getAllByTestId('circle-marker');
    expect(markers).toHaveLength(2);
    expect(fitBoundsMock).toHaveBeenCalled();
    const [bounds, options] = fitBoundsMock.mock.calls[0];
    expect(bounds).toHaveLength(2);
    expect(options).toMatchObject({ maxZoom: 9, padding: [24, 24] });
  });

  it('displays tooltip with vtec, stec, and sv values', () => {
    const rows = [makeRow({ sv: 'G05', vtec: 8.7, stec: 12.3 })];
    render(<IppMap data={rows} loading={false} error={null} />);
    const tooltip = screen.getByTestId('tooltip');
    expect(tooltip).toHaveTextContent('SV:');
    expect(tooltip).toHaveTextContent('G05');
    expect(tooltip).toHaveTextContent('8.70 TECU');
    expect(tooltip).toHaveTextContent('12.30 TECU');
  });

  it('renders color scale legend', () => {
    const rows = [
      makeRow({ vtec: 2.0 }),
      makeRow({ vtec: 20.0, lat_ipp: -37.0, lon_ipp: 175.0 }),
    ];
    render(<IppMap data={rows} loading={false} error={null} />);
    const legend = screen.getByTestId('ipp-map-legend');
    expect(legend).toBeInTheDocument();
    expect(legend).toHaveTextContent('VTEC:');
    expect(legend).toHaveTextContent('TECU');
    expect(legend).toHaveTextContent('2.0');
    expect(legend).toHaveTextContent('20.0');
  });

  it('updates markers when data changes', () => {
    const rows1 = [makeRow({ sv: 'G01' })];
    const rows2 = [
      makeRow({ sv: 'G01' }),
      makeRow({ sv: 'G02', lat_ipp: -37.0, lon_ipp: 175.0 }),
      makeRow({ sv: 'G03', lat_ipp: -38.0, lon_ipp: 176.0 }),
    ];

    const { rerender } = render(<IppMap data={rows1} loading={false} error={null} />);
    expect(screen.getAllByTestId('circle-marker')).toHaveLength(1);

    rerender(<IppMap data={rows2} loading={false} error={null} />);
    expect(screen.getAllByTestId('circle-marker')).toHaveLength(3);
  });
});
