// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { DocumentDTO } from '@/contracts/documents';

import { DocumentPrint } from '../components/document-print';
import { printState } from '../format';

const party = { name: 'Test Co', nameAr: 'شركة', vatNumber: '300000000000003', address: { countryCode: 'SA', city: 'Riyadh' } };
const doc = (o: Partial<DocumentDTO> = {}): DocumentDTO =>
  ({
    id: 'd1',
    kind: 'INVOICE',
    subtype: 'STANDARD',
    status: 'ISSUED',
    number: 'INV-000001',
    seller: party,
    buyer: { ...party, name: 'Acme', nameAr: null },
    issueDate: '2026-10-14',
    issuedAt: '2026-10-14T21:30:00.000Z',
    uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28be',
    supplyDate: null,
    supplyEndDate: null,
    paymentMeansCode: null,
    docDiscountReason: null,
    notes: null,
    noteReason: null,
    billingReference: null,
    lines: [],
    taxSubtotals: [],
    lineExtensionHalalas: 0,
    allowanceTotalHalalas: 0,
    taxExclusiveHalalas: 0,
    taxHalalas: 0,
    payableHalalas: 0,
    submissionStatus: 'PENDING_RETRY',
    isTest: true,
    qrBase64: 'QR',
    ...o,
  }) as DocumentDTO;

afterEach(cleanup);

describe('printState', () => {
  it('standard documents print only once cleared; simplified once issued', () => {
    expect(printState(doc()).allowed).toBe(false);
    expect(printState(doc()).reason).toBe('Awaiting ZATCA clearance');
    expect(printState(doc({ submissionStatus: 'CLEARED' })).allowed).toBe(true);
    expect(printState(doc({ submissionStatus: 'REJECTED' })).allowed).toBe(false);
    expect(printState(doc({ subtype: 'SIMPLIFIED' })).allowed).toBe(true);
    expect(printState(doc({ status: 'DRAFT', submissionStatus: 'NOT_SUBMITTED' })).allowed).toBe(true);
  });
});

describe('DocumentPrint', () => {
  it('AC7.12: an uncleared standard document is disabled with the reason and shows no invoice', () => {
    const { container } = render(<DocumentPrint doc={doc()} backHref="/x" qrDataUrl={null} />);
    expect(screen.getByText('Awaiting ZATCA clearance')).toBeTruthy();
    expect((screen.getByRole('button', { name: /print/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-qr-slot]')).toBeNull();
  });

  it('AC7.12: a cleared document shows the QR image, the UUID, Riyadh time and the simulation watermark', () => {
    const { container } = render(<DocumentPrint doc={doc({ submissionStatus: 'CLEARED' })} backHref="/x" qrDataUrl="data:image/png;base64,AAAA" />);
    expect(container.querySelector('[data-qr-slot] img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(screen.getByText('3cf5ee18-ee25-44ea-a444-2c37ba7f28be')).toBeTruthy();
    // 21:30Z is 00:30 the next day in Riyadh (UTC+3)
    expect(screen.getByText('2026-10-15 00:30:00')).toBeTruthy();
    expect(container.querySelector('[data-watermark="simulation"]')?.textContent).toBe('SIMULATION – ليست فاتورة ضريبية');
    expect((screen.getByRole('button', { name: /print/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a production document carries no watermark', () => {
    const { container } = render(<DocumentPrint doc={doc({ submissionStatus: 'CLEARED', isTest: false })} backHref="/x" qrDataUrl="data:x" />);
    expect(container.querySelector('[data-watermark]')).toBeNull();
  });
});
