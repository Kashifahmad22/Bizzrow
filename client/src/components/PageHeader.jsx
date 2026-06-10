export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display font-extrabold text-2xl lg:text-3xl text-ink-900">{title}</h1>
        {subtitle && <p className="text-ink-500 mt-1 text-sm lg:text-base">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
