export default function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="card text-center py-12">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 text-brand-500 mx-auto mb-4 flex items-center justify-center">
          <Icon className="w-7 h-7" />
        </div>
      )}
      <h3 className="font-display font-bold text-ink-800 text-lg">{title}</h3>
      {body && <p className="text-ink-500 text-sm mt-1 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
