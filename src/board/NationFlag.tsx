import type { Nation, PortNation } from "../game/types";

interface NationFlagProps {
  nation: Nation | PortNation;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-3 h-2",
  md: "w-4 h-3",
  lg: "w-6 h-4",
};

export function NationFlag({ nation, size = "sm", className = "" }: NationFlagProps) {
  const sizeClass = SIZE_CLASSES[size];

  // England - St George's Cross (red cross on white)
  if (nation === "England") {
    return (
      <div
        className={`${sizeClass} ${className} relative overflow-hidden rounded-sm ring-1 ring-black/20`}
        title="England"
      >
        <div className="absolute inset-0 bg-white" />
        <div className="absolute top-1/2 left-0 right-0 h-[20%] -translate-y-1/2 bg-red-600" />
        <div className="absolute left-1/2 top-0 bottom-0 w-[15%] -translate-x-1/2 bg-red-600" />
      </div>
    );
  }

  // France - Tricolore (blue, white, red vertical stripes)
  if (nation === "France") {
    return (
      <div
        className={`${sizeClass} ${className} flex overflow-hidden rounded-sm ring-1 ring-black/20`}
        title="France"
      >
        <div className="flex-1 bg-blue-700" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-red-600" />
      </div>
    );
  }

  // Spain - Rojigualda (red, yellow, red horizontal stripes)
  if (nation === "Spain") {
    return (
      <div
        className={`${sizeClass} ${className} flex flex-col overflow-hidden rounded-sm ring-1 ring-black/20`}
        title="Spain"
      >
        <div className="flex-1 bg-red-600" />
        <div className="flex-[2] bg-yellow-500" />
        <div className="flex-1 bg-red-600" />
      </div>
    );
  }

  // Netherlands - Prinsenvlag (orange, white, blue horizontal stripes)
  if (nation === "Netherlands") {
    return (
      <div
        className={`${sizeClass} ${className} flex flex-col overflow-hidden rounded-sm ring-1 ring-black/20`}
        title="Netherlands"
      >
        <div className="flex-1 bg-orange-500" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-blue-600" />
      </div>
    );
  }

  // Pirate - Jolly Roger style (black with skull suggestion)
  if (nation === "Pirate") {
    return (
      <div
        className={`${sizeClass} ${className} relative overflow-hidden rounded-sm ring-1 ring-black/20 bg-gray-900`}
        title="Pirate Haven"
      >
        {/* Simple skull shape using circles/divs */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[40%] h-[50%] bg-white/80 rounded-full relative">
            {/* Eyes */}
            <div className="absolute top-[25%] left-[15%] w-[25%] h-[25%] bg-gray-900 rounded-full" />
            <div className="absolute top-[25%] right-[15%] w-[25%] h-[25%] bg-gray-900 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div
      className={`${sizeClass} ${className} bg-gray-500 rounded-sm ring-1 ring-black/20`}
      title={nation}
    />
  );
}
