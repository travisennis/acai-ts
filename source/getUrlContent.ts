import { convertHtmlToMarkdown } from "dom-to-semantic-markdown";
import { JSDOM } from "jsdom";
import { asyncExec, writeln } from "./command.js";
import { parsePdf } from "./pdfreader.js";

export async function getUrlContent(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const contentType = response.headers.get("content-type");

  if (contentType?.includes("text/html")) {
    writeln("Loading html...");
    const result = await asyncExec(
      `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --headless --dump-dom ${url}`,
    );
    const dom = new JSDOM(result);
    const markdown = convertHtmlToMarkdown(result, {
      overrideDOMParser: new dom.window.DOMParser(),
    });

    return markdown;
  }

  if (contentType?.includes("application/pdf")) {
    writeln("Loading pdf...");
    const result = await parsePdf(await response.arrayBuffer());

    if (result.error) {
      console.error("Error:", result.error);
    } else {
      writeln(`Successfully parsed ${result.pages} pages`);
    }
    return result.text;
  }

  writeln("Loading text...");
  return response.text();
}
