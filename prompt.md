I'm trying to get what is displayed in the footer component to be correct and it seems there is some confusion as to what should be displayed. We are concenred with the last three lines:

Here is what the footer looks like:

```
~/Projects/acai-ts                                                           opencode:minimax-m2-1 [minimax-m2.1-free]
master ↑4 +7 ~2 ?2 [+9 -18]
↑ 10.3M (0) ↓ 53.4K - $3.17
Steps: 13 - Tool calls: 15 - 2m 39s - ↑ 378K (290K) ↓ 7.1K - $0.12
─────────────────────────────────────────────────────────────────────────────────────────────────── 43.6K/205K [21.3%]  
```

and here is it annotated

```
~/Projects/acai-ts                                                           opencode:minimax-m2-1 [minimax-m2.1-free]
master ↑4 +7 ~2 ?2 [+9 -18]
↑ 10.3M (0) ↓ 53.4K - $3.17 // the total usage for the entire session from the token tracker. total input tokens (total cached input tokens), total ouput tokens, and total cost
Steps: 13 - Tool calls: 15 - 2m 39s - ↑ 378K (290K) ↓ 7.1K - $0.12 // this tokens used to process the last user prompt, so what happens from agent-start to agent-stop. this comes from the agent state
─────────────────────────────────────────────────────────────────────────────────────────────────── 43.6K/205K [21.3%] // this shows the current context window usage. it is basically the total input and output tokens of the usage of the last step
```

Let's correct this, because the current state of this is completely wrong.

## References

- Original plan: ./specs/session-token-usage.md
- Summary of work done so far: .acai/handoffs/2026-01-19-summarize-what-we-ha.md
