import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendExe = join(repoRoot, 'backend', 'dist', 'backend.exe')
const targetDir = join(repoRoot, 'client', 'resources', 'backend')
const targetExe = join(targetDir, 'backend.exe')

const run = (command, args, options) => {
  execFileSync(command, args, { stdio: 'inherit', ...options })
}

run('maturin', ['develop', '--release'], { cwd: repoRoot })

run(
  'python',
  [
    '-m',
    'PyInstaller',
    '--name',
    'backend',
    '--onefile',
    '--clean',
    '--noconfirm',
    '--distpath',
    'backend/dist',
    '--workpath',
    'backend/build',
    '--collect-all',
    'fastapi',
    '--collect-all',
    'uvicorn',
    '--collect-all',
    'starlette',
    'backend/entrypoint.py',
  ],
  { cwd: repoRoot },
)

if (!existsSync(backendExe)) {
  throw new Error(`Backend exe not found at ${backendExe}`)
}

mkdirSync(targetDir, { recursive: true })
copyFileSync(backendExe, targetExe)

console.log(`Backend exe copied to ${targetExe}`)
