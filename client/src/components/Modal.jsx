import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, footer, size = "md" }) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-ink-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className={`bg-surface w-full ${widths[size]} rounded-t-3xl sm:rounded-2xl shadow-2xl border border-ink-200/60 flex flex-col max-h-[90vh]`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/60">
              <h3 className="font-display font-bold text-lg text-ink-900">{title}</h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
            {footer && (
              <div className="px-5 py-4 border-t border-ink-200/60 bg-ink-50/50 rounded-b-3xl sm:rounded-b-2xl">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
