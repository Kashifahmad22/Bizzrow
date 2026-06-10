import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

/**
 * Themed dropdown (Sprint 1.1 — Issue #4; portal hotfix — Sprint 1.1.1).
 *
 * The menu renders in a PORTAL to document.body with fixed positioning
 * (Radix/Headless-style), so it is never clipped by a parent's overflow,
 * never trapped behind sibling cards by a parent stacking context, and is
 * always fully scrollable. It flips above the trigger when space is tight and
 * repositions on scroll/resize. Works on desktop and mobile.
 *
 * Public API is unchanged: { label, value, onChange, options, className }.
 */
export default function Select({ label, value, onChange, options, className = "" }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, bottom: null, left: 0, width: 0, maxHeight: 280 });
  const current = options.find((o) => o.value === value) || options[0];

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const desired = 280;
    const spaceBelow = vh - r.bottom - gap;
    const spaceAbove = r.top - gap;

    const width = Math.min(Math.max(r.width, 176), vw - 16);
    let left = r.left;
    if (left + width > vw - 8) left = Math.max(8, vw - 8 - width);

    // Flip up only when there isn't enough room below and there's more above.
    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      setPos({ top: null, bottom: vh - (r.top - gap), left, width, maxHeight: Math.max(140, Math.min(desired, spaceAbove)) });
    } else {
      setPos({ top: r.bottom + gap, bottom: null, left, width, maxHeight: Math.max(140, Math.min(desired, spaceBelow)) });
    }
  }, []);

  useLayoutEffect(() => {
    if (open) computePosition();
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => computePosition();
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // capture:true so scrolling inside any ancestor scroll container repositions the menu.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, computePosition]);

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        style={{
          position: "fixed",
          top: pos.top != null ? pos.top : undefined,
          bottom: pos.bottom != null ? pos.bottom : undefined,
          left: pos.left,
          width: pos.width,
          maxHeight: pos.maxHeight,
          zIndex: 1000,
        }}
        className="bg-surface border border-ink-200/70 rounded-xl shadow-card py-1 overflow-y-auto overscroll-contain"
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition ${
                selected ? "bg-brand-500/10 text-brand-500 dark:text-brand-300" : "text-ink-700 hover:bg-ink-100"
              }`}
            >
              <span>{o.label}</span>
              {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          );
        })}
      </div>,
      document.body
    );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 bg-ink-50 hover:bg-ink-100 rounded-xl px-3 py-2 text-sm border border-ink-200/60 transition"
      >
        {label && <span className="text-xs text-ink-400">{label}</span>}
        <span className="text-ink-800 font-medium">{current?.label}</span>
        <ChevronDown className={`w-4 h-4 text-ink-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </div>
  );
}
