import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms and Conditions | Cryptech',
  description:
    'Terms and conditions for ordering from Cryptech Ltd — pricing, payment methods, delivery, cancellations, and warranty.',
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl py-10 text-sm sm:text-base [&>h1]:text-2xl [&>h1]:sm:text-3xl [&>h1]:font-semibold [&>h1]:mb-2 [&>h2]:text-lg [&>h2]:sm:text-xl [&>h2]:font-semibold [&>h2]:mt-8 [&>h2]:mb-3 [&>p]:leading-7 [&>p]:mb-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul]:space-y-1">
      <h1>Terms and Conditions</h1>
      <p className="text-muted-foreground">Effective date: 18 July 2026</p>
      <p>
        These terms govern purchases made from Cryptech Ltd through this website. By placing an
        order you agree to them.
      </p>
      <h2>Orders and pricing</h2>
      <ul>
        <li>All prices are shown in Bangladeshi Taka (BDT) and include the listed discounts.</li>
        <li>
          An order is confirmed once payment is received, or — for cash on delivery — once we
          verify the order details.
        </li>
        <li>
          If a product is unavailable or listed at a clearly incorrect price due to an error, we
          may cancel the affected order and refund any payment in full.
        </li>
      </ul>
      <h2>Payment methods</h2>
      <ul>
        <li>Cash on delivery (COD)</li>
        <li>bKash</li>
        <li>Cards and mobile banking via SSLCommerz</li>
        <li>Direct bank transfer (verified manually before confirmation)</li>
      </ul>
      <h2>Delivery</h2>
      <p>
        We deliver across Bangladesh. Delivery charges and estimated times are shown at checkout.
        Ownership and risk pass to you on delivery. Please check the package before accepting a COD
        delivery.
      </p>
      <h2>Cancellations</h2>
      <p>
        You may cancel an order from your account any time before it ships. Once an order has
        shipped it can no longer be self-cancelled — see our{' '}
        <a className="text-primary hover:underline" href="/refund-policy">
          Refund and Return Policy
        </a>{' '}
        for what to do after delivery.
      </p>
      <h2>Warranty</h2>
      <p>
        Products carry the warranty stated on their product page. Warranty claims are submitted
        from the relevant order in your account and handled according to the manufacturer&apos;s or
        importer&apos;s warranty terms. Physical damage, liquid damage, and unauthorized repairs
        void warranty coverage.
      </p>
      <h2>Accounts</h2>
      <p>
        You are responsible for keeping your account credentials confidential. We may suspend
        accounts used for fraudulent orders or abuse of the service.
      </p>
      <h2>Reviews</h2>
      <p>
        Product reviews can be posted for items you have purchased. Reviews must be honest and must
        not contain unlawful or abusive content; we may remove reviews that violate this.
      </p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Bangladesh.</p>
      <h2>Contact</h2>
      <p>
        Questions about these terms: see our{' '}
        <a className="text-primary hover:underline" href="/contact">
          contact page
        </a>
        .
      </p>
    </article>
  );
}
