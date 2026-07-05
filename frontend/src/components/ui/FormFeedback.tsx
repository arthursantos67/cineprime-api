export type FeedbackState =
  | { kind: "error"; message: string }
  | { kind: "success"; message: string }
  | null;

export function FormFeedback({ feedback }: { feedback: FeedbackState }) {
  if (!feedback) {
    return null;
  }

  return (
    <p
      className={
        feedback.kind === "error"
          ? "m-0 text-sm font-bold text-error"
          : "m-0 text-sm font-bold text-success"
      }
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  );
}
