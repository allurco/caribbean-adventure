import { useState, type ComponentProps } from "react";
import { GameClientLoader } from "./GameClientLoader";

type LocalSeatsProps = Omit<ComponentProps<typeof GameClientLoader>, "playerID"> & {
  /** The match's seat count (`seatCount`, #278), as the client was created with. */
  seats: number;
};

/**
 * Every seat of one match on one page (dev `?seats=1`, #110), one board at a
 * time: the switcher picks whose board shows. The match lives in the local
 * transport, so switching seats keeps it; each board is that seat's own.
 * As many seats as the match has (`?players=`, solo without it, #278).
 */
export function LocalSeats({ seats, ...props }: LocalSeatsProps) {
  const ids = Array.from({ length: seats }, (_, i) => String(i));
  const [seat, setSeat] = useState(ids[0]);
  return (
    <>
      <GameClientLoader key={seat} {...props} playerID={seat} />
      {/* Above the board's loading screen (z-60) and the draft over the scene (z-55), so a seat can always be switched */}
      <nav
        aria-label="Seat"
        className="absolute top-16 right-4 z-[70] flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-white font-mono text-xs"
      >
        <span className="opacity-70 mr-1">seat</span>
        {ids.map((id) => (
          <button
            key={id}
            aria-pressed={id === seat}
            onClick={() => setSeat(id)}
            className={`px-2 py-0.5 rounded cursor-pointer ${id === seat ? "bg-amber-600" : "bg-white/10 hover:bg-white/20"}`}
          >
            P{Number(id) + 1}
          </button>
        ))}
      </nav>
    </>
  );
}
