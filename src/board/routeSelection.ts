/**
 * What a click or Enter means on the turn's reach (#213): a neighbouring hex
 * is sailed to at once, as a single click always did; a farther one is
 * selected so its route shows, and sailed on a second click (or Enter); a
 * hex out of reach cancels the preview. Pure.
 */
import type { Hex } from "../game/hex";
import { wrappedEquals } from "../game/hex";
import { routeTo, type Reach } from "../game/reach";

export type ReachClick =
  | { readonly kind: "move"; readonly hex: Hex }
  | { readonly kind: "select"; readonly hex: Hex }
  | { readonly kind: "sail"; readonly route: Hex[] }
  | { readonly kind: "cancel" };

/** The action for a click on `clicked`, with `selected` the hex whose route is showing. */
export function reachClick(reach: Reach, selected: Hex | null, clicked: Hex): ReachClick {
  const route = routeTo(reach, clicked);
  if (route.length === 0) return { kind: "cancel" };
  if (route.length === 1) return { kind: "move", hex: route[0] };
  if (selected && wrappedEquals(selected, clicked, reach.wrap)) return { kind: "sail", route };
  return { kind: "select", hex: route[route.length - 1] };
}

/** The route Enter sails: to the selected hex, else the hovered one; empty when neither is in reach. */
export function reachConfirm(reach: Reach, selected: Hex | null, hovered: Hex | null): Hex[] {
  const target = selected ?? hovered;
  return target ? routeTo(reach, target) : [];
}
