import { useEffect } from "react";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";

/**
 * Shared shell for the Privacy and Terms pages so they carry the same
 * navbar, footer and brand identity as the marketing site.
 * sections: [{ h, p }] where p is a string or array of strings.
 */
export default function LegalPage({ title, updated, intro, sections = [] }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="min-h-screen bg-navy-950 text-slate-200">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 sm:px-8 pt-32 pb-24">
        <h1 className="font-display font-extrabold text-4xl text-white">{title}</h1>
        {updated && <p className="mt-3 text-sm text-slate-500">Last updated: {updated}</p>}
        {intro && <p className="mt-6 text-slate-400 leading-relaxed">{intro}</p>}

        <div className="mt-10 space-y-9">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display font-bold text-xl text-white">{s.h}</h2>
              {(Array.isArray(s.p) ? s.p : [s.p]).map((para, idx) => (
                <p key={idx} className="mt-3 text-slate-400 leading-relaxed">{para}</p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-12 text-sm text-slate-500">
          This page is a plain-language summary provided for transparency and may be updated as Bizzrow evolves.
          For anything specific to your account, email{" "}
          <a href="mailto:hello@bizzrow.com" className="text-azure-400 hover:text-azure-300">hello@bizzrow.com</a>.
        </p>
      </main>
      <Footer />
    </div>
  );
}
