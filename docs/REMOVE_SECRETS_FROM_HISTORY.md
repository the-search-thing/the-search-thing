# Remove exposed secrets from git history

## Option 1: Built-in Git only (no extra tools)

Uses only `git filter-branch` (no git-filter-repo, no BFG, no Java).

1. **Revoke/rotate the exposed keys** in Gemini and the other service.

2. **Create a small script** that rewrites `.env.example` in each commit. From repo root, create `fix-env.sh` (or `fix-env.ps1` on Windows — see below) **outside** the repo or in a temp dir, then run it via git.

   **Bash (Git Bash or WSL), save as `fix-env.sh`** — replace `SECRET1` and `SECRET2` with the actual exposed strings:
   ```bash
   #!/bin/bash
   if [ -f .env.example ]; then
     sed -i 's/SECRET1/REDACTED/g' .env.example
     sed -i 's/SECRET2/REDACTED/g' .env.example
   fi
   ```

3. **Run filter-branch** (from repo root). This rewrites every commit that touched `.env.example`:
   ```bash
   git filter-branch --tree-filter 'bash /path/to/fix-env.sh' -- --all
   ```
   Use the real path to `fix-env.sh`. On Windows with PowerShell and no bash, use a PowerShell script (see Option 1b below).

4. **Prune and cleanup:**
   ```bash
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   ```

5. **Force-push:**
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

6. **Delete the script** so the secrets aren’t left in it.

**Option 1b — PowerShell only (Windows):**  
Create `fix-env.ps1` that does the same replacements (e.g. `(Get-Content .env.example) -replace 'SECRET1','REDACTED' -replace 'SECRET2','REDACTED' | Set-Content .env.example`), then run:
```powershell
git filter-branch --tree-filter "powershell -ExecutionPolicy Bypass -File C:\path\to\fix-env.ps1" -- --all
```
Use the actual secret strings in the script, run filter-branch, then delete the script.

---

## Option 2: BFG Repo Cleaner

git-filter-repo can fail on Windows with "ValueError: dictionary update sequence element #17 has length 1". BFG avoids that (requires Java).

### Steps (BFG)

1. **Revoke/rotate the exposed keys** in Gemini and the other service. Old keys are compromised.

2. **Download BFG** (Java required):
   - https://rtyley.github.io/bfg-repo-cleaner/
   - Or: `winget install EclipseAdoptium.Temurin.17.JRE` if you need Java.

3. **Create a replacements file** (e.g. `C:\temp\replacements.txt`) **outside the repo**. One replacement per line, format `OLD==>NEW`:
   ```
   OLD_SECRET_1==>REDACTED
   OLD_SECRET_2==>REDACTED
   ```
   Use the actual exposed strings (Gemini key, other key). Do **not** commit this file.

4. **Run BFG** from the repo root:
   ```powershell
   java -jar path\to\bfg.jar --replace-text C:\temp\replacements.txt
   ```

5. **Prune and GC**:
   ```powershell
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   ```

6. **Force-push** (rewrites remote history; coordinate with others):
   ```powershell
   git push origin --force --all
   git push origin --force --tags
   ```

7. **Delete** the replacements file: `del C:\temp\replacements.txt`

## Alternative: fresh clone + git-filter-repo

If you prefer git-filter-repo, clone the repo into a **new folder** (minimal config, no extra branches), run filter-repo there, then force-push. The error often comes from a complex `.git/config` in the original clone.
