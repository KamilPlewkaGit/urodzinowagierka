import Link from "next/link";

export function CasinoLogo() {
  return (
    <Link className="brand" href="/" aria-label="Strona główna Wielkiego Stołu">
      <span className="brand-mark" aria-hidden="true">♠</span>
      <span>
        <span className="brand-kicker">GRA</span>
        <span className="brand-name">WIELKI STÓŁ</span>
      </span>
    </Link>
  );
}
