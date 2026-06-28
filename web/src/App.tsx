import { useCallback, useEffect, useState } from 'react';
import { StationBrowser, formatDoyLabel } from './components/StationBrowser';
import type { StationDate } from './components/StationBrowser';
import { TimeSeries } from './components/TimeSeries';
import IppMap from './components/IppMap';
import { ParameterPanel } from './components/ParameterPanel';
import { fetchCatalogDates, fetchCatalogStations, queryData } from './api/client';
import type { QueryDataRow } from './api/client';

interface ViewParams {
  startTime: string;
  endTime: string;
  svFilter: string;
  metric: 'vtec' | 'stec' | 'veq';
}

function deriveTimeRange(year: number, doy: number): { startTime: string; endTime: string } {
  const date = new Date(Date.UTC(year, 0, doy));
  const startTime = date.toISOString();
  const endDate = new Date(Date.UTC(year, 0, doy + 1));
  const endTime = new Date(endDate.getTime() - 1).toISOString();
  return { startTime, endTime };
}

function latestDate(dates: StationDate[]): StationDate | null {
  if (dates.length === 0) return null;
  return [...dates].sort((a, b) => b.year - a.year || b.doy - a.doy)[0] ?? null;
}

function App() {
  const [stations, setStations] = useState<string[]>([]);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [dates, setDates] = useState<StationDate[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedDoy, setSelectedDoy] = useState<number | null>(null);
  const [data, setData] = useState<QueryDataRow[]>([]);
  const [stationLoading, setStationLoading] = useState(true);
  const [datesLoading, setDatesLoading] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [truncatedRowCount, setTruncatedRowCount] = useState(0);
  const [viewParams, setViewParams] = useState<ViewParams>({
    startTime: '',
    endTime: '',
    svFilter: '',
    metric: 'vtec',
  });

  const fetchData = useCallback(
    async (station: string, startTime: string, endTime: string, svFilter: string) => {
      setDataLoading(true);
      setDataError(null);
      setTruncated(false);
      setTruncatedRowCount(0);
      try {
        const response = await queryData({
          station,
          start_time: startTime,
          end_time: endTime,
          sv: svFilter || undefined,
        });
        setData(response.data);
        setTruncated(response.meta.truncated);
        setTruncatedRowCount(response.meta.row_count);
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? (err as { message: string }).message
            : 'Failed to fetch data';
        setDataError(message);
        setData([]);
        setTruncated(false);
        setTruncatedRowCount(0);
      } finally {
        setDataLoading(false);
      }
    },
    []
  );

  const loadDateAndQuery = useCallback(
    (station: string, year: number, doy: number, svFilter: string) => {
      setSelectedYear(year);
      setSelectedDoy(doy);
      const { startTime, endTime } = deriveTimeRange(year, doy);
      setViewParams((prev) => ({ ...prev, startTime, endTime }));
      void fetchData(station, startTime, endTime, svFilter);
    },
    [fetchData]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStations() {
      setStationLoading(true);
      setStationError(null);
      try {
        const response = await fetchCatalogStations();
        if (!cancelled) {
          setStations(response.stations);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err && typeof err === 'object' && 'message' in err
              ? (err as { message: string }).message
              : 'Failed to load stations';
          setStationError(message);
        }
      } finally {
        if (!cancelled) {
          setStationLoading(false);
        }
      }
    }

    void loadStations();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStationSelect = useCallback(
    async (station: string) => {
      setSelectedStation(station);
      setSelectedYear(null);
      setSelectedDoy(null);
      setData([]);
      setTruncated(false);
      setDataError(null);
      setDates([]);
      setDatesLoading(true);
      setStationError(null);

      try {
        const response = await fetchCatalogDates(station);
        setDates(response.dates);
        const newest = latestDate(response.dates);
        if (newest) {
          loadDateAndQuery(station, newest.year, newest.doy, viewParams.svFilter);
        }
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? (err as { message: string }).message
            : 'Failed to load dates';
        setStationError(message);
        setDates([]);
      } finally {
        setDatesLoading(false);
      }
    },
    [loadDateAndQuery, viewParams.svFilter]
  );

  const handleDateSelect = useCallback(
    (year: number, doy: number) => {
      if (selectedStation) {
        loadDateAndQuery(selectedStation, year, doy, viewParams.svFilter);
      }
    },
    [selectedStation, viewParams.svFilter, loadDateAndQuery]
  );

  const handleViewParamsChange = useCallback(
    (params: Partial<ViewParams>) => {
      setViewParams((prev) => {
        const updated = { ...prev, ...params };
        if (
          selectedStation &&
          updated.startTime &&
          updated.endTime &&
          (params.startTime !== undefined ||
            params.endTime !== undefined ||
            params.svFilter !== undefined)
        ) {
          void fetchData(selectedStation, updated.startTime, updated.endTime, updated.svFilter);
        }
        return updated;
      });
    },
    [selectedStation, fetchData]
  );

  const handleReprocessComplete = useCallback(() => {
    if (selectedStation && viewParams.startTime && viewParams.endTime) {
      void fetchData(selectedStation, viewParams.startTime, viewParams.endTime, viewParams.svFilter);
    }
  }, [selectedStation, viewParams.startTime, viewParams.endTime, viewParams.svFilter, fetchData]);

  const handleRetry = useCallback(() => {
    setStationError(null);
    if (selectedStation) {
      void handleStationSelect(selectedStation);
      return;
    }

    setStationLoading(true);
    void fetchCatalogStations()
      .then((response) => setStations(response.stations))
      .catch((err: unknown) => {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? (err as { message: string }).message
            : 'Failed to load stations';
        setStationError(message);
      })
      .finally(() => setStationLoading(false));
  }, [selectedStation, handleStationSelect]);

  const hasSelection = selectedStation && selectedYear !== null && selectedDoy !== null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>GNSS TEC Platform</h1>
          <p>GeoNet RINEX ingest · processed TEC visualization</p>
        </div>
        {hasSelection && (
          <div className="selection-summary">
            <span className="chip">{selectedStation}</span>
            <span className="chip">{formatDoyLabel(selectedYear!, selectedDoy!)}</span>
            {data.length > 0 && <span className="chip">{data.length.toLocaleString()} points</span>}
          </div>
        )}
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <StationBrowser
            stations={stations}
            selectedStation={selectedStation}
            selectedYear={selectedYear}
            selectedDoy={selectedDoy}
            dates={dates}
            onStationSelect={handleStationSelect}
            onDateSelect={handleDateSelect}
            loading={stationLoading}
            datesLoading={datesLoading}
            error={stationError}
            onRetry={handleRetry}
          />
        </aside>

        <main className="main">
          {!hasSelection ? (
            <div className="panel">
              <div className="empty-state">
                <strong>Select a station to begin</strong>
                <p>
                  Search the station list on the left, then pick an observation day. The latest
                  available date loads automatically.
                </p>
              </div>
            </div>
          ) : (
            <>
              <ParameterPanel
                startTime={viewParams.startTime}
                endTime={viewParams.endTime}
                svFilter={viewParams.svFilter}
                metric={viewParams.metric}
                station={selectedStation}
                year={selectedYear}
                doy={selectedDoy}
                onViewParamsChange={handleViewParamsChange}
                onReprocessComplete={handleReprocessComplete}
              />

              <section className="chart-panel panel">
                <div className="panel-header">Time series</div>
                <div className="panel-body">
                  {truncated && (
                    <p>
                      Showing the first {truncatedRowCount.toLocaleString()} rows returned for this
                      query (results were capped). Narrow the time window or apply a satellite filter
                      for complete results.
                    </p>
                  )}
                  <TimeSeries
                    data={data}
                    metric={viewParams.metric}
                    svFilter={viewParams.svFilter || null}
                    loading={dataLoading}
                    error={dataError}
                  />
                </div>
              </section>

              <section className="map-panel panel">
                <div className="panel-header">Ionospheric pierce points</div>
                <div className="panel-body">
                  <IppMap data={data} loading={dataLoading} error={dataError} />
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
