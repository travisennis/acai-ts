export interface Message {
  data: string | Promise<string>;
  event?: "tool-init" | "tool-update" | "tool-completion" | "tool-error";
  id?: string;
  retry?: number;
}
// Define message types
export type SSEMessage =
  | {
      type: "progress" | "error" | "complete";
      data: any;
      timestamp: number;
    }
  | string;

export type SendData = ({
  data,
  event,
  id,
  retry,
}: Message) => void | Promise<void>;
