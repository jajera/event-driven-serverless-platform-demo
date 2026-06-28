import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StationBrowser, StationBrowserProps } from './StationBrowser';

function renderBrowser(overrides: Partial<StationBrowserProps> = {}) {
  const defaults: StationBrowserProps = {
    stations: [],
    selectedStation: null,
    selectedYear: null,
    selectedDoy: null,
    dates: [],
    onStationSelect: vi.fn(),
    onDateSelect: vi.fn(),
    loading: false,
    error: null,
    onRetry: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<StationBrowser {...props} />), props };
}

describe('StationBrowser', () => {
  it('displays loading state', () => {
    renderBrowser({ loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading stations');
  });

  it('displays error state with retry button', () => {
    const onRetry = vi.fn();
    renderBrowser({ error: 'Failed to load stations', onRetry });

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load stations');
    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('displays empty state when no stations exist', () => {
    renderBrowser({ stations: [] });
    expect(screen.getByText('No stations available')).toBeInTheDocument();
  });

  it('displays station list', () => {
    renderBrowser({ stations: ['AUCK', 'WGTN', 'CHCH'] });
    expect(screen.getByLabelText('Station list')).toBeInTheDocument();
    expect(screen.getByLabelText('Select station AUCK')).toBeInTheDocument();
    expect(screen.getByLabelText('Select station WGTN')).toBeInTheDocument();
    expect(screen.getByLabelText('Select station CHCH')).toBeInTheDocument();
  });

  it('calls onStationSelect when a station is clicked', () => {
    const onStationSelect = vi.fn();
    renderBrowser({ stations: ['AUCK', 'WGTN'], onStationSelect });

    fireEvent.click(screen.getByLabelText('Select station WGTN'));
    expect(onStationSelect).toHaveBeenCalledWith('WGTN');
  });

  it('selects first filtered station on enter in search', () => {
    const onStationSelect = vi.fn();
    renderBrowser({ stations: ['AUCK', 'WGTN', 'CHCH'], onStationSelect });

    const search = screen.getByLabelText('Search stations');
    fireEvent.change(search, { target: { value: 'WG' } });
    fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' });

    expect(onStationSelect).toHaveBeenCalledWith('WGTN');
  });

  it('shows dates in descending order when a station is selected', () => {
    renderBrowser({
      stations: ['AUCK'],
      selectedStation: 'AUCK',
      dates: [
        { year: 2024, doy: 10 },
        { year: 2024, doy: 150 },
        { year: 2023, doy: 365 },
      ],
    });

    const dateList = screen.getByLabelText('Date list');
    const items = dateList.querySelectorAll('li');
    expect(items).toHaveLength(3);
    // Descending: 2024/150, 2024/010, 2023/365
    expect(items[0]).toHaveTextContent('DOY 150');
    expect(items[1]).toHaveTextContent('DOY 010');
    expect(items[2]).toHaveTextContent('DOY 365');
  });

  it('calls onDateSelect when a date is clicked', () => {
    const onDateSelect = vi.fn();
    renderBrowser({
      stations: ['AUCK'],
      selectedStation: 'AUCK',
      dates: [{ year: 2024, doy: 150 }],
      onDateSelect,
    });

    fireEvent.click(screen.getByLabelText('Select date 2024 DOY 150'));
    expect(onDateSelect).toHaveBeenCalledWith(2024, 150);
  });

  it('does not show dates section when no station is selected', () => {
    renderBrowser({ stations: ['AUCK'], selectedStation: null });
    expect(screen.queryByLabelText('Date list')).not.toBeInTheDocument();
  });

  it('shows no dates available message when station has no dates', () => {
    renderBrowser({
      stations: ['AUCK'],
      selectedStation: 'AUCK',
      dates: [],
    });
    expect(screen.getByText('No dates available')).toBeInTheDocument();
  });

  it('shows latest shortcut and selects newest date', () => {
    const onDateSelect = vi.fn();
    renderBrowser({
      stations: ['AUCK'],
      selectedStation: 'AUCK',
      selectedYear: 2024,
      selectedDoy: 10,
      dates: [
        { year: 2024, doy: 150 },
        { year: 2024, doy: 10 },
      ],
      onDateSelect,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    expect(onDateSelect).toHaveBeenCalledWith(2024, 150);
    expect(screen.getByText('2 available days')).toBeInTheDocument();
  });
});
