import { describe, expect, it } from 'vitest';
import { riyadhDisplay, toZatcaDateTime } from '../time';

describe('toZatcaDateTime', () => {
  it('derives IssueDate, IssueTime and QR tag 3 from one UTC instant', () => {
    // 23:30 UTC is already the next day in Riyadh; ZATCA fields must stay on the UTC day.
    expect(toZatcaDateTime(new Date('2026-10-14T23:30:05.987Z'))).toEqual({
      issueDate: '2026-10-14',
      issueTime: '23:30:05Z',
      qrTimestamp: '2026-10-14T23:30:05Z',
    });
  });

  it('zero-pads every field', () => {
    expect(toZatcaDateTime(new Date('2027-01-02T03:04:05Z')).qrTimestamp).toBe('2027-01-02T03:04:05Z');
  });
});

describe('riyadhDisplay', () => {
  it('formats the instant in UTC+3 for print', () => {
    expect(riyadhDisplay(new Date('2026-10-14T23:30:05Z'))).toBe('2026-10-15 02:30:05');
  });
});
