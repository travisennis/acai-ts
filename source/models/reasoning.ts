const THINKING_TIERS = [
  {
    pattern:
      /\b(ultrathink|think super hard|think really hard|think intensely)\b/i,
    budget: 31999,
    effort: "high",
  },
  {
    pattern: /\b(megathink|think (very )?hard|think (a lot|more|about it))\b/i,
    budget: 10000,
    effort: "medium",
  },
  {
    pattern: /\bthink\b/i, // Catch-all for standalone "think"
    budget: 4000,
    effort: "low",
  },
];

export function calculateThinkingLevel(userInput: string) {
  let tokenBudget = 2000; // Default
  let effort = "low";
  for (const tier of THINKING_TIERS) {
    if (tier.pattern.test(userInput)) {
      tokenBudget = tier.budget;
      effort = tier.effort;
      break; // Use highest priority match
    }
  }
  return { tokenBudget, effort };
}
