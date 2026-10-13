export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="mx-auto max-w-7xl px-4 sm:px-14">{children}</main>;
}
