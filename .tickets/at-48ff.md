---
id: at-48ff
status: open
deps: []
links: []
created: 2026-01-24T05:12:29Z
type: feature
priority: 1
assignee: Travis Ennis
tags: [hooks, agent, extensibility, feature]
---
# Implement hooks system for agent events

Add hooks capability for observing, controlling, and extending the agent loop. Hooks are spawned processes that communicate over stdio using JSON (similar to dynamic tools). They run before or after defined stages and can observe, block, or modify behavior. First implementation will support agent events.

