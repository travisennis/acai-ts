import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { initializeLsp } from "./lsp/index.ts";
import { ModelManager } from "./models/manager.ts";

function main() {
  const modelManager = new ModelManager({
    stateDir: config.app.ensurePath("audit"),
  });
  modelManager.setModel("lsp-code-action", "deepseek:deepseek-reasoner");

  logger.info("Starting acai LSP server...");
  initializeLsp({ modelManager });
}

main();
