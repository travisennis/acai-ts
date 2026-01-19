import { ModelManager } from "../../source/models/manager.ts";
import type { ModelName } from "../../source/models/providers.ts";

export async function createModelManagerForTest(
  modelId: ModelName = "openai:gpt-5.2",
): Promise<ModelManager> {
  const modelManager = new ModelManager({ stateDir: "/tmp/acai-test" });
  modelManager.setModel("repl", modelId);
  return modelManager;
}
