import { encoding_for_model, type TiktokenModel } from "tiktoken";

export class TokenCounter {
  private tiktokenEncoding: ReturnType<typeof encoding_for_model>;

  constructor(model: TiktokenModel = "gpt-5-chat-latest") {
    this.tiktokenEncoding = encoding_for_model(model);
  }

  count(input: string): number {
    return this.tiktokenEncoding.encode(input).length;
  }

  free() {
    this.tiktokenEncoding.free();
  }
}
