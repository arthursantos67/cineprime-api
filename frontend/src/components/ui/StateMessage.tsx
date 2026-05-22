import type { ReactNode } from "react";

type StateTone = "empty" | "error" | "loading" | "success";

type StateMessageProps = {
  action?: ReactNode;
  children: ReactNode;
  title: string;
  tone?: StateTone;
};

export function StateMessage({
  action,
  children,
  title,
  tone = "empty",
}: StateMessageProps) {
  const role = tone === "error" ? "alert" : "status";

  return (
    <div className={`state-message state-message-${tone}`} role={role}>
      <strong>{title}</strong>
      <p>{children}</p>
      {action ? <div className="state-message__action">{action}</div> : null}
    </div>
  );
}
