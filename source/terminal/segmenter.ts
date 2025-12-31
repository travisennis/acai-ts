/**
 * Shared Intl.Segmenter singleton for grapheme segmentation.
 * Used for proper Unicode iteration (handles emojis, combining characters, etc.)
 */

let segmenter: Intl.Segmenter | null = null;

export function getSegmenter(): Intl.Segmenter {
  if (!segmenter) {
    segmenter = new Intl.Segmenter();
  }
  return segmenter;
}
