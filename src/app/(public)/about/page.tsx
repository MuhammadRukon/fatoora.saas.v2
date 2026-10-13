import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us | Cryptech',
  description:
    'Cryptech Ltd is a Dhaka-based gadget and electronics shop offering genuine products, official warranty support, and cash on delivery across Bangladesh.',
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl py-10 text-sm sm:text-base [&>h1]:text-2xl [&>h1]:sm:text-3xl [&>h1]:font-semibold [&>h1]:mb-6 [&>h2]:text-lg [&>h2]:sm:text-xl [&>h2]:font-semibold [&>h2]:mt-8 [&>h2]:mb-3 [&>p]:leading-7 [&>p]:mb-4">
      <h1>About Cryptech</h1>
      <p>
        Cryptech Ltd is a gadget and electronics retailer based in Dhaka, Bangladesh. We sell
        genuine tech products — from chargers and accessories to the latest devices — through our
        online store, with delivery available across the country.
      </p>
      <h2>What we stand for</h2>
      <p>
        Every product we list is sourced from authorized channels and covered by the warranty
        stated on its product page. Orders can be paid by cash on delivery, bKash, cards and mobile
        banking via SSLCommerz, or direct bank transfer — whichever suits you.
      </p>
      <h2>Warranty and after-sales</h2>
      <p>
        We handle warranty claims directly through your account: open the order, select the item,
        and submit a claim. Our team reviews every claim and keeps you updated at each step.
      </p>
      <h2>Where to find us</h2>
      <p>
        Head office: Tali Office Road, Hazaribagh, Dhaka-1209. For anything else, see our{' '}
        <a className="text-primary hover:underline" href="/contact">
          contact page
        </a>
        .
      </p>
    </article>
  );
}
