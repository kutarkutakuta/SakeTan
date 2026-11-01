export function PlaceCardArt({ type }: { type: "brewery" | "shop" }) {
  return (
    <svg
      className="brand-card-art place-card-art"
      viewBox="0 0 48 56"
      width="40"
      height="48"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="24" cy="28" rx="23" ry="26" fill="#f5efe3" />
      <ellipse cx="24" cy="49" rx="19" ry="2.5" fill="#e7dccb" />
      <g
        stroke="#9b8068"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {type === "brewery" ? (
          <>
            <path d="M9 25h30v23H9Z" fill="#fffdf7" />
            <path d="M5 26 24 10l19 16Z" fill="#b6aa9b" />
            <path d="m9 26 15-12 15 12" fill="none" stroke="#fff8ed" />
            <path d="M6 28h36" />
            <path d="M22 20h4v4h-4Z" fill="#efe3d0" />
            <path d="M23 33h11v15H23Z" fill="#e4d3b8" />
            <path d="M26 34v13m4-13v13" fill="none" />
            <path d="M14 29v5" fill="none" />
            <circle cx="14" cy="37" r="3.5" fill="#9b9d78" stroke="#848562" />
            <path d="m12 37 2-1 2 1" fill="none" stroke="#edefdf" />
            <path d="M10 45h9" fill="none" stroke="#d8cbb9" />
          </>
        ) : (
          <>
            <path d="M8 23h32v25H8Z" fill="#fffdf7" />
            <rect x="13" y="13" width="22" height="8" rx="1.5" fill="#bc7966" />
            <path d="M17 17h14" stroke="#fff8ed" />
            <path d="M8 23h32l4 7H4Z" fill="#fffdf7" />
            <path
              d="M9 23h5l-1 7H5Zm11 0h5v7h-6Zm11 0h5l3 7h-7Z"
              fill="#bc7966"
              stroke="none"
            />
            <path d="M4 30h40" />
            <path d="M25 34h10v14H25Z" fill="#e4d3b8" />
            <path d="M12 34h9v9h-9Z" fill="#efe3d0" />
            <path d="M16.5 34v9m-4.5-4.5h9" fill="none" />
            <path d="M28 40v3" stroke="#bc7966" />
          </>
        )}
      </g>
    </svg>
  );
}
