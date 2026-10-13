import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund and Return Policy | Cryptech',
  description:
    'Cryptech Ltd return window, conditions, and refund timelines — including refunds for bKash, card, and bank-transfer payments.',
};

export default function RefundPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl py-10 text-sm sm:text-base [&>h1]:text-2xl [&>h1]:sm:text-3xl [&>h1]:font-semibold [&>h1]:mb-2 [&>h2]:text-lg [&>h2]:sm:text-xl [&>h2]:font-semibold [&>h2]:mt-8 [&>h2]:mb-3 [&>p]:leading-7 [&>p]:mb-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul]:space-y-1">
      <h1>Refund and Return Policy</h1>
      <p className="text-muted-foreground">Effective date: 18 July 2026</p>
      <h2>Return window</h2>
      <p>
        You may request a return within <strong>7 days of delivery</strong> if the product is
        defective on arrival, damaged in transit, or not the item you ordered.
      </p>
      <h2>Return conditions</h2>
      <ul>
        <li>The product must be in its original packaging with all accessories, manuals, and the invoice.</li>
        <li>The product must not show signs of use, physical damage, or liquid damage.</li>
        <li>
          Software-related issues and change-of-mind returns on opened items are handled under the
          product&apos;s warranty terms instead of this return policy.
        </li>
      </ul>
      <h2>How to request a return</h2>
      <p>
        Contact us by phone/WhatsApp (+880 1815-780053) or email within the return window with your
        order number and photos of the issue. Once approved, we will arrange pickup or share the
        return address. Return shipping for verified defects or wrong items is on us.
      </p>
      <h2>Refunds</h2>
      <ul>
        <li>
          Refunds are issued to the original payment method: bKash, card/mobile banking
          (via SSLCommerz), or bank account.
        </li>
        <li>Cash-on-delivery orders are refunded by bKash or bank transfer, whichever you prefer.</li>
        <li>
          Refunds are processed within <strong>10 business days</strong> of us receiving and
          inspecting the returned item. Gateway processing may add a few days depending on your
          bank or wallet provider.
        </li>
        <li>
          If you cancel an order before it ships, any online payment is refunded in full to the
          original payment method.
        </li>
      </ul>
      <h2>Exchanges</h2>
      <p>
        Where stock allows, you may choose a replacement unit of the same product instead of a
        refund.
      </p>
      <h2>Contact</h2>
      <p>
        For any refund or return question, see our{' '}
        <a className="text-primary hover:underline" href="/contact">
          contact page
        </a>
        .
      </p>
    </article>
  );
}
