# Claude Code Session System Flow

## Overview

Claude Code uses JSONL (newline-delimited JSON) for append-only transcript persistence. Sessions support complex chain topologies, context compression, and sidechain transcripts for subagents.

## Session File Structure

```
~/.claude/projects/<sanitized-cwd>/
├── <sessionId>.jsonl           # Main transcript
└── subagents/
    └── <subdir>/               # Optional grouping (workflows/<runId>)
        └── agent-<agentId>.jsonl  # Sidechain transcript
```

## Entry Types

```
┌─────────────────────────────────────────────────────────────────┐
│                        Transcript Messages                         │
├──────────────┬──────────────────────────────────────────────────┤
│ user         │ User input, slash commands                       │
│ assistant    │ Model responses, tool_use blocks                │
│ system       │ compact_boundary, turn_duration, errors           │
│ attachment    │ Structured output, hooks                        │
└──────────────┴──────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          Metadata                                 │
├──────────────┬──────────────────────────────────────────────────┤
│ custom-title │ User-set session name                           │
│ ai-title     │ AI-generated title                              │
│ tag          │ Session tagging                                 │
│ agent-name   │ Active agent name                              │
│ agent-color  │ Agent color                                    │
│ mode         │ coordinator/normal mode                         │
│ pr-link      │ GitHub PR association                          │
│ worktree-state│ Git worktree session state                    │
└──────────────┴──────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        State Snapshots                            │
├──────────────────────┬──────────────────────────────────────────┤
│ file-history-snapshot│ File modification state                  │
│ attribution-snapshot│ Commit attribution state                  │
│ content-replacement │ Tool result cache entries                │
└──────────────────────┴──────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Context Collapse                              │
├──────────────────────┬──────────────────────────────────────────┤
│ marble-origami-commit│ Collapsed turn summary                    │
│ marble-origami-snapshot│ Staged queue state                    │
└──────────────────────┴──────────────────────────────────────────┘
```

## Chain Topology

### Basic Structure
```
leaf (latest message)
  └─ parentUuid
      └─ parentUuid
          └─ ...
              └─ root (null parentUuid)
```

### Parallel Tool Results (DAG)
```
Assistant A ──┬── ToolUse A1 ── ToolResult A1
             └── ToolUse A2 ── ToolResult A2
```

### Recovery Algorithm
```typescript
function buildConversationChain(messages, leafMessage) {
  // Walk parentUuid from leaf to root
  // O(n) single-pass, handles cycles
}
```

### Parallel TR Recovery
- Streaming emits one AssistantMessage per content_block_stop
- recoverOrphanedParallelToolResults() handles orphaned siblings
- Groups by message.id, preserves write order

## Context Collapse (Marble Origami)

### Boundary Structure
```typescript
{
  type: 'system',
  subtype: 'compact_boundary',
  compactMetadata: {
    preservedSegment?: {
      headUuid: string      // First preserved message
      tailUuid: string      // Last preserved message
      anchorUuid: string   // Boundary itself
    },
    summary?: string
  }
}
```

### Operations
1. **Truncate Prefix**: Delete messages before boundary
2. **Preserve Segment**: Keep middle section intact
3. **Relink**: Patch parentUuid chains across boundary

### applyPreservedSegmentRelinks()
```
Before:
  ... → preserved[last] → boundary → deleted → ...

After (relink):
  ... → preserved[last] → boundary → tailUuid → deleted → ...

After (splice):
  anchor(other child) → tailUuid → deleted → ...
```

## Write Path

```typescript
class Project {
  private writeQueues = new Map<string, Array<{entry, resolve}>>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  
  // 1. Buffer until materialize
  async appendEntry(entry) {
    if (sessionFile === null) {
      pendingEntries.push(entry)
      return
    }
    enqueueWrite(sessionFile, entry)
  }
  
  // 2. Batch writes (100ms interval)
  private scheduleDrain() {
    this.flushTimer = setTimeout(() => {
      this.drainWriteQueue()  // Single fsync per batch
    }, FLUSH_INTERVAL_MS)
  }
  
  // 3. Chunk splitting (>100MB)
  private async drainWriteQueue() {
    for (const [filePath, queue] of writeQueues) {
      let content = ''
      for (const {entry} of queue) {
        const line = jsonStringify(entry) + '\n'
        if (content.length + line.length >= MAX_CHUNK_BYTES) {
          await appendToFile(filePath, content)
          content = ''
        }
        content += line
      }
      if (content) await appendToFile(filePath, content)
    }
  }
}
```

## Read Path

### Lite Metadata (64KB head+tail)
```
readSessionLite() → head + tail only
     ↓
extractFirstPrompt()     (head)
extractLastJsonStringField() (tail: title, tag, mode)
```

### Full Transcript Load
```
loadTranscriptFile()
     ↓
┌─ Large file (>5MB)?
│   └─ Yes: readTranscriptForLoad() [stream + attr-skip]
│   └─ No: readFile() [full]
     ↓
walkChainBeforeParse()  [skip dead branches]
     ↓
parseJSONL() [entry by entry]
     ↓
applyPreservedSegmentRelinks()
applySnipRemovals()
     ↓
buildConversationChain() [leaf → root]
     ↓
Result: TranscriptMessage[]
```

## Dead Branch Optimization

### Problem
```
Main branch:    A → B → C → D → E (leaf)
Fork branch:    A → B → F → G (abandoned)
```

### Solution: Byte-level Pre-filter
```typescript
// walkChainBeforeParse()
// 1. Index all lines: [lineStart, lineEnd, parentStart]
// 2. Build uuid → slot map
// 3. Walk from leaf backward
// 4. Collect kept line positions
// 5. Copy only live content

// Results:
// 41MB, 99% dead: 56ms → 3.9ms (-93%)
// 151MB, 92% dead: 47ms → 9.4ms (-80%)
```

## Sidechain Transcript

### Structure
```
Main session: ~/.claude/projects/.../<sessionId>.jsonl
Subagent:     ~/.claude/projects/.../<sessionId>/subagents/<subdir>/agent-<agentId>.jsonl
```

### Recording
```typescript
async recordSidechainTranscript(messages, agentId) {
  await getProject().insertMessageChain(
    messages,
    true,  // isSidechain
    agentId
  )
}
```

### Resume
```typescript
async getAgentTranscript(agentId) {
  const { messages } = await loadTranscriptFile(agentFile)
  // Filter by agentId and isSidechain
  // Build conversation chain
}
```

## Session Restore (Resume/Continue)

### Process Flow
```typescript
processResumedConversation(result, opts, context) {
  // 1. Match coordinator/normal mode
  // 2. Switch session ID (unless --fork-session)
  // 3. Restore metadata (title, tag, agent)
  // 4. Restore worktree state
  // 5. Adopt session file
  // 6. Restore file history / attribution
  // 7. Restore context collapse commits
  // 8. Restore agent setting
}
```

### Worktree Restore
```typescript
restoreWorktreeForResume(worktreeSession) {
  if (worktreeSession) {
    // Cd into the worktree
    process.chdir(worktreeSession.worktreePath)
    setCwd(worktreeSession.worktreePath)
    restoreWorktreeSession(worktreeSession)
  } else {
    // null = session exited worktree
  }
}
```

## Metadata Re-append

### Problem
Compaction pushes metadata out of 64KB tail window.

### Solution
```typescript
reAppendSessionMetadata() {
  // 1. Read tail to absorb external SDK writes
  const tail = readFileTailSync(sessionFile)
  
  // 2. Update cache with fresher values
  if (tailTitle !== undefined) {
    currentSessionTitle = tailTitle || undefined
  }
  
  // 3. Re-append all metadata
  appendEntryToFile({ type: 'custom-title', ... })
  appendEntryToFile({ type: 'tag', ... })
  // ...
}
```

## Progress Bridge (Legacy)

### Problem
Old transcripts have progress entries in the parent chain.

### Solution
```typescript
// During load:
const progressBridge = new Map<UUID, UUID | null>()

for (const entry of entries) {
  if (isLegacyProgressEntry(entry)) {
    // Chain-resolve through consecutive progress
    progressBridge.set(entry.uuid, 
      entry.parentUuid && progressBridge.has(entry.parentUuid)
        ? progressBridge.get(entry.parentUuid)
        : entry.parentUuid
    )
  }
  
  if (entry.parentUuid && progressBridge.has(entry.parentUuid)) {
    entry.parentUuid = progressBridge.get(entry.parentUuid) ?? null
  }
}
```

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| sessionStorage.ts | 4300 | Core JSONL persistence, Project singleton |
| sessionRestore.ts | 551 | Resume/continue processing |
| sessionStoragePortable.ts | 793 | CLI+VSCode shared utilities |

## Performance Metrics

| Optimization | Improvement |
|--------------|-------------|
| walkChainBeforeParse | -93% parse time for 99% dead |
| readTranscriptForLoad | -80% peak memory for 84% dead attr |
| Batch writes (100ms) | Reduced disk I/O |
| Chunk splitting (100MB) | Prevent OOM on huge entries |

## Security Considerations

1. **File permissions**: 0o600 (owner read/write only)
2. **Path sanitization**: Alphanumeric + hyphens only
3. **Fork isolation**: Sidechain transcript separate
4. **Tombstoning**: Remove orphaned messages by UUID
