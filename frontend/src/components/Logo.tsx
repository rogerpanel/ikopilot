/**
 * iKoPilot.com Logo component with fire dot on the 'i'.
 * "iKo" is colored (orange i, blue K, orange o), "P" is blue, "ilot" is white, ".com" is gray.
 */

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-6xl",
};

const fireSizes = {
  sm: { width: 8, height: 10, top: -3 },
  md: { width: 10, height: 12, top: -4 },
  lg: { width: 14, height: 16, top: -5 },
  xl: { width: 20, height: 24, top: -8 },
};

export default function Logo({ size = "md", className = "" }: LogoProps) {
  const fire = fireSizes[size];

  return (
    <span className={`font-bold ${sizeClasses[size]} ${className}`}>
      <span className="relative inline-block">
        <span className="text-brand-orange">i</span>
        {/* Fire dot */}
        <svg
          viewBox="0 0 24 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute"
          style={{
            width: fire.width,
            height: fire.height,
            top: fire.top,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <path
            d="M12 0C12 0 4 8 4 16C4 20.4 7.6 24 12 24C16.4 24 20 20.4 20 16C20 8 12 0 12 0Z"
            fill="#F97316"
          />
          <path
            d="M12 6C12 6 7 12 7 17C7 19.8 9.2 22 12 22C14.8 22 17 19.8 17 17C17 12 12 6 12 6Z"
            fill="#FBBF24"
          />
          <path
            d="M12 12C12 12 9.5 15 9.5 18C9.5 19.4 10.6 20.5 12 20.5C13.4 20.5 14.5 19.4 14.5 18C14.5 15 12 12 12 12Z"
            fill="#FEF3C7"
          />
        </svg>
      </span>
      <span className="text-brand-blue">K</span>
      <span className="text-brand-orange">o</span>
      <span className="text-brand-blue">P</span>
      <span className={size === "xl" ? "text-gray-600" : "text-white"}>ilot</span>
      <span className="text-gray-500 font-normal" style={{ fontSize: "0.6em" }}>.com</span>
    </span>
  );
}
