# Enhanced Autocomplete Feature Plan

## Current State Analysis

### What We Have
- Basic fuzzy matching implementation
- Glob pattern support using internal glob utility
- Security restrictions (blocks ~ and / access)
- Backward compatibility maintained
- All existing tests passing

### What's Missing (Compared to Research)
1. **Sophisticated Scoring System** - No weighted scoring for better results
2. **Multi-Directory Support** - Only searches current directory, not all allowed directories
3. **Gitignore Support** - Doesn't respect .gitignore files
4. **Advanced Result Processing** - No scoring-based sorting or limiting
5. **Performance Optimization** - Could be more aggressive with caching
6. **Home Directory Expansion** - Blocks ~ instead of expanding it

## Comprehensive Implementation Plan

### Phase 1: Multi-Directory Support (High Priority)
**Goal**: Search across all allowed directories, not just the current one

**Implementation**:
- Modify `getFileSuggestions` to iterate through all `allowedDirs`
- Update `getGlobPatternSuggestions` to search all allowed directories
- Ensure path validation works correctly across multiple directories
- Maintain security restrictions for each directory

**Files to Modify**:
- `source/tui/autocomplete.ts` - Update directory handling logic

### Phase 2: Scoring System (High Priority)
**Goal**: Implement weighted scoring for better result ranking

**Implementation**:
```typescript
private scoreEntry(filePath: string, query: string, isDirectory: boolean): number {
  const fileName = basename(filePath);
  const lowerFileName = fileName.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  let score = 0;
  
  // Exact filename match (highest priority)
  if (lowerFileName === lowerQuery) score = 100;
  // Filename starts with query
  else if (lowerFileName.startsWith(lowerQuery)) score = 80;
  // Substring match in filename
  else if (lowerFileName.includes(lowerQuery)) score = 50;
  // Substring match in full path
  else if (filePath.toLowerCase().includes(lowerQuery)) score = 30;
  // Fuzzy match (our existing algorithm)
  else if (fuzzyMatch(lowerQuery, lowerFileName)) score = 20;
  
  // Directories get a bonus to appear first
  if (isDirectory && score > 0) score += 10;
  
  return score;
}
```

**Files to Modify**:
- `source/tui/autocomplete.ts` - Add scoring method and update sorting

### Phase 3: Enhanced Result Processing
**Goal**: Better result sorting, filtering, and limiting

**Implementation**:
- Add scoring to all matching entries
- Filter out zero-score results
- Sort by score (descending) then alphabetically
- Limit to top 20-50 results for performance
- Add result deduplication

**Files to Modify**:
- `source/tui/autocomplete.ts` - Update result processing in both suggestion methods

### Phase 4: Gitignore Support
**Goal**: Respect .gitignore files for cleaner results

**Implementation Options**:
1. **Enhance our glob utility** - Add gitignore support to `source/utils/glob.ts`
2. **Use existing ignore functionality** - Leverage the existing ignore system
3. **Hybrid approach** - Use glob for pattern matching, ignore for filtering

**Recommended**: Option 3 (hybrid approach)
- Keep using our glob utility for primary searching
- Add post-processing filter using existing ignore functionality
- Maintain performance while adding gitignore support

**Files to Modify**:
- `source/tui/autocomplete.ts` - Add gitignore filtering
- Possibly enhance `source/utils/glob.ts` if needed

### Phase 5: Performance Optimization
**Goal**: Faster, more responsive autocomplete

**Implementation**:
- **Aggressive Caching**: Cache results per directory and query
- **Debouncing**: Add debounce for rapid typing
- **Result Limiting**: Cap results at reasonable number (50-100)
- **Parallel Searching**: Search multiple directories in parallel
- **Timeout Handling**: Ensure no operation blocks UI

**Files to Modify**:
- `source/tui/autocomplete.ts` - Add caching and performance optimizations

### Phase 6: Home Directory Expansion
**Goal**: Support ~ expansion instead of blocking

**Implementation**:
- Add home directory expansion for allowed paths
- Maintain security by validating expanded paths
- Only allow ~ if it resolves to allowed directory

**Files to Modify**:
- `source/tui/autocomplete.ts` - Update home directory handling

### Phase 7: Enhanced Trigger Detection
**Goal**: Better pattern detection for autocomplete triggers

**Implementation**:
- Update regex pattern to: `/(?:^|[\s])(@[^\s]*)$/`
- Support more trigger contexts
- Better handle edge cases

**Files to Modify**:
- `source/tui/autocomplete.ts` - Update `extractPathPrefix` method

## Implementation Order Recommendation

1. **Phase 1: Multi-Directory Support** (Most critical - fixes current limitation)
2. **Phase 2: Scoring System** (Biggest UX improvement)
3. **Phase 3: Enhanced Result Processing** (Complements scoring)
4. **Phase 5: Performance Optimization** (Ensures good performance)
5. **Phase 4: Gitignore Support** (Nice-to-have enhancement)
6. **Phase 6: Home Directory Expansion** (Lower priority)
7. **Phase 7: Enhanced Trigger Detection** (Polish)

## Testing Strategy

### Unit Tests
- Add tests for multi-directory searching
- Add tests for scoring system
- Add tests for gitignore filtering
- Add performance benchmark tests

### Integration Tests
- Test with real project structures
- Test with various directory configurations
- Test edge cases and security scenarios

### Manual Testing
- Test in actual usage scenarios
- Verify performance is acceptable
- Ensure UX is improved

## Backward Compatibility

All changes must maintain:
- ✅ Existing API compatibility
- ✅ Current behavior for simple cases
- ✅ All existing tests passing
- ✅ Security restrictions intact

## Success Criteria

1. **Multi-directory search works** - Can find files in all allowed directories
2. **Better result ranking** - Most relevant files appear first
3. **Performance maintained** - No significant slowdown
4. **Security preserved** - All security checks still work
5. **All tests pass** - No regressions introduced

## Timeline Estimate

- **Phase 1**: 1-2 hours
- **Phase 2**: 2-3 hours  
- **Phase 3**: 1-2 hours
- **Phase 4**: 2-4 hours (depends on approach)
- **Phase 5**: 2-3 hours
- **Phases 6-7**: 1-2 hours each
- **Testing**: 3-5 hours

**Total**: ~12-20 hours for full implementation

## Next Steps

Start with Phase 1 (Multi-Directory Support) as it addresses the most critical limitation in our current implementation.