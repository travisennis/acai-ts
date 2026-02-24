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

interface MagicSignature {
  bytes: Array<[number, number]>;
  mimeType: string;
}

const IMAGE_SIGNATURES: MagicSignature[] = [
  {
    bytes: [
      [0, 0xff],
      [1, 0xd8],
      [2, 0xff],
    ],
    mimeType: "image/jpeg",
  },
  {
    bytes: [
      [0, 0x89],
      [1, 0x50],
      [2, 0x4e],
      [3, 0x47],
      [4, 0x0d],
      [5, 0x0a],
      [6, 0x1a],
      [7, 0x0a],
    ],
    mimeType: "image/png",
  },
  {
    bytes: [
      [0, 0x47],
      [1, 0x49],
      [2, 0x46],
      [3, 0x38],
      [4, 0x37],
      [5, 0x61],
    ],
    mimeType: "image/gif",
  },
  {
    bytes: [
      [0, 0x47],
      [1, 0x49],
      [2, 0x46],
      [3, 0x38],
      [4, 0x39],
      [5, 0x61],
    ],
    mimeType: "image/gif",
  },
  {
    bytes: [
      [0, 0x52],
      [1, 0x49],
      [2, 0x46],
      [3, 0x46],
      [8, 0x57],
      [9, 0x45],
      [10, 0x42],
      [11, 0x50],
    ],
    mimeType: "image/webp",
  },
  {
    bytes: [
      [0, 0x42],
      [1, 0x4d],
    ],
    mimeType: "image/bmp",
  },
  {
    bytes: [
      [0, 0x49],
      [1, 0x49],
      [2, 0x2a],
      [3, 0x00],
    ],
    mimeType: "image/tiff",
  },
  {
    bytes: [
      [0, 0x4d],
      [1, 0x4d],
      [2, 0x00],
      [3, 0x2a],
    ],
    mimeType: "image/tiff",
  },
];

function matchesSignature(buffer: Buffer, signature: MagicSignature): boolean {
  return signature.bytes.every(
    ([offset, value]) => offset < buffer.length && buffer[offset] === value,
  );
}

export function detectImageFormatFromBase64(base64Content: string): string {
  try {
    const buffer = Buffer.from(base64Content, "base64");
    const match = IMAGE_SIGNATURES.find((sig) => matchesSignature(buffer, sig));
    return match?.mimeType ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function extractMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? "image/png";
}
