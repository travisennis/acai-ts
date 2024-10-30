import * as pdfjs from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

interface PdfParseResult {
  text: string;
  pages: number;
  error?: string;
}

export async function parsePdf(buffer: ArrayBuffer): Promise<PdfParseResult> {
  try {
    // Load the PDF document
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
    });

    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    let fullText = "";

    // Process each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Extract and combine text items, preserving whitespace
      const pageText = textContent.items
        .map((item) => (item as TextItem).str)
        .join(" ")
        .trim();

      fullText += `${pageText}\n\n`;
    }

    return {
      text: fullText.trim(),
      pages: numPages,
    };
  } catch (error) {
    return {
      text: "",
      pages: 0,
      error: `Error parsing PDF: ${(error as Error).message}`,
    };
  }
}
