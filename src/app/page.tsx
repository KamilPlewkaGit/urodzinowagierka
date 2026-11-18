import { CasinoLogo } from "@/components/casino-logo";
import { RegistrationForm } from "@/components/registration-form";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav"><CasinoLogo /><span>Prywatna gra drużynowa</span></nav>
      <div className="landing-grid">
        <section className="landing-intro">
          <span className="eyebrow">Wieczór przy stołach</span>
          <h1>Wybierz drużynę.<br /><em>Graj o chwałę.</em></h1>
          <p>Prywatna gra dla Twojej ekipy w kasynowym stylu. Wybierz drużynę, odbierz 100 żetonów i czekaj na otwarcie stołu.</p>
          <div className="landing-figures">
            <div><strong>04</strong><span>rywalizujące drużyny</span></div>
            <div><strong>100</strong><span>żetonów na start</span></div>
            <div><strong>01</strong><span>wielki stół</span></div>
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
