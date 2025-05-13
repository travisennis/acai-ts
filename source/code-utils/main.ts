import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { CodeMap } from "./code-map.ts";
import { CodeMapper } from "./code-mapper.ts";
import { TreeSitterManager } from "./tree-sitter-manager.ts";
import { TreeSitterSymbolExtractor } from "./tree-sitter-symbol-extractor.ts";

// Example usage (optional, for testing)
async function main() {
  const treeSitterManager = new TreeSitterManager();
  const extractor = new TreeSitterSymbolExtractor(treeSitterManager);

  const files = process.argv.slice(2);
  const file = files[0];
  if (file) {
    console.info("tree-sitter-symbol-extractor.ts");
    const extension = extname(file);
    const sourceCode = readFileSync(files[0] ?? "", "utf8");
    const codeSymbols = await extractor.extractSymbols(extension, sourceCode);
    console.info("Symbols:", JSON.stringify(codeSymbols, null, 2));

    try {
      console.info("code-map.ts");
      const codeMap = CodeMap.fromFile(file);
      // The output format is XML by default as per the original script's behavior when calling format()
      console.info(codeMap.format("xml", file));
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
    }

    console.info("code-mapper.ts");
    const codeMapper = new CodeMapper(treeSitterManager);
    const results = codeMapper.processFile(file);
    console.dir(results, { depth: null });
  }
}

main().catch(console.error);
