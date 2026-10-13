import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | Cryptech',
  description:
    'Get in touch with Cryptech Ltd — phone, WhatsApp, email, and our Dhaka head office address. Support for orders, deliveries, payments, and warranty claims.',
};

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-3xl py-10 text-sm sm:text-base [&>h1]:text-2xl [&>h1]:sm:text-3xl [&>h1]:font-semibold [&>h1]:mb-6 [&>h2]:text-lg [&>h2]:sm:text-xl [&>h2]:font-semibold [&>h2]:mt-8 [&>h2]:mb-3 [&>p]:leading-7 [&>p]:mb-4">
      <h1>Contact Us</h1>
      <p>
        Questions about an order, delivery, payment, or a warranty claim? Reach us through any of
        the channels below — we respond fastest on WhatsApp during business hours (Saturday to
        Thursday, 10:00 AM – 8:00 PM).
      </p>
      <h2>Phone / WhatsApp</h2>
      <p>
        <a className="text-primary hover:underline" href="tel:+8801815780053">
          +880 1815-780053
        </a>{' '}
        (
        <a className="text-primary hover:underline" href="whatsapp://send?phone=+8801815780053">
          WhatsApp
        </a>
        )
      </p>
      <h2>Email</h2>
      <p>
        <a className="text-primary hover:underline" href="mailto:muhammad.rukon242@gmail.com">
          muhammad.rukon242@gmail.com
        </a>
      </p>
      <h2>Head office</h2>
      <p>Tali Office Road, Hazaribagh, Dhaka-1209, Bangladesh</p>
      <h2>Order and warranty support</h2>
      <p>
        For order status, use the tracking timeline in the Orders section of your account. Warranty
        claims can be submitted directly from the relevant order — we&apos;ll keep you updated as
        your claim progresses.
      </p>
    </article>
  );
}
