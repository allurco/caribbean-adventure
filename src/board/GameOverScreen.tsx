interface GameOverScreenProps {
  winner: string;
  captainName: string;
  score: number;
  onPlayAgain: () => void;
}

export function GameOverScreen({
  captainName,
  score,
  onPlayAgain,
}: GameOverScreenProps) {
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900
                      border-2 border-amber-600/50 rounded-2xl p-8 max-w-md text-center
                      shadow-2xl shadow-amber-900/50">
        {/* Trophy Icon */}
        <div className="text-6xl mb-4">🏆</div>

        {/* Victory Title */}
        <h1 className="font-heading text-3xl text-amber-400 uppercase tracking-wider mb-2">
          Victory!
        </h1>

        {/* Captain Name */}
        <p className="text-amber-200 text-xl mb-1">
          Captain <span className="font-bold text-amber-100">{captainName}</span>
        </p>

        {/* Subtitle */}
        <p className="text-amber-400/70 text-sm mb-6">
          has conquered the Caribbean!
        </p>

        {/* Final Score */}
        <div className="bg-amber-900/30 rounded-lg p-4 mb-6 border border-amber-800/30">
          <div className="text-amber-400/60 text-xs uppercase tracking-wider mb-1">
            Final Glory
          </div>
          <div className="text-4xl font-bold text-amber-200">
            {score}
          </div>
        </div>

        {/* Play Again Button */}
        <button
          onClick={onPlayAgain}
          className="font-heading px-8 py-3 bg-amber-700 hover:bg-amber-600
                     text-amber-100 text-lg uppercase tracking-wider
                     rounded-lg border border-amber-500/50 cursor-pointer
                     transition-all hover:scale-105 hover:shadow-lg hover:shadow-amber-900/50"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
