export type ChatAction = {
  action: string;
  target: string;
  session_id?: string | null;
};

export type ChatMessageResponse = {
  conversation_id: string;
  reply: string;
  action?: ChatAction | null;
};

export type ChatRole = "assistant" | "user";

export type ChatMessage = {
  action?: ChatAction | null;
  content: string;
  id: string;
  isError?: boolean;
  role: ChatRole;
};
