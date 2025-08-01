import type { LanguageModelV2Middleware } from "@ai-sdk/provider";
import pThrottle from "p-throttle";

export const createRateLimitMiddleware = ({
  requestsPerMinute,
}: {
  requestsPerMinute: number;
}): LanguageModelV2Middleware => {
  const throttle = pThrottle({
    limit: requestsPerMinute,
    interval: 60 * 1000, // 1 minute
  });

  return {
    wrapGenerate: ({ doGenerate }) => {
      const throttledGenerate = throttle(doGenerate);
      return Promise.resolve(throttledGenerate());
    },
    wrapStream: ({ doStream }) => {
      const throttledStream = throttle(doStream);
      return throttledStream();
    },
  };
};
