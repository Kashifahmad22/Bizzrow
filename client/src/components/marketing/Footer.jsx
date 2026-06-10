import { Link } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import BrandLogo from "../BrandLogo.jsx";
import { BRAND, contactMailto } from "../../lib/brand.js";

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-navy-950">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-14">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <BrandLogo size={32} />
            <p className="mt-4 text-slate-400 max-w-xs leading-relaxed">{BRAND.tagline}</p>
            <div className="mt-5 space-y-2 text-sm">
              <a href={contactMailto} className="flex items-center gap-2 text-slate-300 hover:text-white transition">
                <Mail className="w-4 h-4 text-azure-400" /> {BRAND.email}
              </a>
              <a href={`tel:${BRAND.phoneDial}`} className="flex items-center gap-2 text-slate-300 hover:text-white transition">
                <Phone className="w-4 h-4 text-azure-400" /> {BRAND.phoneDisplay}
              </a>
            </div>
          </div>

          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            <FooterCol title="Product" links={[
              { label: "Features", href: "/#features" },
              { label: "Solutions", href: "/#solutions" },
              { label: "Pricing", href: "/#pricing" },
            ]} />
            <FooterCol title="Company" links={[
              { label: "FAQ", href: "/#faq" },
              { label: "Contact", href: "/#contact" },
              { label: "Book a demo", href: "/#pricing" },
            ]} />
            <FooterCol title="Legal" to links={[
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
            ]} />
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} Bizzrow. All rights reserved.</p>
          <p>Made for retailers, wholesalers &amp; distributors across India.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links, to = false }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) =>
          to ? (
            <li key={l.href}>
              <Link to={l.href} className="text-sm text-slate-300 hover:text-white transition">
                {l.label}
              </Link>
            </li>
          ) : (
            <li key={l.href}>
              <a href={l.href} className="text-sm text-slate-300 hover:text-white transition">
                {l.label}
              </a>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
