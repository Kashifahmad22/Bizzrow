export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col items-start gap-4 mb-6 sm:flex-row sm:justify-between">
      <div>
        <h1 className="font-display font-extrabold text-2xl lg:text-3xl text-ink-900">{title}</h1>
        {subtitle && <p className="text-ink-500 mt-1 text-sm lg:text-base">{subtitle}</p>}
      </div>
      {action && <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{action}</div>}
    </div>
  );
}
