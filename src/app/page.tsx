import { CasinoLogo } from "@/components/casino-logo";
import { RegistrationForm } from "@/components/registration-form";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav"><CasinoLogo /><span>Private multiplayer game</span></nav>
      <div className="landing-grid">
        <section className="landing-intro">
          <span className="eyebrow">An evening at the tables</span>
          <h1>Choose a house.<br /><em>Play for glory.</em></h1>
          <p>A private, casino-inspired game for your group. Pick your team, take your 100-chip stack, and wait for the table to open.</p>
          <div className="landing-figures">
            <div><strong>04</strong><span>rival houses</span></div>
            <div><strong>100</strong><span>starting chips</span></div>
            <div><strong>01</strong><span>grand table</span></div>
          </div>
        </section>
        <RegistrationForm />
      </div>
      <div className="ambient-chip chip-one" aria-hidden="true">♠</div>
      <div className="ambient-chip chip-two" aria-hidden="true">♦</div>
      <div className="ambient-orbit" aria-hidden="true" />
    </main>
  );
}
