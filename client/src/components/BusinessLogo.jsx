import { useEffect, useState } from "react";
import { initials } from "../lib/format.js";

export default function BusinessLogo({ logo, name, className = "", fallbackClassName = "" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logo]);

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden bg-white ${className}`}>
      {logo && !failed ? (
        <img
          src={logo}
          alt={name ? `${name} logo` : "Business logo"}
          className="h-full w-full object-contain object-center"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={fallbackClassName}>{initials(name || "Bizzrow")}</span>
      )}
    </div>
  );
}
