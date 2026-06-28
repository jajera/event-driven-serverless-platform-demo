import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

// Mock the API client
vi.mock('./api/client', () => ({
  queryData: vi.fn().mockResolvedValue({ data: [], meta: { row_count: 0, truncated: false } }),
  fetchCatalogStations: vi.fn().mockResolvedValue({
    stations: ['AUCK', 'WGTN', 'CHCH', 'DNVK'],
  }),
  fetchCatalogDates: vi.fn().mockResolvedValue({
    dates: [
      { year: 2026, doy: 176 },
      { year: 2026, doy: 175 },
    ],
  }),
  submitReprocess: vi.fn(),
  getJobStatus: vi.fn(),
  isApiError: vi.fn((err) => err && typeof err === 'object' && 'message' in err && 'statusCode' in err),
}));

// Mock react-chartjs-2
vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="mock-chart">Chart</div>,
}));

// Mock chart.js
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {},
  LinearScale: class {},
  PointElement: class {},
  LineElement: class {},
  Title: class {},
  Tooltip: class {},
  Legend: class {},
  TimeScale: class {},
}));

// Mock react-leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-map">{children}</div>,
  TileLayer: () => null,
  CircleMarker: () => null,
  Tooltip: () => null,
}));

// Mock leaflet CSS import
vi.mock('leaflet/dist/leaflet.css', () => ({}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('GNSS TEC Platform');
  });

  it('renders the station list with demo stations', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText('Station list')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Select station AUCK')).toBeInTheDocument();
    expect(screen.getByLabelText('Select station WGTN')).toBeInTheDocument();
    expect(screen.getByLabelText('Select station CHCH')).toBeInTheDocument();
    expect(screen.getByLabelText('Select station DNVK')).toBeInTheDocument();
  });

  it('loads dates when a station is selected', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText('Select station AUCK')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Select station AUCK'));

    await waitFor(() => {
      expect(screen.getByText(/Dates for AUCK/)).toBeInTheDocument();
    });
  });

  it('renders the ParameterPanel after selecting a station', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText('Select station AUCK')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Select station AUCK'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Start time/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/End time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Satellite filter/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Metric')).toBeInTheDocument();
  });

  it('shows empty state before a station is selected', () => {
    render(<App />);
    expect(screen.getByText(/Select a station to begin/)).toBeInTheDocument();
  });

  it('queries API when a station is selected', async () => {
    const { queryData } = await import('./api/client');
    const mockQueryData = vi.mocked(queryData);
    mockQueryData.mockResolvedValue({
      data: [],
      meta: { row_count: 0, truncated: false },
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText('Select station AUCK')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Select station AUCK'));

    await waitFor(() => {
      expect(mockQueryData).toHaveBeenCalledWith(
        expect.objectContaining({
          station: 'AUCK',
        })
      );
    });
  });
});
