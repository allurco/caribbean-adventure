import type { Volley } from "../game/types";
import { volleyLine } from "./volleyText";

/** The round's volleys in the order they were fired, each one's damage landed (#346), and where each hit landed (#380). */
export function VolleyLines({
  volleys,
  shooterLabel,
  upgradesOf,
}: {
  volleys: Volley[];
  shooterLabel: (id: string) => string;
  upgradesOf: (id: string) => readonly string[];
}) {
  return (
    <>
      {volleys.map((volley, i) => {
        const line = volleyLine(volley, upgradesOf(volley.shooterId));
        return (
          <div key={i} className="text-xs text-amber-100/80">
            <span className="text-amber-400">{shooterLabel(volley.shooterId)}</span> {line.fired}:{" "}
            <span className="font-heading text-red-400">{line.hits}</span>
          </div>
        );
      })}
    </>
  );
}
