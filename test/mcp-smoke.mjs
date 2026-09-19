import { spawn } from "node:child_process"
import path from "node:path"
import { once } from "node:events"
import assert from "node:assert/strict"

const root = path.resolve(import.meta.dirname, "..")
const child = spawn(process.execPath, ["src/index.js", "mcp"], {
  cwd: root,
  env: {
    ...process.env,
    OPEN_ALBA_JOBS_PATH: path.join(root, "examples/jobs.sample.json"),
    OPEN_ALBA_PROFILE_PATH: path.join(root, "examples/profile.sample.json"),
  },
  stdio: ["pipe", "pipe", "pipe"],
})

const responses = []
child.stdout.setEncoding("utf8")
child.stdout.on("data", (chunk) => {
  for (const line of chunk.trim().split("\n")) {
    if (line) responses.push(JSON.parse(line))
  }
})

function send(id, method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
}

async function waitFor(id) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const found = responses.find((response) => response.id === id)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for response ${id}`)
}

send(1, "initialize", {})
const init = await waitFor(1)
assert.equal(init.result.serverInfo.name, "open-alba-mcp")

send(2, "tools/list", {})
const tools = await waitFor(2)
assert.ok(tools.result.tools.some((tool) => tool.name === "search_jobs"))

send(3, "tools/call", {
  name: "find_jobs_for_profile",
  arguments: { limit: 2 },
})
const search = await waitFor(3)
const payload = JSON.parse(search.result.content[0].text)
assert.ok(payload.length >= 1)
assert.equal(payload[0].applyUrl.startsWith("https://example.com/"), true)

// id 0 is a valid JSON-RPC request id, and a per-call jobsPath must not change which file is read.
send(0, "tools/call", {
  name: "list_sources",
  arguments: { jobsPath: path.join(root, "does-not-exist.json") },
})
const sources = await waitFor(0)
assert.equal(sources.error, undefined)
assert.ok(JSON.parse(sources.result.content[0].text).total >= 1)

child.stdin.end()
child.kill()
await once(child, "exit")

console.log("open-alba-mcp smoke test passed")
