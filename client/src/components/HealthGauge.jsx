import { motion } from "framer-motion";

const TONE_COLORS = {
  good: { from: "#10b981", to: "#34d399" },
  warn: { from: "#f59e0b", to: "#fbbf24" },
  critical: { from: "#f43f5e", to: "#fb7185" },
  info: { from: "#3849f5", to: "#8b5cf6" },
};

/**
 * Circular progress ring for the Business Health Score.
 * score: 0-100 (or null for insufficient data), tone: good|warn|critical|info
 */
export default function HealthGauge({ score, tone = "info", label, size = 180, stroke = 14 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference - (pct / 100) * circumference;
  const colors = TONE_COLORS[tone] || TONE_COLORS.info;
  const gid = `gauge-${tone}`;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.from} />
            <stop offset="100%" stopColor={colors.to} />
          </linearGradient>
        </defs>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-ink-200/50"
        />
        {/* progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {score == null ? (
          <span className="text-ink-400 text-sm font-medium px-6 text-center">Not enough data yet</span>
        ) : (
          <>
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="font-display font-extrabold text-ink-900 leading-none"
              style={{ fontSize: size * 0.3 }}
            >
              {Math.round(score)}
            </motion.span>
            <span className="text-[11px] uppercase tracking-widest text-ink-400 mt-1">/ 100</span>
            {label && (
              <span
                className="mt-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full"
                style={{ color: colors.from, backgroundColor: `${colors.from}1f` }}
              >
                {label}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
