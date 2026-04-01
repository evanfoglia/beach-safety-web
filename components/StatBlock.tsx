import { ReactNode } from "react";

interface StatBlockProps {
  label: string;
  value: string | ReactNode;
  sub?: string;
  icon?: ReactNode;
}

export default function StatBlock({ label, value, sub, icon }: StatBlockProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        {icon && <span className="text-cyan-400">{icon}</span>}
        <span className="text-base font-mono font-semibold text-slate-100">{value}</span>
        {sub && <span className="text-xs text-slate-500 font-mono">{sub}</span>}
      </div>
    </div>
  );
}
