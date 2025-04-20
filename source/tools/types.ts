interface MessageData {
  primary: string;
  secondary?: string[] | undefined;
}

interface BaseMessage {
  id: string;
  retry?: number;
}

interface ToolInitMessage extends BaseMessage {
  event: "tool-init";
  data: string;
}

interface ToolErrorMessage extends BaseMessage {
  event: "tool-error";
  data: string;
}

interface ToolCompletionMessage extends BaseMessage {
  event: "tool-completion";
  data: string;
}

interface ToolUpdateMessage extends BaseMessage {
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
