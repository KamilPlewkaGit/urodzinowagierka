import Link from "next/link";

export function CasinoLogo() {
  return (
    <Link className="brand" href="/" aria-label="The Grand Table home">
      <span className="brand-mark" aria-hidden="true">♠</span>
      <span>
        <span className="brand-kicker">THE</span>
        <span className="brand-name">GRAND TABLE</span>
      </span>
    </Link>
  );
}
