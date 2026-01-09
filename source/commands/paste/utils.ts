export function extractBase64Content(dataUrl: string): string {
  return dataUrl.replace(/^data:.*?;base64,/, "");
}

export function isValidBase64(str: string): boolean {
  try {
    const base64Content = extractBase64Content(str);
    const decoded = Buffer.from(base64Content, "base64");
    const reEncoded = decoded.toString("base64");
    const normalizedOriginal = base64Content.replace(/=/g, "");
    const normalizedReEncoded = reEncoded.replace(/=/g, "");
    return normalizedOriginal === normalizedReEncoded;
  } catch {
    return false;
  }
}

export function detectImageFormatFromBase64(base64Content: string): string {
  try {
    const buffer = Buffer.from(base64Content, "base64");

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return "image/jpeg";
    }

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return "image/png";
    }

    if (
      buffer.length >= 6 &&
      ((buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38 &&
        buffer[4] === 0x37 &&
        buffer[5] === 0x61) ||
        (buffer[0] === 0x47 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x38 &&
          buffer[4] === 0x39 &&
          buffer[5] === 0x61))
    ) {
      return "image/gif";
    }

    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "image/webp";
    }

    if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return "image/bmp";
    }

    if (
      buffer.length >= 4 &&
      ((buffer[0] === 0x49 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x2a &&
        buffer[3] === 0x00) ||
        (buffer[0] === 0x4d &&
          buffer[1] === 0x4d &&
          buffer[2] === 0x00 &&
          buffer[3] === 0x2a))
    ) {
      return "image/tiff";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

export function extractMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? "image/png";
}
