import { encoding_for_model } from "tiktoken";

export function countTokens(input: string) {
  const tiktokenEncoding = encoding_for_model("chatgpt-4o-latest"); // Or appropriate model
  const tokenCount = tiktokenEncoding.encode(input).length;
  tiktokenEncoding.free(); // Free up memory
  return tokenCount;
}
