import Link from "next/link";

function LogoMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Self Management"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="sm-logo-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818cf8" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#sm-logo-gradient)" />
      <path
        d="M9.5 16.5L14 21L22.5 11.5"
        stroke="white"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  size = 24,
  iconOnly = false,
  href = "/",
  className = "",
}: {
  size?: number;
  iconOnly?: boolean;
  href?: string | null;
  className?: string;
}) {
  const content = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {!iconOnly && (
        <span className="truncate text-sm font-semibold text-neutral-100">
          Self Management
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      aria-label="Self Management - Trang chủ"
    >
      {content}
    </Link>
  );
}
