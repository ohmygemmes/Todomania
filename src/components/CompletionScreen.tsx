interface Props {
  total: number;
}

export function CompletionScreen({ total }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 animate-bounce-in">
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-full bg-idayal-blue/20 blur-2xl scale-150 animate-shimmer" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-idayal-blue to-idayal-blue-dark flex items-center justify-center shadow-[0_12px_32px_rgba(61,186,142,0.35)]">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L20 7" />
          </svg>
        </div>
      </div>
      <h2 className="text-[22px] font-bold text-idayal-text dark:text-zinc-100 tracking-tight2 mb-1.5">
        Journée bouclée
      </h2>
      <p className="text-[14px] text-idayal-text-secondary dark:text-zinc-400 max-w-[280px]">
        {total > 0 ? (
          <>
            <span className="tabular font-semibold text-idayal-text dark:text-zinc-200">
              {total}
            </span>{' '}
            tâche{total > 1 ? 's' : ''} bouclée{total > 1 ? 's' : ''}. Profite du reste de ta
            journée.
          </>
        ) : (
          "Rien à faire aujourd'hui. Profite."
        )}
      </p>
    </div>
  );
}
