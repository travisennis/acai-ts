import { getAppConfigDir } from "./config.ts";
import { logger } from "./logger.ts";
import { initializeLsp } from "./lsp/index.ts";
import { ModelManager } from "./models/manager.ts";

function main() {
  const stateDir = getAppConfigDir();

  const modelManager = new ModelManager({ stateDir });
  modelManager.setModel("lsp-code-action", "anthropic:sonnet");

  logger.info("Starting acai LSP server...");
  initializeLsp({ modelManager });
}

main();
