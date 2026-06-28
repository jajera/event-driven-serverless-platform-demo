import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryData, submitReprocess, getJobStatus, isApiError } from './client';
import type { ApiError } from './client';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('queryData', () => {
    it('sends GET request with query parameters', async () => {
      const mockResponse = {
        data: [{ epoch: '2024-05-29T01:00:00Z', sv: 'G01', id_arc: 1, lat_ipp: -36.85, lon_ipp: 174.76, azi: 45.2, ele: 30.1, bias: 0.5, stec: 12.3, vtec: 8.7, veq: 9.1 }],
        meta: { row_count: 1, truncated: false },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await queryData({
        station: 'AUCK',
        start_time: '2024-05-29T00:00:00Z',
        end_time: '2024-05-29T23:59:59Z',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/query?');
      expect(calledUrl).toContain('station=AUCK');
      expect(calledUrl).toContain('start_time=2024-05-29T00%3A00%3A00Z');
      expect(calledUrl).toContain('end_time=2024-05-29T23%3A59%3A59Z');
      expect(calledUrl).not.toContain('sv=');
      expect(result).toEqual(mockResponse);
    });

    it('includes sv parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], meta: { row_count: 0, truncated: false } }),
      });

      await queryData({
        station: 'AUCK',
        start_time: '2024-05-29T00:00:00Z',
        end_time: '2024-05-29T23:59:59Z',
        sv: 'G01',
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('sv=G01');
    });

    it('throws ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Missing required parameter: station' }),
      });

      try {
        await queryData({
          station: '',
          start_time: '2024-05-29T00:00:00Z',
          end_time: '2024-05-29T23:59:59Z',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isApiError(error)).toBe(true);
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(400);
        expect(apiError.message).toBe('Missing required parameter: station');
      }
    });

    it('handles non-JSON error response bodies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      });

      try {
        await queryData({
          station: 'AUCK',
          start_time: '2024-05-29T00:00:00Z',
          end_time: '2024-05-29T23:59:59Z',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(500);
        expect(apiError.message).toBe('Request failed');
      }
    });

    it('throws ApiError with statusCode 0 on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await queryData({
          station: 'AUCK',
          start_time: '2024-05-29T00:00:00Z',
          end_time: '2024-05-29T23:59:59Z',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(0);
        expect(apiError.message).toBe('Failed to fetch');
      }
    });
  });

  describe('submitReprocess', () => {
    it('sends POST request with JSON body', async () => {
      const mockResponse = { job_id: 'abc-123', status: 'queued' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await submitReprocess({
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: { MIN_ELEVATION: 15 },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/reprocess');
      expect((options as RequestInit).method).toBe('POST');
      expect((options as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse((options as RequestInit).body as string)).toEqual({
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: { MIN_ELEVATION: 15 },
      });
      expect(result).toEqual(mockResponse);
    });

    it('throws ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid station' }),
      });

      try {
        await submitReprocess({ station: 'X', year: 2024, doy: 150 });
        expect.fail('Should have thrown');
      } catch (error) {
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(400);
        expect(apiError.message).toBe('Invalid station');
      }
    });

    it('throws ApiError with statusCode 0 on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

      try {
        await submitReprocess({ station: 'AUCK', year: 2024, doy: 150 });
        expect.fail('Should have thrown');
      } catch (error) {
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(0);
        expect(apiError.message).toBe('Network request failed');
      }
    });
  });

  describe('getJobStatus', () => {
    it('sends GET request with job_id in path', async () => {
      const mockResponse = {
        job_id: 'abc-123',
        status: 'completed' as const,
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
        output_key: 'processed/station=auck/year=2024/doy=150/auck1500.24o.parquet',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getJobStatus('abc-123');

      expect(mockFetch).toHaveBeenCalledWith('/reprocess/abc-123');
      expect(result).toEqual(mockResponse);
    });

    it('throws ApiError on 404 not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Job not found' }),
      });

      try {
        await getJobStatus('nonexistent');
        expect.fail('Should have thrown');
      } catch (error) {
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(404);
        expect(apiError.message).toBe('Job not found');
      }
    });

    it('returns failed job with error details', async () => {
      const mockResponse = {
        job_id: 'fail-123',
        status: 'failed' as const,
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
        error_type: 'CalibrationError',
        error_message: 'Navigation file not found',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getJobStatus('fail-123');
      expect(result.status).toBe('failed');
      expect(result.error_type).toBe('CalibrationError');
      expect(result.error_message).toBe('Navigation file not found');
    });

    it('throws ApiError with statusCode 0 on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await getJobStatus('abc-123');
        expect.fail('Should have thrown');
      } catch (error) {
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(0);
        expect(apiError.message).toBe('Failed to fetch');
      }
    });
  });

  describe('isApiError', () => {
    it('returns true for valid ApiError objects', () => {
      expect(isApiError({ message: 'test', statusCode: 400 })).toBe(true);
    });

    it('returns false for non-ApiError values', () => {
      expect(isApiError(null)).toBe(false);
      expect(isApiError(undefined)).toBe(false);
      expect(isApiError('string')).toBe(false);
      expect(isApiError({ message: 'test' })).toBe(false);
      expect(isApiError({ statusCode: 400 })).toBe(false);
    });
  });
});
