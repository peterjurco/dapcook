interface ContinuedCueProps {
  label: string
}

/** Cue shown in place of the resize handle for a meal that began in an earlier week. */
export function ContinuedCue({ label }: ContinuedCueProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white border border-gray-200 px-1 text-[10px] text-gray-400"
    >
      ↤
    </span>
  )
}
