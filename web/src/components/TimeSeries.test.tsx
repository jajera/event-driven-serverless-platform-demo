import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TimeSeries } from './TimeSeries';
import type { QueryDataRow } from '../api/client';

const mockData: QueryDataRow[] = [
  {
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
  },
  {
    epoch: '2024-05-29T02:00:00Z',
    sv: 'G01',
    id_arc: 1,
    lat_ipp: -36.86,
    lon_ipp: 174.77,
    azi: 46.0,
    ele: 31.0,
    bias: 0.4,
    stec: 13.0,
    vtec: 9.0,
    veq: 9.5,
  },
  {
    epoch: '2024-05-29T01:30:00Z',
    sv: 'G02',
    id_arc: 2,
    lat_ipp: -37.0,
    lon_ipp: 175.0,
    azi: 50.0,
    ele: 35.0,
    bias: 0.3,
    stec: 10.0,
    vtec: 7.5,
    veq: 8.0,
  },
];

function makeDenseSatelliteRows(count: number): QueryDataRow[] {
  return Array.from({ length: count }, (_, i) => ({
    epoch: `2024-05-29T${String((i % 24)).padStart(2, '0')}:00:00Z`,
    sv: `G${String(i + 1).padStart(2, '0')}`,
    id_arc: i + 1,
    lat_ipp: -36.85 + i * 0.01,
    lon_ipp: 174.76 + i * 0.01,
    azi: 45.2,
    ele: 30.1,
    bias: 0.5,
    stec: 12.3 + i * 0.2,
    vtec: 8.7 + i * 0.1,
    veq: 9.1 + i * 0.1,
  }));
}

describe('TimeSeries', () => {
  it('renders loading state', () => {
    render(
      <TimeSeries data={[]} metric="vtec" svFilter={null} loading={true} error={null} />
    );
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByText(/Loading chart/)).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(
      <TimeSeries
        data={[]}
        metric="vtec"
        svFilter={null}
        loading={false}
        error="Failed to load data"
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
  });

  it('renders no data message when data is empty', () => {
    render(
      <TimeSeries data={[]} metric="vtec" svFilter={null} loading={false} error={null} />
    );
    expect(screen.getByText(/No data for this selection/)).toBeInTheDocument();
  });

  it('renders no data message when svFilter results in empty set', () => {
    render(
      <TimeSeries data={mockData} metric="vtec" svFilter="G99" loading={false} error={null} />
    );
    expect(screen.getByText(/No data for this selection/)).toBeInTheDocument();
  });

  it('renders chart with data', () => {
    render(
      <TimeSeries data={mockData} metric="vtec" svFilter={null} loading={false} error={null} />
    );
    expect(screen.getByLabelText('VTEC time series chart')).toBeInTheDocument();
    // Chart canvas should be rendered
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders chart filtered by sv', () => {
    render(
      <TimeSeries data={mockData} metric="stec" svFilter="G01" loading={false} error={null} />
    );
    expect(screen.getByLabelText('STEC time series chart')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders chart for veq metric', () => {
    render(
      <TimeSeries data={mockData} metric="veq" svFilter={null} loading={false} error={null} />
    );
    expect(screen.getByLabelText('VEQ time series chart')).toBeInTheDocument();
  });

  it('shows dense-series guidance when many satellites are present', () => {
    render(
      <TimeSeries
        data={makeDenseSatelliteRows(13)}
        metric="vtec"
        svFilter={null}
        loading={false}
        error={null}
      />
    );
    expect(screen.getByText(/Showing 13 satellites/)).toBeInTheDocument();
    expect(screen.getByText(/Use Satellite filter/)).toBeInTheDocument();
  });

  it('does not show dense-series guidance when sv filter is selected', () => {
    render(
      <TimeSeries
        data={makeDenseSatelliteRows(13)}
        metric="vtec"
        svFilter="G01"
        loading={false}
        error={null}
      />
    );
    expect(screen.queryByText(/Use Satellite filter/)).not.toBeInTheDocument();
  });

  it('prioritizes loading over error', () => {
    render(
      <TimeSeries data={[]} metric="vtec" svFilter={null} loading={true} error="Some error" />
    );
    expect(screen.getByText(/Loading chart/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('prioritizes error over empty data', () => {
    render(
      <TimeSeries data={[]} metric="vtec" svFilter={null} loading={false} error="Server error" />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/No data for this selection/)).not.toBeInTheDocument();
  });
});
