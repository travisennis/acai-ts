import { text } from "node:stream/consumers";

export const STDIN_SOFT_LIMIT = 50 * 1024; // 50KB
export const STDIN_HARD_LIMIT = 200 * 1024; // 200KB

export interface StdinResult {
  content: string | null;
  sizeBytes: number;
  wasPiped: boolean;
}

export async function readStdinWithLimits(): Promise<StdinResult> {
  if (process.stdin.isTTY) {
    return { content: null, sizeBytes: 0, wasPiped: false };
  }

  try {
    const content = await text(process.stdin);
    const sizeBytes = Buffer.byteLength(content, "utf8");

    if (sizeBytes > STDIN_HARD_LIMIT) {
      const sizeKb = Math.round(sizeBytes / 1024);
      console.error(
        `Error: Input exceeds ${STDIN_HARD_LIMIT / 1024}KB size limit (${sizeKb}KB provided).`,
      );
      process.exit(1);
    }

    if (sizeBytes > STDIN_SOFT_LIMIT) {
      const sizeKb = Math.round(sizeBytes / 1024);
      console.error(
        `Warning: Input is ${sizeKb}KB. Large inputs may increase latency and costs.`,
      );
    }

    return { content, sizeBytes, wasPiped: true };
  } catch (error) {
    console.error(`Error reading stdin: ${(error as Error).message}`);
    return { content: null, sizeBytes: 0, wasPiped: true };
  }
}
