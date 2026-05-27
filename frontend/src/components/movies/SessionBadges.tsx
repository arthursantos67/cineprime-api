import type { SessionBadge } from "./session-selection";

type SessionBadgeListProps = {
  badges: SessionBadge[];
  className?: string;
};

export function SessionBadgeList({
  badges,
  className,
}: SessionBadgeListProps) {
  if (badges.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label="Formatos da sessão"
      className={["session-badges", className].filter(Boolean).join(" ")}
    >
      {badges.map((badge) => (
        <li className="session-badge" key={badge.label}>
          {badge.label}
        </li>
      ))}
    </ul>
  );
}
