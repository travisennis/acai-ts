import { type TiktokenModel, encoding_for_model } from "tiktoken";

export function countTokens(input: string) {
  const tiktokenEncoding = encoding_for_model("chatgpt-4o-latest"); // Or appropriate model
  const tokenCount = tiktokenEncoding.encode(input).length;
  tiktokenEncoding.free(); // Free up memory
  return tokenCount;
}

export class TokenCounter {
  private tiktokenEncoding: ReturnType<typeof encoding_for_model>;

  constructor(model: TiktokenModel = "chatgpt-4o-latest") {
    this.tiktokenEncoding = encoding_for_model(model);
  }

  count(input: string): number {
    return this.tiktokenEncoding.encode(input).length;
  }

  free() {
    this.tiktokenEncoding.free();
  }
}
