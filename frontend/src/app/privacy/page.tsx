import "./page.css";

export default function Privacy() {
  return (
    <main className="privacy-page">
      <div className="privacy-shell">
        <header className="privacy-header">
          <p className="privacy-eyebrow">Meteora</p>
          <h1>Privacy Policy</h1>
          <p className="privacy-updated">Last updated: March 2025</p>
        </header>

        <section className="privacy-card">
          <h2>How we use your data</h2>
          <p>
            Meteora does not sell or share your personal data. We collect your
            email address solely for authentication via Google OAuth.
          </p>
          <p>
            Uploaded CSV files are used only to generate charts during your
            session and are not stored as permanent personal records.
          </p>
        </section>

        <section className="privacy-card">
          <h2>Contact</h2>
          <p>
            For privacy-related questions, contact{" "}
            <a href="mailto:ansh72126@gmail.com">ansh72126@gmail.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}