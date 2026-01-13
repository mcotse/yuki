Use 'bd' for task tracking

## Issue-Driven Development

**ALL work must be tracked in beads.** When a user makes a request:

1. **Translate request into requirements** - Break down the request into concrete, actionable tasks
2. **Create beads issues** - Before starting any work, create issues for each task:
   ```bash
   bd create "Task title" --description="What needs to be done and why"
   ```
3. **Work on issues** - Reference the issue ID when working (e.g., "Working on yuki-abc")
4. **Close when done** - Mark issues complete when finished:
   ```bash
   bd close yuki-abc
   ```

### Example Workflow

User says: "Add a new medication to the schedule"

1. Create issue: `bd create "Add new medication X to schedule" --description="..."`
2. Work on the issue, referencing it in commits/updates
3. Close when complete: `bd close yuki-xxx`

### Issue Commands

```bash
bd create "title"              # Create new issue
bd create "title" --description="..."  # With description
bd list                        # List open issues
bd show yuki-abc               # Show issue details
bd close yuki-abc              # Close issue
bd reopen yuki-abc             # Reopen if needed
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
