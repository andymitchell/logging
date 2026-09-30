### Better generics understanding 

`T extends LogEntry = LogEntry` smells funny to me. It's a pattern used widely, e.g. `LogReadResult`. I'd want to investigate when it was introduced to things like `MemoryLogStorage` by looking at the git history, and what purpose it serves. 

My gut says `LogEntry` is just one shape, and what is typed is the `C` for `context` (what was passed in - totally the consumer's call). And even then, I'd argue `C` could be different for each LogEntry even within a single store, so should perhaps be typed guarded per object. I think it was a mistake to do it that way. 

the goal is flexibility, like you can do this in chrome: `console.log("a", {a: 1})` and `console.log({b: "huh})`, and it's fine. 


### Things to pick from `worktree-format-retention` (if still relevant)

Use an Opus sub agent to research these in the branch. Do not do it yourself. 

- ChannelsLogStorage.get now removes duplicate copies after filtering, which fixed a bug found in review.
- Rule added to decisions `dec-channels-isolate-channels`
