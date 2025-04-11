export interface MessageData {
  primary: string;
  secondary?: string[] | undefined;
}

export type ToolEvent =
  | "tool-init"
  | "tool-update"
  | "tool-completion"
  | "tool-error";

interface BaseMessage {
  id: string;
  retry?: number;
}

export interface ToolInitMessage extends BaseMessage {
  event: "tool-init";
  data: string;
}

export interface ToolErrorMessage extends BaseMessage {
  event: "tool-error";
  data: string;
}

export interface ToolCompletionMessage extends BaseMessage {
  event: "tool-completion";
  data: string;
}

export interface ToolUpdateMessage extends BaseMessage {
  event: "tool-update";
  data: MessageData;
}

export type Message =
  | ToolInitMessage
  | ToolErrorMessage
  | ToolCompletionMessage
  | ToolUpdateMessage;

export type SendData = ({
  data,
  event,
  id,
  retry,
}: Message) => void | Promise<void>;
