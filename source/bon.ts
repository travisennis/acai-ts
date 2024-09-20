import { type CoreMessage, generateText, type LanguageModel } from "ai";

async function bestOfNSampling(
  model: LanguageModel,
  systemPrompt: string,
  initialQuery: string,
  n = 3,
): Promise<string> {
  const messages: CoreMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: initialQuery },
  ];

  const completions: string[] = [];

  let count = 0;
  while (count < n) {
    const { text } = await generateText({
      model,
      messages,
      maxTokens: 4096,
      temperature: 1,
    });

    completions.push(text);
    count++;
  }

  // Rate the completions
  const ratingMessages: CoreMessage[] = [
    {
      role: "system",
      content:
        "Rate the following responses on a scale from 0 to 10, where 0 is poor and 10 is excellent. Consider factors such as relevance, coherence, and helpfulness. Respond with only a number.",
    },
    ...messages,
  ];

  const ratings: number[] = [];
  for (const completion of completions) {
    ratingMessages.push({ role: "assistant", content: completion });
    ratingMessages.push({
      role: "system",
      content: "Rate the above response:",
    });

    const { text } = await generateText({
      model,
      messages: ratingMessages,
      maxTokens: 256,
      temperature: 0.1,
    });

    try {
      const rating = Number.parseFloat(text);
      ratings.push(rating);
    } catch (_error) {
      ratings.push(0);
    }

    ratingMessages.splice(-2);
  }

  const bestIndex = ratings.indexOf(Math.max(...ratings));
  return completions[bestIndex];
}

export default bestOfNSampling;
