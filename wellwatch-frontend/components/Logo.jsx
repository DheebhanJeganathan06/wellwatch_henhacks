export default function Logo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="48" fill="#F0F3F8" stroke="#DDE3EE" strokeWidth="2" />
      <path d="M 32 30 Q 50 12 68 30" fill="none" stroke="#1A9E6B" strokeWidth="4" strokeLinecap="round" />
      <path d="M 40 38 Q 50 28 60 38" fill="none" stroke="#1A9E6B" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="45" r="3" fill="#1A9E6B" />
      <path d="M 50 48 L 35 85 L 65 85 Z" fill="none" stroke="#1C2B45" strokeWidth="5" strokeLinejoin="round" />
      <line x1="44" y1="60" x2="56" y2="60" stroke="#1C2B45" strokeWidth="4" />
      <line x1="40" y1="72" x2="60" y2="72" stroke="#1C2B45" strokeWidth="4" />
      <line x1="25" y1="85" x2="75" y2="85" stroke="#1C2B45" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}


