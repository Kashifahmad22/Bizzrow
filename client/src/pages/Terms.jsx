import LegalPage from "../components/marketing/LegalPage.jsx";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="June 2026"
      intro="These terms describe the basics of using Bizzrow. By creating an account you agree to use the product responsibly and lawfully."
      sections={[
        { h: "Your account", p: "You are responsible for keeping your login credentials safe and for the activity that happens under your account. Provide accurate information when you sign up." },
        { h: "Acceptable use", p: "Use Bizzrow for managing your own business operations. Do not misuse the platform, attempt to breach its security, or use it to send unlawful or unsolicited messages." },
        { h: "Your data", p: "Your business data belongs to you. You grant Bizzrow permission to process it solely to provide the service, as described in our Privacy Policy." },
        { h: "Plans and billing", p: "Paid plans (Starter, Growth and Business) are billed monthly or annually. Pricing is shown on our site. There is no online checkout today — plans are arranged with our team. Taxes may apply." },
        { h: "Availability", p: "We work to keep Bizzrow reliable, but the service is provided on an 'as available' basis and may occasionally be interrupted for maintenance or factors beyond our control." },
        { h: "Changes", p: "We may update these terms as the product develops. Continued use after an update means you accept the revised terms." },
        { h: "Contact", p: "Questions about these terms? Email hello@bizzrow.com or call +91 7858057383." },
      ]}
    />
  );
}
