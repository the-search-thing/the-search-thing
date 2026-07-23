## IMMEDIATE TODOs TO FIGURE OUT

- [ ] add cache to search hits
- [x] profile contentSearch dual-grep vs root-only fff grep (`src/search/grep-profile.test.ts` → `grep-profile.md`)
- [ ] better way for `DATA_DIR` instead of `cwd/.data/extracted` or env var
- [ ] file watcher event emitter being worked on by [neogoose](https://github.com/dmtrKovalenko). Event emitter will be used to do the following:
  - [ ] auto-index on startup (or other trigger) so new/changed source files get LiteParse extracts without a manual `POST /index/run`

## TODOs TO FIGURE OUT EVENTUALLY

- [ ] write / integrate an application finder
- [ ] embed the existing greppable text
- [ ] one search surface to combine lexical first then optional semantic search
  - users shouldn't think about grep vs semantic
- [ ] thin client(search box -> results with path + snippet + open-in-OS)
