import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backendDirectory = path.join(root, 'backend')
const nodeExecutable = process.execPath
const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const playwrightArguments = process.argv.slice(2)

const environment = {
  ...process.env,
  PGHOST: process.env.PGHOST || '127.0.0.1',
  PGPORT: process.env.PGPORT || '5432',
  PGUSER: process.env.PGUSER || 'neurocrop',
  PGPASSWORD: process.env.PGPASSWORD || 'neurocrop-e2e',
  PGDATABASE: process.env.PGDATABASE || 'neurocrop_e2e',
  NODE_ENV: 'test',
  API_PORT: process.env.API_PORT || '3100',
  SESSION_COOKIE_SECURE: 'false',
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || 'http://127.0.0.1:4173',
  TENANT_TEST_PASSWORD: process.env.TENANT_TEST_PASSWORD || 'NeuroCrop-CI-Password-2026',
  E2E_PASSWORD: process.env.E2E_PASSWORD || 'NeuroCrop-CI-Password-2026',
  E2E_API_URL: process.env.E2E_API_URL || 'http://127.0.0.1:3100',
  E2E_FRONTEND_URL: process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:4173'
}

const children = []
let cleaningUp = false

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: options.env || environment,
      stdio: options.stdio || 'inherit'
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} failed (${signal || `exit ${code}`})`))
    })
  })
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || root,
    env: options.env || environment,
    stdio: options.stdio || 'inherit'
  })
  children.push(child)
  return child
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) })
    const finish = (connected) => {
      socket.destroy()
      resolve(connected)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function isHealthy(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

async function waitFor(label, check, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(500)
  }
  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds`)
}

async function startPostgresIfNeeded() {
  if (await canConnect(environment.PGHOST, environment.PGPORT)) return
  throw new Error(`GitHub CI PostgreSQL is unavailable at ${environment.PGHOST}:${environment.PGPORT}`)
}

async function prepareBackend() {
  if (await isHealthy(`${environment.E2E_API_URL}/health`)) return false
  await startPostgresIfNeeded()
  await run(nodeExecutable, ['migrate.js'], { cwd: backendDirectory })
  await run(nodeExecutable, ['scripts/seed-ci-tenants.mjs'], { cwd: backendDirectory })
  start(nodeExecutable, ['api.js'], { cwd: backendDirectory })
  await waitFor('NeuroCrop E2E API', () => isHealthy(`${environment.E2E_API_URL}/health`))
  return true
}

async function prepareFrontend() {
  if (await isHealthy(`${environment.E2E_FRONTEND_URL}/`)) return false
  start(pnpmExecutable, ['dev', '--host', '127.0.0.1', '--port', '4173'])
  await waitFor('NeuroCrop E2E frontend', () => isHealthy(`${environment.E2E_FRONTEND_URL}/`))
  return true
}

async function cleanup() {
  if (cleaningUp) return
  cleaningUp = true
  for (const child of children.reverse()) {
    if (!child.killed) child.kill('SIGTERM')
  }
}

async function main() {
  if (!process.env.CI) {
    console.log('[e2e] Full E2E runs in GitHub CI; no local Docker or PostgreSQL is required.')
    return
  }
  console.log('[e2e] Preparing database, API and frontend...')
  const apiStarted = await prepareBackend()
  const frontendStarted = await prepareFrontend()
  console.log(`[e2e] Services ready (API ${apiStarted ? 'started' : 'reused'}, frontend ${frontendStarted ? 'started' : 'reused'}).`)
  await run(pnpmExecutable, ['exec', 'playwright', 'test', ...playwrightArguments])
}

process.once('SIGINT', () => {
  cleanup().finally(() => process.exit(130))
})
process.once('SIGTERM', () => {
  cleanup().finally(() => process.exit(143))
})

try {
  await main()
} catch (error) {
  console.error(`[e2e] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await cleanup()
}
