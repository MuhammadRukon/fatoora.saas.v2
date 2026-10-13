import Image from 'next/image';
import Link from 'next/link';

export type LogoProps = {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
};

export function Logo({
  alt = 'Cryptech Logo',
  width = 100,
  height = 100,
  className,
  src = '/logo.png',
}: Readonly<LogoProps>) {
  return (
    <Link href="/">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        quality={100}
      />
    </Link>
  );
}
