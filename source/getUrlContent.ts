import { convertHtmlToMarkdown } from "dom-to-semantic-markdown";
import { JSDOM } from "jsdom";
import { PdfReader } from "pdfreader";
import { asyncExec } from "./command.js";

export async function getUrlContent(url: string) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type");
  let content: string;
  if (contentType?.includes("text/html")) {
    const result = await asyncExec(
      `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --headless --dump-dom ${url}`,
    );
    // const html = await response.text();
    const dom = new JSDOM(result);
    // const reader = new Readability(dom.window.document);
    // const article = reader.parse();
    // content = article?.textContent || result;
    const markdown = convertHtmlToMarkdown(result, {
      overrideDOMParser: new dom.window.DOMParser(),
    });

    content = markdown;
  } else if (contentType?.includes("application/pdf")) {
    const buffer = await response.arrayBuffer();
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    new PdfReader().parseBuffer(Buffer.from(buffer), (err, item) => {
      if (err) reject(err);
      else if (!item) reject(new Error("end of buffer"));
      else if (item.text) resolve(item.text);
    });
    content = await promise;
  } else {
    content = await response.text();
  }
  return content;
}
