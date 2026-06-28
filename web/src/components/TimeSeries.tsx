import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  type ChartData,
  type ChartDataset,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { QueryDataRow } from '../api/client';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

export interface TimeSeriesProps {
  data: QueryDataRow[];
  metric: 'vtec' | 'stec' | 'veq';
  svFilter: string | null;
  loading: boolean;
  error: string | null;
}

const LEGEND_HIDE_THRESHOLD = 12;
type TimeSeriesPoint = { x: number; y: number };

/**
 * Generates a deterministic hue for a given satellite identifier.
 */
function svHue(sv: string): number {
  let hash = 0;
  for (let i = 0; i < sv.length; i++) {
    hash = sv.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function TimeSeries({ data, metric, svFilter, loading, error }: TimeSeriesProps) {
  if (loading) {
    return (
      <div className="empty-state" style={{ minHeight: 240 }} role="status" aria-label="Loading">
        Loading chart…
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-banner status-banner--error" role="alert">
        {error}
      </div>
    );
  }

  const filtered = svFilter ? data.filter((row) => row.sv === svFilter) : data;

  if (filtered.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: 240 }} role="status">
        <strong>No data for this selection</strong>
        <p>Try another date or clear the satellite filter.</p>
      </div>
    );
  }

  // Group data by satellite vehicle (sv)
  const grouped = new Map<string, QueryDataRow[]>();
  for (const row of filtered) {
    const existing = grouped.get(row.sv);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.sv, [row]);
    }
  }

  // Sort each group by epoch for proper line rendering
  for (const rows of grouped.values()) {
    rows.sort((a, b) => new Date(a.epoch).getTime() - new Date(b.epoch).getTime());
  }

  const denseMultiSeries = !svFilter && grouped.size > LEGEND_HIDE_THRESHOLD;

  const datasets: ChartDataset<'line', TimeSeriesPoint[]>[] = Array.from(grouped.entries()).map(
    ([sv, rows]) => ({
      label: sv,
      data: rows.map((row) => ({
        x: new Date(row.epoch).getTime(),
        y: row[metric],
      })),
      borderColor: `hsla(${svHue(sv)}, 70%, 45%, ${denseMultiSeries ? 0.45 : 0.9})`,
      backgroundColor: `hsla(${svHue(sv)}, 70%, 45%, 0.9)`,
      pointRadius: svFilter ? 1.5 : 0,
      pointHoverRadius: svFilter ? 3 : 2,
      borderWidth: svFilter ? 1.8 : 1.1,
      tension: 0.05,
      fill: false,
      parsing: false,
    })
  );

  const chartData: ChartData<'line', TimeSeriesPoint[]> = { datasets };

  const options: ChartOptions<'line'> = {
    responsive: true,
    animation: false,
    normalized: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: !denseMultiSeries,
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `${metric.toUpperCase()} Time Series`,
      },
      decimation: {
        enabled: true,
        algorithm: 'lttb' as const,
        samples: 400,
      },
    },
    scales: {
      x: {
        type: 'linear' as const,
        title: {
          display: true,
          text: 'Epoch',
        },
        ticks: {
          callback: function (tickValue: string | number) {
            const date = new Date(Number(tickValue));
            return date.toISOString().substring(11, 19);
          },
        },
      },
      y: {
        title: {
          display: true,
          text: metric.toUpperCase(),
        },
      },
    },
  };

  return (
    <div>
      {denseMultiSeries && (
        <div className="status-banner status-banner--info" style={{ marginBottom: 8 }}>
          Showing {grouped.size} satellites. Use Satellite filter to inspect a single SV clearly.
        </div>
      )}
      <div aria-label={`${metric.toUpperCase()} time series chart`} style={{ height: 300 }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}

export default TimeSeries;
