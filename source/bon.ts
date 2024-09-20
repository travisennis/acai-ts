import { Logger } from 'winston';  // Assuming we're using winston for logging
import { ChatCompletionCreateParams, ChatCompletionMessageParam, OpenAI } from 'openai';

const logger = Logger.getInstance(__filename);

async function bestOfNSampling(
  systemPrompt: string,
  initialQuery: string,
  client: OpenAI,
  model: string,
  n: number = 3
): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: initialQuery }
  ];

  let completions: string[] = [];

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: 4096,
    n,
    temperature: 1
  });

  completions = response.choices.map(choice => choice.message.content || '');

  // Rate the completions
  const ratingMessages: ChatCompletionMessageParam[] = [...messages];
  ratingMessages.push({
    role: 'system',
    content: 'Rate the following responses on a scale from 0 to 10, where 0 is poor and 10 is excellent. Consider factors such as relevance, coherence, and helpfulness. Respond with only a number.'
  });

  const ratings: number[] = [];
  for (const completion of completions) {
    ratingMessages.push({ role: 'assistant', content: completion });
    ratingMessages.push({ role: 'system', content: 'Rate the above response:' });

    const ratingResponse = await client.chat.completions.create({
      model,
      messages: ratingMessages,
      max_tokens: 256,
      n: 1,
      temperature: 0.1
    });

    try {
      const rating = parseFloat(ratingResponse.choices[0].message.content?.trim() || '0');
      ratings.push(rating);
    } catch (error) {
      ratings.push(0);
    }

    ratingMessages.splice(-2);
  }

  const bestIndex = ratings.indexOf(Math.max(...ratings));
  return completions[bestIndex];
}

export default bestOfNSampling;