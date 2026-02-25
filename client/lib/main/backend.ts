import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, writeFileSync, createWriteStream } from 'fs'
import { createServer } from 'net'
import { join, resolve, sep } from 'path'
import http from 'http'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 49000
const MAX_PORT = 49099

let backendProcess: ChildProcess | null = null

const resolveRepoRoot = (): string => {
  const cwd = process.cwd()
  if (cwd.endsWith(`${sep}client`)) {
    return resolve(cwd, '..')
  }
  return cwd
}

const resolveBackendExe = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'backend', 'backend.exe')
  }
  const repoRoot = resolveRepoRoot()
  return join(repoRoot, 'backend', 'dist', 'backend.exe')
}

const resolveFfmpegDir = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg')
  }
  const repoRoot = resolveRepoRoot()
  return join(repoRoot, 'client', 'resources', 'ffmpeg')
}

const isPortAvailable = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => {
      resolve(false)
    })
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, DEFAULT_HOST)
  })


export const startBackend = async (): Promise<void> => {
  if (backendProcess) {
    return
  }

  const backendExe = resolveBackendExe()
  if (!existsSync(backendExe)) {
    console.error(`Backend exe not found at ${backendExe}`)
    try {
      const logPath = join(app.getPath('userData'), 'backend.log')
      writeFileSync(logPath, `Backend exe not found at ${backendExe}\n`, { encoding: 'utf8' })
    } catch (error) {
      console.error('Failed to write backend log file:', error)
    }
    return
  }

  const ffmpegDir = resolveFfmpegDir()
  const ffmpegPath = join(ffmpegDir, 'ffmpeg.exe')
  const ffprobePath = join(ffmpegDir, 'ffprobe.exe')

  const logPath = join(app.getPath('userData'), 'backend.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })
  logStream.write(`Backend exe path: ${backendExe}\n`)

  const startWithPort = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
      const backendUrl = `http://${DEFAULT_HOST}:${port}`
      logStream.write(`Starting backend at ${backendUrl}\n`)

      const env = {
        ...process.env,
        HOST: DEFAULT_HOST,
        PORT: String(port),
        BACKEND_URL: backendUrl,
        HELIX_PORT: process.env.HELIX_PORT ?? '7003',
        HELIX_LOCAL: process.env.HELIX_LOCAL ?? 'true',
        FFMPEG_PATH: ffmpegPath,
        FFPROBE_PATH: ffprobePath,
        PATH: ffmpegDir ? `${ffmpegDir};${process.env.PATH ?? ''}` : process.env.PATH,
      }

      const spawned = spawn(backendExe, ['--host', DEFAULT_HOST, '--port', String(port)], {
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      backendProcess = spawned

      let bindFailed = false
      let completed = false

      const markSuccess = () => {
        if (completed) {
          return
        }
        completed = true
        process.env.BACKEND_URL = backendUrl
        try {
          const urlPath = join(app.getPath('userData'), 'backend-url.txt')
          writeFileSync(urlPath, `${backendUrl}\n`, { encoding: 'utf8' })
        } catch (error) {
          console.error('Failed to write backend url file:', error)
        }
        resolve(true)
      }

      const markFailure = (reason: string) => {
        if (completed) {
          return
        }
        completed = true
        bindFailed = true
        logStream.write(`${reason}\n`)
        spawned.kill()
        resolve(false)
      }

      spawned.on('error', (error) => {
        console.error('Backend process error:', error)
        markFailure(`Backend process error: ${String(error)}`)
      })

      spawned.stdout?.on('data', (data) => {
        logStream.write(data)
      })

      spawned.stderr?.on('data', (data) => {
        const text = String(data)
        logStream.write(text)
        if (text.includes('Errno 10048')) {
          markFailure('Port already in use')
        }
      })

      spawned.on('exit', (code, signal) => {
        console.log(`Backend process exited (code=${code}, signal=${signal})`)
        logStream.write(`Backend process exited (code=${code}, signal=${signal})\n`)
        backendProcess = null
        if (!bindFailed && !completed) {
          markFailure('Backend process exited before ready')
        }
      })

      const healthUrl = `${backendUrl}/health`
      const startTime = Date.now()
      const pollHealth = () => {
        if (completed) {
          return
        }
        const req = http.get(healthUrl, (res) => {
          res.resume()
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            markSuccess()
            return
          }
          if (Date.now() - startTime > 5000) {
            markFailure('Backend health check timeout')
            return
          }
          setTimeout(pollHealth, 200)
        })
        req.on('error', () => {
          if (Date.now() - startTime > 5000) {
            markFailure('Backend health check timeout')
            return
          }
          setTimeout(pollHealth, 200)
        })
      }

      setTimeout(pollHealth, 200)
    })

  for (let port = DEFAULT_PORT; port <= MAX_PORT; port += 1) {
    const available = await isPortAvailable(port)
    if (!available) {
      continue
    }
    const started = await startWithPort(port)
    if (started) {
      logStream.end()
      return
    }
  }

  logStream.write('Failed to start backend on any port.\n')
  logStream.end()
}

export const stopBackend = (): void => {
  if (!backendProcess) {
    return
  }

  backendProcess.kill()
  backendProcess = null
}
