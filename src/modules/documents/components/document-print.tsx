import type { ReactNode } from 'react';

import type { DocumentDTO, PartySnapshot } from '@/contracts/documents';
import { VATEX_REASONS } from '@/server/zatca/codes';

import { formatAmount } from '../format';
import { PrintButton } from './print-button';

const TITLES: Record<string, [string, string]> = {
  'INVOICE:STANDARD': ['فاتورة ضريبية', 'Tax Invoice'],
  'INVOICE:SIMPLIFIED': ['فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'],
  'CREDIT_NOTE': ['إشعار دائن', 'Credit Note'],
  'DEBIT_NOTE': ['إشعار مدين', 'Debit Note'],
};
const titleFor = (d: DocumentDTO) => TITLES[d.kind === 'INVOICE' ? `INVOICE:${d.subtype}` : d.kind];

const CATEGORY: Record<string, [string, string]> = {
  S: ['خاضع للضريبة', 'Standard rate'],
  Z: ['خاضع لنسبة الصفر', 'Zero rated'],
  E: ['معفى', 'Exempt'],
  O: ['خارج النطاق', 'Out of scope'],
};

const PAYMENT: Record<string, [string, string]> = {
  '10': ['نقدا', 'Cash'],
  '30': ['آجل', 'Credit'],
  '42': ['حساب بنكي', 'Bank account'],
  '48': ['بطاقة بنكية', 'Bank card'],
  '1': ['غير محدد', 'Not defined'],
};

/** Arabic first, English second. */
function Bi({ ar, en, block }: { ar: ReactNode; en: ReactNode; block?: boolean }) {
  return block ? (
    <span className="flex flex-col leading-tight">
      <span>{ar}</span>
      <span dir="ltr" className="text-[0.85em] text-neutral-600">
        {en}
      </span>
    </span>
  ) : (
    <>
      <span>{ar}</span> <span className="text-[0.85em] text-neutral-600">/ {en}</span>
    </>
  );
}

function Party({ heading, party }: { heading: [string, string]; party: PartySnapshot | null }) {
  const a = party?.address;
  const arLine = a ? [a.buildingNumber, a.streetAr ?? a.street, a.districtAr ?? a.district, a.cityAr ?? a.city, a.postalCode].filter(Boolean).join('، ') : '';
  return (
    <section className="flex flex-col gap-1 border border-neutral-300 p-3">
      <h2 className="border-b border-neutral-200 pb-1 text-xs font-semibold text-neutral-600">
        <Bi ar={heading[0]} en={heading[1]} />
      </h2>
      {party ? (
        <>
          <p className="text-base font-semibold">{party.nameAr ?? party.name}</p>
          {party.nameAr ? (
            <p dir="ltr" className="text-left text-sm text-neutral-600">
              {party.name}
            </p>
          ) : null}
          {party.vatNumber ? (
            <p className="text-sm">
              <Bi ar="الرقم الضريبي" en="VAT No." />: <span className="tabular-nums">{party.vatNumber}</span>
            </p>
          ) : party.idValue ? (
            <p className="text-sm">
              <span dir="ltr">{party.idScheme}</span>: <span className="tabular-nums">{party.idValue}</span>
            </p>
          ) : null}
          {arLine ? <p className="text-sm">{arLine}</p> : null}
        </>
      ) : (
        <p className="text-sm">
          <Bi ar="عميل نقدي" en="Walk-in customer" />
        </p>
      )}
    </section>
  );
}

const th = 'border border-neutral-300 bg-neutral-100 px-1.5 py-1 text-start text-xs font-semibold';
const td = 'border border-neutral-300 px-1.5 py-1 align-top tabular-nums';

/** Arabic-primary (RTL), English-secondary print layout of a document. */
export function DocumentPrint({ doc, backHref }: { doc: DocumentDTO; backHref: string }) {
  const [titleAr, titleEn] = titleFor(doc);
  const isDraft = doc.status === 'DRAFT';
  const meta: [ReactNode, ReactNode][] = [
    [<Bi key="n" ar="رقم المستند" en="Number" />, isDraft ? <Bi key="v" ar="مسودة" en="Draft" /> : doc.number],
    [<Bi key="d" ar="تاريخ الإصدار" en="Issue date" />, doc.issueDate ?? '-'],
    ...(doc.supplyDate
      ? ([[<Bi key="s" ar="تاريخ التوريد" en="Supply date" />, doc.supplyEndDate ? `${doc.supplyDate} → ${doc.supplyEndDate}` : doc.supplyDate]] as [ReactNode, ReactNode][])
      : []),
    ...(doc.paymentMeansCode && PAYMENT[doc.paymentMeansCode]
      ? ([[<Bi key="p" ar="طريقة الدفع" en="Payment" />, <Bi key="pv" ar={PAYMENT[doc.paymentMeansCode][0]} en={PAYMENT[doc.paymentMeansCode][1]} />]] as [ReactNode, ReactNode][])
      : []),
    ...(doc.billingReference
      ? ([[<Bi key="o" ar="الفاتورة الأصلية" en="Original invoice" />, doc.billingReference.number ?? '-']] as [ReactNode, ReactNode][])
      : []),
  ];

  return (
    <div className="print-overlay fixed inset-0 z-50 overflow-auto bg-neutral-200 print:static print:bg-white">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          body * { visibility: hidden; }
          .print-root, .print-root * { visibility: visible; }
          .print-overlay { position: static !important; overflow: visible !important; }
          .print-root { position: absolute; inset-inline: 0; top: 0; margin: 0 !important; box-shadow: none !important; width: auto !important; min-height: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-toolbar { display: none !important; }
        }
      `}</style>
      <div className="print-toolbar sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-2" dir="ltr">
        <a href={backHref} className="text-sm underline-offset-4 hover:underline">
          Back to document
        </a>
        <PrintButton />
      </div>

      <article
        dir="rtl"
        lang="ar"
        translate="no"
        className="print-root relative mx-auto my-6 flex min-h-[297mm] w-[210mm] max-w-full flex-col gap-4 overflow-hidden bg-white p-[10mm] text-sm text-black shadow-lg"
        style={{ fontFamily: "'Segoe UI', Tahoma, 'Noto Naskh Arabic', Arial, sans-serif" }}
      >
        {isDraft ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[5.5rem] font-bold tracking-wide whitespace-nowrap text-neutral-900/10 select-none"
            style={{ transform: 'rotate(-30deg)' }}
          >
            مسودة / DRAFT
          </div>
        ) : null}

        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl leading-tight font-bold">{titleAr}</h1>
            <p dir="ltr" className="text-start text-base text-neutral-700">
              {titleEn}
            </p>
            {doc.isTest ? <p className="text-xs font-semibold text-neutral-700">وثيقة اختبار / Test document (Simulation)</p> : null}
          </div>
          <table className="text-xs">
            <tbody>
              {meta.map(([k, v], i) => (
                <tr key={i}>
                  <th className="py-0.5 ps-0 pe-3 text-start font-normal text-neutral-600">{k}</th>
                  <td className="py-0.5 font-semibold tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <Party heading={['البائع', 'Seller']} party={doc.seller} />
          <Party heading={['المشتري', 'Buyer']} party={doc.buyer} />
        </div>

        {doc.noteReason ? (
          <p className="text-sm">
            <Bi ar="سبب الإشعار" en="Reason" />: {doc.noteReason}
          </p>
        ) : null}

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={th}>#</th>
              <th className={th}>
                <Bi ar="الوصف" en="Description" block />
              </th>
              <th className={th}>
                <Bi ar="الكمية" en="Qty" block />
              </th>
              <th className={th}>
                <Bi ar="سعر الوحدة" en="Unit price" block />
              </th>
              <th className={th}>
                <Bi ar="الخصم" en="Discount" block />
              </th>
              <th className={th}>
                <Bi ar="الصافي" en="Net" block />
              </th>
              <th className={th}>
                <Bi ar="الضريبة %" en="VAT %" block />
              </th>
              <th className={th}>
                <Bi ar="الضريبة" en="VAT" block />
              </th>
              <th className={th}>
                <Bi ar="الإجمالي" en="Total" block />
              </th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id}>
                <td className={td}>{l.position}</td>
                <td className={td + ' w-[34%]'}>
                  {l.descriptionAr ? (
                    <>
                      <span className="block">{l.descriptionAr}</span>
                      <span dir="ltr" className="block text-start text-neutral-600">
                        {l.description}
                      </span>
                    </>
                  ) : (
                    <span dir="ltr" className="block text-start">
                      {l.description}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {l.quantity} <span className="text-neutral-600">{l.unitCode}</span>
                </td>
                <td className={td}>{formatAmount(l.unitPriceHalalas)}</td>
                <td className={td}>{formatAmount(l.lineDiscountHalalas)}</td>
                <td className={td}>{formatAmount(l.netHalalas)}</td>
                <td className={td}>
                  {l.taxCategory === 'S' || l.taxRateBp ? `${(l.taxRateBp / 100).toFixed(2)}%` : `${l.taxCategory} 0.00%`}
                </td>
                <td className={td}>{formatAmount(l.vatHalalas)}</td>
                <td className={td}>{formatAmount(l.totalHalalas)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-[1fr_auto] items-start gap-6">
          <div className="flex flex-col gap-3">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={th}>
                    <Bi ar="فئة الضريبة" en="VAT category" block />
                  </th>
                  <th className={th}>
                    <Bi ar="الخاضع للضريبة" en="Taxable" block />
                  </th>
                  <th className={th}>
                    <Bi ar="الضريبة" en="VAT" block />
                  </th>
                </tr>
              </thead>
              <tbody>
                {doc.taxSubtotals.map((s, i) => (
                  <tr key={i}>
                    <td className={td}>
                      <Bi ar={CATEGORY[s.taxCategory][0]} en={`${CATEGORY[s.taxCategory][1]} ${(s.taxRateBp / 100).toFixed(2)}%`} />
                      {s.exemptionReasonCode ? (
                        <span dir="ltr" className="block text-start text-neutral-600">
                          {s.exemptionReasonCode}: {VATEX_REASONS[s.exemptionReasonCode]?.text}
                        </span>
                      ) : null}
                      {s.exemptionReason ? <span className="block text-neutral-600">{s.exemptionReason}</span> : null}
                    </td>
                    <td className={td}>{formatAmount(s.taxableHalalas)}</td>
                    <td className={td}>{formatAmount(s.taxHalalas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {doc.docDiscountReason ? (
              <p className="text-xs">
                <Bi ar="سبب الخصم" en="Discount reason" />: {doc.docDiscountReason}
              </p>
            ) : null}
            {doc.notes ? (
              <p className="text-xs">
                <Bi ar="ملاحظات" en="Notes" />: {doc.notes}
              </p>
            ) : null}
          </div>

          <table className="min-w-[68mm] border-collapse text-xs">
            <tbody>
              {(
                [
                  [<Bi key="1" ar="الإجمالي قبل الضريبة" en="Subtotal" />, doc.lineExtensionHalalas],
                  ...(doc.allowanceTotalHalalas ? [[<Bi key="2" ar="الخصم" en="Discount" />, doc.allowanceTotalHalalas] as const] : []),
                  [<Bi key="3" ar="الإجمالي الخاضع للضريبة" en="Taxable amount" />, doc.taxExclusiveHalalas],
                  [<Bi key="4" ar="ضريبة القيمة المضافة" en="VAT" />, doc.taxHalalas],
                ] as const
              ).map(([k, v], i) => (
                <tr key={i}>
                  <td className={td}>{k}</td>
                  <td className={td + ' text-end'}>{formatAmount(v)}</td>
                </tr>
              ))}
              <tr className="bg-neutral-100 text-sm font-bold">
                <td className={td}>
                  <Bi ar="الإجمالي المستحق" en="Total due" /> <span className="font-normal">(ر.س / SAR)</span>
                </td>
                <td className={td + ' text-end'}>{formatAmount(doc.payableHalalas)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer className="mt-auto flex items-end justify-between gap-6 border-t border-neutral-300 pt-3 text-xs text-neutral-600">
          <p>
            {doc.seller.nameAr ?? doc.seller.name} · <Bi ar="الرقم الضريبي" en="VAT No." /> <span className="tabular-nums">{doc.seller.vatNumber}</span>
          </p>
          {/* QR slot: Phase 7 renders the signed TLV QR here for issued documents. */}
          <div
            data-qr-slot
            className="flex size-[32mm] shrink-0 items-center justify-center border border-dashed border-neutral-400 p-1 text-center text-[0.65rem] leading-tight"
          >
            {isDraft ? (
              <Bi ar="يظهر رمز الاستجابة السريعة بعد الإصدار" en="QR code appears after issue" block />
            ) : (
              <Bi ar="رمز الاستجابة السريعة" en="QR code" block />
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}
