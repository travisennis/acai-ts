# Implementation Progress: Custom Environment Variables

## Phase 1: Config Schema and Variable Expansion
- [ ] Create `source/utils/env-expand.ts`
- [ ] Update `source/config.ts` schema + merge logic
- [ ] Automated verification

## Phase 2: Wire Config Env Vars into Bash Tool
- [ ] Update `createBashTool` in `source/tools/bash.ts`
- [ ] Update call site in `source/tools/index.ts`
- [ ] Automated verification

## Phase 3: Tests and Documentation
- [ ] Unit tests for env expansion
- [ ] Config tests for env merging
- [ ] Documentation update
- [ ] ARCHITECTURE.md update
- [ ] Full check
