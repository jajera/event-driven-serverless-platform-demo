/**
 * API client for Query_API and Reprocess_API endpoints.
 * Implements GET /query, POST /reprocess, and GET /reprocess/{job_id}.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// --- Request/Response Types ---

export interface QueryParams {
  station: string;
  start_time: string;
  end_time: string;
  sv?: string;
}

export interface QueryDataRow {
  epoch: string;
  sv: string;
  id_arc: number;
  lat_ipp: number;
  lon_ipp: number;
  azi: number;
  ele: number;
  bias: number;
  stec: number;
  vtec: number;
  veq: number;
}

export interface QueryResponse {
  data: QueryDataRow[];
  meta: {
    row_count: number;
    truncated: boolean;
  };
}

export interface ReprocessRequest {
  station: string;
  year: number;
  doy: number;
  parameters?: Record<string, unknown>;
}

export interface ReprocessResponse {
  job_id: string;
  status: string;
}

export interface JobStatus {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  station: string;
  year: number;
  doy: number;
  parameters: Record<string, unknown>;
  output_key?: string;
  error_type?: string;
  error_message?: string;
}

// --- Error Type ---

export interface ApiError {
  message: string;
  statusCode: number;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'statusCode' in error
  );
}

export interface CatalogDate {
  year: number;
  doy: number;
}

export interface CatalogStationsResponse {
  stations: string[];
}

export interface CatalogDatesResponse {
  dates: CatalogDate[];
}

// --- API Functions ---

export async function fetchCatalogStations(): Promise<CatalogStationsResponse> {
  const url = `${API_BASE_URL}/catalog`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw {
      message: error instanceof Error ? error.message : 'Network error',
      statusCode: 0,
    } as ApiError;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw {
      message: ((body as Record<string, unknown>).error as string) ?? 'Request failed',
      statusCode: response.status,
    } as ApiError;
  }
  return response.json() as Promise<CatalogStationsResponse>;
}

export async function fetchCatalogDates(station: string): Promise<CatalogDatesResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('station', station);
  const url = `${API_BASE_URL}/catalog?${searchParams.toString()}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw {
      message: error instanceof Error ? error.message : 'Network error',
      statusCode: 0,
    } as ApiError;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw {
      message: ((body as Record<string, unknown>).error as string) ?? 'Request failed',
      statusCode: response.status,
    } as ApiError;
  }
  return response.json() as Promise<CatalogDatesResponse>;
}

export async function queryData(params: QueryParams): Promise<QueryResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('station', params.station);
  searchParams.set('start_time', params.start_time);
  searchParams.set('end_time', params.end_time);
  if (params.sv) {
    searchParams.set('sv', params.sv);
  }

  const url = `${API_BASE_URL}/query?${searchParams.toString()}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw {
      message: error instanceof Error ? error.message : 'Network error',
      statusCode: 0,
    } as ApiError;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw {
      message:
        ((body as Record<string, unknown>).error as string) ??
        ((body as Record<string, unknown>).message as string) ??
        'Request failed',
      statusCode: response.status,
    } as ApiError;
  }
  return response.json() as Promise<QueryResponse>;
}

export async function submitReprocess(request: ReprocessRequest): Promise<ReprocessResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw {
      message: error instanceof Error ? error.message : 'Network error',
      statusCode: 0,
    } as ApiError;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw {
      message: (body as Record<string, unknown>).message as string ?? 'Request failed',
      statusCode: response.status,
    } as ApiError;
  }
  return response.json() as Promise<ReprocessResponse>;
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/reprocess/${jobId}`);
  } catch (error) {
    throw {
      message: error instanceof Error ? error.message : 'Network error',
      statusCode: 0,
    } as ApiError;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw {
      message: (body as Record<string, unknown>).message as string ?? 'Request failed',
      statusCode: response.status,
    } as ApiError;
  }
  return response.json() as Promise<JobStatus>;
}
