import { BOARD_H } from "./shellStyles";

/** A small board over the harbour while the shell reads who is signed in (#125). */
export function ShellStatus({ text = "Reading the ship's log…" }: { text?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <p role="status" className={`${BOARD_H} px-5 py-3 font-garamond text-[17px] text-shell-timber-text italic`}>
        {text}
      </p>
    </div>
  );
}
