import { useCallback, useEffect, useRef, useState } from 'react';
import { submitReprocess, getJobStatus, isApiError } from '../api/client';

export interface ParameterPanelProps {
  startTime: string;
  endTime: string;
  svFilter: string;
  metric: 'vtec' | 'stec' | 'veq';
  station: string | null;
  year: number | null;
  doy: number | null;
  onViewParamsChange: (params: {
    startTime?: string;
    endTime?: string;
    svFilter?: string;
    metric?: 'vtec' | 'stec' | 'veq';
  }) => void;
  onReprocessComplete: () => void;
}

interface JobState {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function ParameterPanel({
  startTime,
  endTime,
  svFilter,
  metric,
  station,
  year,
  doy,
  onViewParamsChange,
  onReprocessComplete,
}: ParameterPanelProps) {
  const [navDayOffset, setNavDayOffset] = useState<number>(1);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current !== null) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(
    (jobId: string) => {
      pollTimeoutRef.current = setTimeout(() => {
        stopPolling();
        setTimedOut(true);
        setJobState((prev) => (prev ? { ...prev, status: 'failed' } : null));
      }, POLL_TIMEOUT_MS);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId);
          setJobState({
            jobId: status.job_id,
            status: status.status,
            errorMessage: status.status === 'failed' ? status.error_message : undefined,
          });

          if (status.status === 'completed') {
            stopPolling();
            onReprocessComplete();
          } else if (status.status === 'failed') {
            stopPolling();
          }
        } catch {
          // transient poll errors — keep trying
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling, onReprocessComplete]
  );

  const handleReprocess = async () => {
    if (!station || year === null || doy === null) return;

    setError(null);
    setTimedOut(false);
    setJobState(null);
    setIsSubmitting(true);

    try {
      const response = await submitReprocess({
        station,
        year,
        doy,
        parameters: {
          NAV_DAY_OFFSET: navDayOffset,
        },
      });

      setJobState({
        jobId: response.job_id,
        status: response.status as JobState['status'],
      });
      startPolling(response.job_id);
    } catch (err: unknown) {
      setError(isApiError(err) ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isJobInProgress =
    jobState !== null && (jobState.status === 'queued' || jobState.status === 'processing');

  const reprocessDisabled =
    !station || year === null || doy === null || isSubmitting || isJobInProgress;

  return (
    <div className="panel">
      <div className="panel-header">Display &amp; filters</div>
      <div className="panel-body">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <div className="field">
            <label htmlFor="start-time">Start time (UTC)</label>
            <input
              id="start-time"
              type="text"
              value={startTime}
              onChange={(e) => onViewParamsChange({ startTime: e.target.value })}
              placeholder="ISO 8601"
            />
          </div>

          <div className="field">
            <label htmlFor="end-time">End time (UTC)</label>
            <input
              id="end-time"
              type="text"
              value={endTime}
              onChange={(e) => onViewParamsChange({ endTime: e.target.value })}
              placeholder="ISO 8601"
            />
          </div>

          <div className="field">
            <label htmlFor="sv-filter">Satellite filter</label>
            <input
              id="sv-filter"
              type="text"
              value={svFilter}
              onChange={(e) => onViewParamsChange({ svFilter: e.target.value })}
              placeholder="All satellites"
            />
          </div>

          <div className="field">
            <label htmlFor="metric-select">Metric</label>
            <select
              id="metric-select"
              value={metric}
              onChange={(e) =>
                onViewParamsChange({ metric: e.target.value as 'vtec' | 'stec' | 'veq' })
              }
            >
              <option value="vtec">VTEC</option>
              <option value="stec">STEC</option>
              <option value="veq">VEQ</option>
            </select>
          </div>
        </div>

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-muted)' }}>
            Reprocess with custom parameters
          </summary>
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <div className="field">
              <label htmlFor="nav-day-offset">Nav day offset</label>
              <input
                id="nav-day-offset"
                type="number"
                value={navDayOffset}
                onChange={(e) => setNavDayOffset(Number(e.target.value))}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleReprocess}
              disabled={reprocessDisabled}
              aria-label="Submit reprocessing job"
            >
              {isJobInProgress ? 'Processing…' : 'Reprocess'}
            </button>
          </div>
        </details>

        {error && (
          <div className="status-banner status-banner--error" role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        {timedOut && (
          <div className="status-banner status-banner--error" role="alert" style={{ marginTop: 12 }}>
            Reprocessing timed out after 5 minutes.
          </div>
        )}

        {jobState && !timedOut && (
          <div className="status-banner status-banner--info" aria-label="Job status" style={{ marginTop: 12 }}>
            Job {jobState.jobId.slice(0, 8)}… — {jobState.status}
            {jobState.status === 'failed' && jobState.errorMessage && ` (${jobState.errorMessage})`}
          </div>
        )}
      </div>
    </div>
  );
}
