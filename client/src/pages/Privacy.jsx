import LegalPage from "../components/marketing/LegalPage.jsx";

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 2026"
      intro="Bizzrow helps you run your business. We take the data you trust us with seriously. This summary explains what we store, why, and the control you have over it."
      sections={[
        { h: "What we collect", p: "Account details you provide (name, business name, email) and the business data you create in Bizzrow — products, sales, customers, ledger entries and invoices. We also store basic technical information needed to keep your account secure." },
        { h: "How we use it", p: "Your data is used only to operate Bizzrow for you: to show your dashboard, generate invoices and reminders, calculate business health and insights, and keep your records consistent. We do not sell your data." },
        { h: "AI processing", p: "When you use OCR import or AI insights, the relevant content (for example, a supplier invoice image or your summary figures) is processed by Google Gemini to extract products or generate guidance. You review OCR results before anything is saved." },
        { h: "WhatsApp messaging", p: "If you send invoices or reminders, messages are delivered through the official Meta WhatsApp Cloud API to the recipients you choose. You control when and to whom messages are sent." },
        { h: "Security", p: "Each account is isolated to its owner. Passwords are stored hashed (never in plain text) and access uses secure tokens. We restrict data access to what is needed to provide the service." },
        { h: "Your choices", p: "You can update your business details at any time and request export or deletion of your data by contacting us. Closing your account removes your access and schedules your data for deletion." },
        { h: "Contact", p: "Questions about privacy? Email hello@bizzrow.com or call +91 7858057383." },
      ]}
    />
  );
}
