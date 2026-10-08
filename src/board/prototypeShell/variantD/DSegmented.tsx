import { FOCUS_RING, GARAMOND } from "./theme";

/** THROWAWAY PROTOTYPE: an ink-ruled segmented choice on parchment; the picked one is pressed in. */
export function DSegmented<T extends string>({ label, options, value, onPick }: { label: string; options: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className={`${GARAMOND} flex w-full rounded-[3px] border border-[#5b3f22] overflow-hidden shadow-[0_2px_0_#5b3f22]`}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o)}
            className={`${FOCUS_RING} flex-1 px-2 py-1 text-[15px] border-l first:border-l-0 border-[#5b3f22]/60 cursor-pointer ${
              on ? "bg-[#3b2616] text-[#f0d79a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]" : "bg-[#efe3c2] text-[#3a2817] hover:bg-[#f6ecd2]"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
