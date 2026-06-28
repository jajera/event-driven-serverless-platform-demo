import { useMemo, useState } from 'react';

export interface StationDate {
  year: number;
  doy: number;
}

export interface StationBrowserProps {
  stations: string[];
  selectedStation: string | null;
  selectedYear: number | null;
  selectedDoy: number | null;
  dates: StationDate[];
  onStationSelect: (station: string) => void;
  onDateSelect: (year: number, doy: number) => void;
  loading: boolean;
  datesLoading?: boolean;
  error: string | null;
  onRetry: () => void;
}

export function formatDoyLabel(year: number, doy: number): string {
  const date = new Date(Date.UTC(year, 0, doy));
  const formatted = date.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${formatted} · DOY ${String(doy).padStart(3, '0')}`;
}

export function StationBrowser({
  stations,
  selectedStation,
  selectedYear,
  selectedDoy,
  dates,
  onStationSelect,
  onDateSelect,
  loading,
  datesLoading = false,
  error,
  onRetry,
}: StationBrowserProps) {
  const [query, setQuery] = useState('');

  const filteredStations = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    if (!normalized) return stations;
    return stations.filter((station) => station.includes(normalized));
  }, [stations, query]);

  const sortedStations = useMemo(
    () => [...filteredStations].sort((a, b) => a.localeCompare(b)),
    [filteredStations]
  );

  const sortedDates = useMemo(
    () =>
      [...dates].sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return b.doy - a.doy;
      }),
    [dates]
  );

  const latestAvailableDate = sortedDates[0] ?? null;
  const hasLatestShortcut =
    latestAvailableDate != null &&
    (selectedYear !== latestAvailableDate.year || selectedDoy !== latestAvailableDate.doy);

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="status-banner status-banner--muted" role="status" aria-label="Loading stations">
            Loading stations…
          </div>
        </div>
      </div>
    );
  }

  if (error && stations.length === 0) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="status-banner status-banner--error" role="alert">
            {error}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onRetry} style={{ marginTop: 12 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div className="panel-header">Data browser</div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
        {error && (
          <div className="status-banner status-banner--error" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="station-search">Search stations</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="station-search"
              type="search"
              placeholder="e.g. WGTN, AUCK"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sortedStations[0]) {
                  onStationSelect(sortedStations[0]);
                }
              }}
              autoComplete="off"
              style={{ flex: 1 }}
            />
            {query.trim().length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>
                Clear
              </button>
            )}
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {sortedStations.length} of {stations.length} stations
        </p>

        {stations.length === 0 ? (
          <p>No stations available</p>
        ) : sortedStations.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No stations match &ldquo;{query}&rdquo;</p>
        ) : (
          <ul
            aria-label="Station list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            {sortedStations.map((station) => {
              const isSelected = station === selectedStation;
              return (
                <li key={station}>
                  <button
                    type="button"
                    onClick={() => onStationSelect(station)}
                    aria-pressed={isSelected}
                    aria-label={`Select station ${station}`}
                    style={{
                      width: '100%',
                      padding: '6px 4px',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 6,
                      background: isSelected ? 'var(--accent-soft)' : 'var(--surface)',
                      color: isSelected ? 'var(--accent)' : 'var(--text)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                    }}
                  >
                    {station}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedStation && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div
              style={{
                margin: '0 0 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem' }}>Dates for {selectedStation}</p>
              {hasLatestShortcut && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onDateSelect(latestAvailableDate.year, latestAvailableDate.doy)}
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  Latest
                </button>
              )}
            </div>
            <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              {sortedDates.length} available days
            </p>
            {datesLoading ? (
              <div className="status-banner status-banner--muted" role="status" aria-label="Loading dates">
                Loading dates…
              </div>
            ) : sortedDates.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>No dates available</p>
            ) : (
              <ul
                aria-label="Date list"
                style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                {sortedDates.map(({ year, doy }) => {
                  const isSelected = year === selectedYear && doy === selectedDoy;
                  return (
                    <li key={`${year}-${doy}`}>
                      <button
                        type="button"
                        onClick={() => onDateSelect(year, doy)}
                        aria-pressed={isSelected}
                        aria-label={`Select date ${year} DOY ${String(doy).padStart(3, '0')}`}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 8,
                          background: isSelected ? 'var(--accent-soft)' : 'var(--surface-muted)',
                          color: 'var(--text)',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {formatDoyLabel(year, doy)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
