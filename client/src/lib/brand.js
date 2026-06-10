// Single source of truth for Bizzrow contact details + prefilled mailto links.
export const BRAND = {
  name: "Bizzrow",
  tagline: "Business management as simple as WhatsApp.",
  email: "hello@bizzrow.com",
  phoneDisplay: "+91 7858057383",
  phoneDial: "+917858057383",
};

// "Book Demo" opens the user's email client with everything pre-filled — they
// only need to press Send. No scheduling platform, no payment gateway.
const DEMO_BODY = `Hello Team Bizzrow,

I would like to schedule a demo for my business.

Business Name:
Business Type:
Number of Employees:
Current Business Management Method:
Phone Number:
Preferred Demo Time:

Thank You.`;

export const demoMailto = `mailto:${BRAND.email}?subject=${encodeURIComponent("Bizzrow Demo Request")}&body=${encodeURIComponent(DEMO_BODY)}`;

export const salesMailto = `mailto:${BRAND.email}?subject=${encodeURIComponent("Bizzrow Sales Enquiry")}&body=${encodeURIComponent(
  `Hello Team Bizzrow,\n\nI'd like to learn more about Bizzrow plans for my business.\n\nBusiness Name:\nBusiness Type:\nPreferred Plan:\n\nThank You.`
)}`;

export const contactMailto = `mailto:${BRAND.email}`;
