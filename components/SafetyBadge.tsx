interface SafetyBadgeProps {
  score: number;
}

export default function SafetyBadge({ score }: SafetyBadgeProps) {
  const colorClass =
    score >= 9
      ? "text-emerald-400"
      : score >= 7
      ? "text-lime-400"
      : score >= 4
      ? "text-amber-400"
      : "text-red-500";

  const label =
    score >= 9
      ? "Excellent"
      : score >= 7
      ? "Good"
      : score >= 4
      ? "Caution"
      : "Hazardous";

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-7xl font-mono font-bold leading-none ${colorClass}`}>
        {score}
      </span>
      <span className={`text-sm font-semibold uppercase tracking-widest ${colorClass}`}>
        {label}
      </span>
      <span className="text-xs text-slate-400 font-mono">/ 10</span>
    </div>
  );
}
