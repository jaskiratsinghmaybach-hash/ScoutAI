export function WaveMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5 40 Q 20 10, 35 40 T 65 40"
        stroke="url(#wave-gradient-1)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M45 45 Q 60 15, 75 45 T 105 45"
        stroke="url(#wave-gradient-2)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="wave-gradient-1" x1="5" y1="10" x2="65" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#3ECF6D" />
        </linearGradient>
        <linearGradient id="wave-gradient-2" x1="45" y1="15" x2="105" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3ECF6D" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
    </svg>
  );
}