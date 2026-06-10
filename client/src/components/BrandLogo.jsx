import { Link } from "react-router-dom";

/**
 * Bizzrow brand lockup. Uses the OFFICIAL logo mark (cropped from the supplied
 * asset, never recreated) at /brand/logo-mark-transparent.png, paired with a
 * typographic "Bizzrow" wordmark for crisp rendering at any size.
 *
 * Props:
 *   size        mark height in px (default 32)
 *   wordmark    show the "Bizzrow" text wordmark (default true)
 *   to          wrap in a router Link to this path (default "/")
 *   className   extra classes on the root
 *   textClass   override wordmark text classes
 */
export default function BrandLogo({ size = 32, wordmark = true, to = "/", className = "", textClass = "" }) {
  const inner = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/brand/logo-mark-transparent.png"
        alt="Bizzrow logo"
        width={size}
        height={size}
        style={{ height: size, width: size }}
        className="object-contain select-none"
        draggable="false"
      />
      {wordmark && (
        <span className={textClass || "font-display font-extrabold tracking-tight text-white text-xl"}>Bizzrow</span>
      )}
    </span>
  );
  if (to) {
    return (
      <Link to={to} aria-label="Bizzrow home" className="inline-flex">
        {inner}
      </Link>
    );
  }
  return inner;
}
