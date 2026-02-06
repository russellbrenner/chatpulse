import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getWatermark, updateWatermark } from '../services/watermark.js';

// ── Mock pg Pool / PoolClient ──────────────────────────────────────

/** Minimal mock that satisfies the Pool | PoolClient interface used by watermark.ts */
function createMockPg() {
  return {
    query: vi.fn(),
  };
}

describe('watermark', () => {
  let mockPg: ReturnType<typeof createMockPg>;

  beforeEach(() => {
    mockPg = createMockPg();
  });

  // ── getWatermark ─────────────────────────────────────────────────

  describe('getWatermark', () => {
    it('should return the watermark when a row exists', async () => {
      const fakeDate = new Date('2024-06-01T10:00:00Z');
      mockPg.query.mockResolvedValueOnce({
        rows: [{ last_message_date: fakeDate, last_rowid: '42' }],
      });

      const result = await getWatermark(mockPg as never);

      expect(result).toEqual({
        lastMessageDate: fakeDate,
        lastRowid: 42,
      });
    });

    it('should convert the bigint last_rowid string to a number', async () => {
      mockPg.query.mockResolvedValueOnce({
        rows: [{ last_message_date: new Date(), last_rowid: '9999999999' }],
      });

      const result = await getWatermark(mockPg as never);
      expect(result).not.toBeNull();
      expect(typeof result!.lastRowid).toBe('number');
      expect(result!.lastRowid).toBe(9_999_999_999);
    });

    it('should return null when no watermark row exists (first run)', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [] });

      const result = await getWatermark(mockPg as never);
      expect(result).toBeNull();
    });

    it('should execute the correct SQL query', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [] });

      await getWatermark(mockPg as never);

      expect(mockPg.query).toHaveBeenCalledOnce();
      const sql = mockPg.query.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT');
      expect(sql).toContain('last_message_date');
      expect(sql).toContain('last_rowid');
      expect(sql).toContain('ingest_watermark');
      expect(sql).toContain('LIMIT 1');
    });

    it('should propagate database errors', async () => {
      mockPg.query.mockRejectedValueOnce(new Error('connection refused'));

      await expect(getWatermark(mockPg as never)).rejects.toThrow(
        'connection refused',
      );
    });
  });

  // ── updateWatermark ──────────────────────────────────────────────

  describe('updateWatermark', () => {
    it('should execute an upsert query with the correct parameters', async () => {
      mockPg.query.mockResolvedValueOnce({ rowCount: 1 });
      const date = new Date('2024-07-15T14:30:00Z');

      await updateWatermark(mockPg as never, date, 123);

      expect(mockPg.query).toHaveBeenCalledOnce();
      const [sql, params] = mockPg.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO ingest_watermark');
      expect(sql).toContain('ON CONFLICT (id)');
      expect(sql).toContain('DO UPDATE SET');
      expect(params).toEqual([date, 123]);
    });

    it('should use id = 1 for the singleton row', async () => {
      mockPg.query.mockResolvedValueOnce({ rowCount: 1 });

      await updateWatermark(mockPg as never, new Date(), 1);

      const sql = mockPg.query.mock.calls[0][0] as string;
      expect(sql).toContain('VALUES (1,');
    });

    it('should propagate database errors', async () => {
      mockPg.query.mockRejectedValueOnce(new Error('disk full'));

      await expect(
        updateWatermark(mockPg as never, new Date(), 1),
      ).rejects.toThrow('disk full');
    });
  });
});
