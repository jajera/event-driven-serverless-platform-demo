import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ParameterPanel } from './ParameterPanel';

// Mock the API client
vi.mock('../api/client', () => ({
  submitReprocess: vi.fn(),
  getJobStatus: vi.fn(),
  isApiError: (err: unknown) =>
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    'statusCode' in err,
}));

import { submitReprocess, getJobStatus } from '../api/client';

const mockSubmitReprocess = vi.mocked(submitReprocess);
const mockGetJobStatus = vi.mocked(getJobStatus);

const defaultProps = {
  startTime: '2024-05-29T00:00:00Z',
  endTime: '2024-05-29T23:59:59Z',
  svFilter: '',
  metric: 'vtec' as const,
  station: 'AUCK',
  year: 2024,
  doy: 150,
  onViewParamsChange: vi.fn(),
  onReprocessComplete: vi.fn(),
};

describe('ParameterPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('View Parameters', () => {
    it('renders view parameter inputs with current values', () => {
      render(<ParameterPanel {...defaultProps} />);

      const startInput = screen.getByLabelText(/Start time/i) as HTMLInputElement;
      expect(startInput.value).toBe('2024-05-29T00:00:00Z');

      const endInput = screen.getByLabelText(/End time/i) as HTMLInputElement;
      expect(endInput.value).toBe('2024-05-29T23:59:59Z');

      const svInput = screen.getByLabelText(/Satellite filter/i) as HTMLInputElement;
      expect(svInput.value).toBe('');

      const metricSelect = screen.getByLabelText('Metric') as HTMLSelectElement;
      expect(metricSelect.value).toBe('vtec');
    });

    it('calls onViewParamsChange when start time changes', () => {
      const onViewParamsChange = vi.fn();
      render(
        <ParameterPanel {...defaultProps} onViewParamsChange={onViewParamsChange} />
      );

      fireEvent.change(screen.getByLabelText(/Start time/i), {
        target: { value: '2024-05-28T00:00:00Z' },
      });

      expect(onViewParamsChange).toHaveBeenCalledWith({
        startTime: '2024-05-28T00:00:00Z',
      });
    });

    it('calls onViewParamsChange when end time changes', () => {
      const onViewParamsChange = vi.fn();
      render(
        <ParameterPanel {...defaultProps} onViewParamsChange={onViewParamsChange} />
      );

      fireEvent.change(screen.getByLabelText(/End time/i), {
        target: { value: '2024-05-30T00:00:00Z' },
      });

      expect(onViewParamsChange).toHaveBeenCalledWith({
        endTime: '2024-05-30T00:00:00Z',
      });
    });

    it('calls onViewParamsChange when sv filter changes', () => {
      const onViewParamsChange = vi.fn();
      render(
        <ParameterPanel {...defaultProps} onViewParamsChange={onViewParamsChange} />
      );

      fireEvent.change(screen.getByLabelText(/Satellite filter/i), {
        target: { value: 'G01' },
      });

      expect(onViewParamsChange).toHaveBeenCalledWith({ svFilter: 'G01' });
    });

    it('calls onViewParamsChange when metric changes', () => {
      const onViewParamsChange = vi.fn();
      render(
        <ParameterPanel {...defaultProps} onViewParamsChange={onViewParamsChange} />
      );

      fireEvent.change(screen.getByLabelText('Metric'), {
        target: { value: 'stec' },
      });

      expect(onViewParamsChange).toHaveBeenCalledWith({ metric: 'stec' });
    });
  });

  describe('Processing Parameters', () => {
    it('renders processing parameter numeric inputs', () => {
      render(<ParameterPanel {...defaultProps} />);

      expect(screen.getByLabelText(/Nav day offset/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Min elevation/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/IPP height/i)).not.toBeInTheDocument();
    });

    it('renders Reprocess button', () => {
      render(<ParameterPanel {...defaultProps} />);
      expect(
        screen.getByRole('button', { name: /submit reprocessing job/i })
      ).toBeInTheDocument();
    });

    it('disables Reprocess button when station is null', () => {
      render(<ParameterPanel {...defaultProps} station={null} />);
      expect(
        screen.getByRole('button', { name: /submit reprocessing job/i })
      ).toBeDisabled();
    });

    it('disables Reprocess button when year is null', () => {
      render(<ParameterPanel {...defaultProps} year={null} />);
      expect(
        screen.getByRole('button', { name: /submit reprocessing job/i })
      ).toBeDisabled();
    });

    it('disables Reprocess button when doy is null', () => {
      render(<ParameterPanel {...defaultProps} doy={null} />);
      expect(
        screen.getByRole('button', { name: /submit reprocessing job/i })
      ).toBeDisabled();
    });
  });

  describe('Reprocess Submission', () => {
    it('submits reprocessing request with correct parameters', async () => {
      mockSubmitReprocess.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'queued',
      });
      mockGetJobStatus.mockResolvedValue({
        job_id: 'job-123',
        status: 'queued',
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
      });

      render(<ParameterPanel {...defaultProps} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      expect(mockSubmitReprocess).toHaveBeenCalledWith({
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {
          NAV_DAY_OFFSET: 1,
        },
      });
    });

    it('displays job_id and status after successful submission', async () => {
      mockSubmitReprocess.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'queued',
      });
      mockGetJobStatus.mockResolvedValue({
        job_id: 'job-123',
        status: 'queued',
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
      });

      render(<ParameterPanel {...defaultProps} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      expect(screen.getByText(/job-123/)).toBeInTheDocument();
      expect(screen.getByText(/queued/)).toBeInTheDocument();
    });

    it('displays error when submission fails', async () => {
      mockSubmitReprocess.mockRejectedValueOnce({
        message: 'Invalid station',
        statusCode: 400,
      });

      render(<ParameterPanel {...defaultProps} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      expect(screen.getByText(/Invalid station/)).toBeInTheDocument();
    });

    it('does not begin polling when submission fails', async () => {
      mockSubmitReprocess.mockRejectedValueOnce({
        message: 'Server error',
        statusCode: 500,
      });

      render(<ParameterPanel {...defaultProps} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockGetJobStatus).not.toHaveBeenCalled();
    });

    it('disables Reprocess button while job is in progress', async () => {
      mockSubmitReprocess.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'queued',
      });
      mockGetJobStatus.mockResolvedValue({
        job_id: 'job-123',
        status: 'processing',
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
      });

      render(<ParameterPanel {...defaultProps} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      expect(
        screen.getByRole('button', { name: /submit reprocessing job/i })
      ).toBeDisabled();
    });
  });

  describe('Polling Behavior', () => {
    it('polls every 5 seconds after successful submission', async () => {
      mockSubmitReprocess.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'queued',
      });
      mockGetJobStatus.mockResolvedValue({
        job_id: 'job-123',
        status: 'processing',
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
      });

      render(<ParameterPanel {...defaultProps} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      // First poll at 5s
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(mockGetJobStatus).toHaveBeenCalledTimes(1);

      // Second poll at 10s
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(mockGetJobStatus).toHaveBeenCalledTimes(2);
    });

    it('stops polling and calls onReprocessComplete when job completes', async () => {
      const onReprocessComplete = vi.fn();
      mockSubmitReprocess.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'queued',
      });
      mockGetJobStatus.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'completed',
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
        output_key: 'processed/station=auck/year=2024/doy=150/auck1500.parquet',
      });

      render(
        <ParameterPanel
          {...defaultProps}
          onReprocessComplete={onReprocessComplete}
        />
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(onReprocessComplete).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/completed/)).toBeInTheDocument();

      // No further polls
      mockGetJobStatus.mockClear();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(mockGetJobStatus).not.toHaveBeenCalled();
    });

    it('stops polling and displays error when job fails', async () => {
      mockSubmitReprocess.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'queued',
      });
      mockGetJobStatus.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'failed',
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
        error_type: 'CalibrationError',
        error_message: 'Navigation file not found',
      });

      render(<ParameterPanel {...defaultProps} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByText(/failed/)).toBeInTheDocument();
      expect(
        screen.getByText(/Navigation file not found/)
      ).toBeInTheDocument();

      // No further polls
      mockGetJobStatus.mockClear();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(mockGetJobStatus).not.toHaveBeenCalled();
    });

    it('shows timeout message after 5 minutes without terminal status', async () => {
      mockSubmitReprocess.mockResolvedValueOnce({
        job_id: 'job-123',
        status: 'queued',
      });
      mockGetJobStatus.mockResolvedValue({
        job_id: 'job-123',
        status: 'processing',
        station: 'AUCK',
        year: 2024,
        doy: 150,
        parameters: {},
      });

      render(<ParameterPanel {...defaultProps} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: /submit reprocessing job/i })
        );
      });

      // Advance to 5 minutes
      await act(async () => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });

      expect(
        screen.getByText(/timed out/i)
      ).toBeInTheDocument();

      // No further polls
      mockGetJobStatus.mockClear();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(mockGetJobStatus).not.toHaveBeenCalled();
    });
  });
});
