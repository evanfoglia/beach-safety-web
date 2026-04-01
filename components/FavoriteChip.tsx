interface FavoriteChipProps {
  name: string;
  onClick: () => void;
  onRemove: () => void;
}

export default function FavoriteChip({ name, onClick, onRemove }: FavoriteChipProps) {
  return (
    <div className="group relative inline-flex items-center gap-1.5">
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 rounded-full text-sm text-slate-200 transition-all duration-150"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="#facc15"
          stroke="#facc15"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span className="max-w-[120px] truncate">{name}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center text-white text-xs transition-opacity"
        aria-label={`Remove ${name}`}
      >
        ×
      </button>
    </div>
  );
}
