#!/usr/bin/env node
import process from "node:process"
import { loadJobs, loadProfile } from "./store.js"
import { criteriaFromProfile, scoreJob, searchJobs, sourceSummary, summarizeJobResult } from "./match.js"

const TOOLS = [
  {
    name: "list_sources",
    description: "Summarize loaded local job sources and platforms.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "search_jobs",
    description: "Search local part-time jobs by keyword, category, pay, distance, and time.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        categories: { type: "array", items: { type: "string" } },
        minHourlyPay: { type: "number" },
        maxDistanceKm: { type: "number" },
        location: {
          type: "object",
          properties: { lat: { type: "number" }, lng: { type: "number" } },
        },
        availableAfter: { type: "string" },
        availableBefore: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "find_jobs_for_profile",
    description: "Rank jobs using the local profile file, with optional overrides.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_job_detail",
    description: "Return one local job by ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "explain_match",
    description: "Explain why a job matches or misses the local profile.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "draft_application_note",
    description: "Draft a short application note. This tool never submits applications.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        tone: { type: "string", enum: ["short", "polite"] },
      },
    },
  },
]

async function callTool(name, args = {}) {
  // File paths come only from OPEN_ALBA_JOBS_PATH / OPEN_ALBA_PROFILE_PATH (or the
  // bundled samples). Tool arguments never choose which local file is read.
  const jobs = await loadJobs()
  if (name === "list_sources") {
    return sourceSummary(jobs)
  }

  if (name === "search_jobs") {
    return searchJobs(jobs, args).map(summarizeJobResult)
  }

  if (name === "find_jobs_for_profile") {
    const profile = await loadProfile()
    const criteria = criteriaFromProfile(profile, args)
    return searchJobs(jobs, criteria).map(summarizeJobResult)
  }

  const job = jobs.find((candidate) => candidate.id === args.id)
  if (!job) throw new Error(`Job not found: ${args.id}`)

  if (name === "get_job_detail") {
    return job
  }

  if (name === "explain_match") {
    const profile = await loadProfile()
    const match = scoreJob(job, criteriaFromProfile(profile, args))
    return { job: summarizeJobResult({ job, match }), passes: match.passes, misses: match.misses }
  }

  if (name === "draft_application_note") {
    const tone = args.tone === "short" ? "short" : "polite"
    const note = tone === "short"
      ? `안녕하세요. ${job.title} 공고 보고 지원드립니다. 근무 시간 확인 후 바로 대응 가능합니다.`
      : `안녕하세요. ${job.companyName}의 ${job.title} 공고를 보고 지원드립니다. 공고에 기재된 근무 시간과 업무 내용을 확인했으며, 필요하시면 원 플랫폼에서 추가 정보를 제출하겠습니다. 감사합니다.`
    return {
      warning: "Draft only. Apply manually on the original platform.",
      applyUrl: job.applyUrl,
      note,
    }
  }

  throw new Error(`Unknown tool: ${name}`)
}

async function handleRpc(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "open-alba-mcp", version: "0.1.0" },
    }
  }

  if (message.method === "tools/list") {
    return { tools: TOOLS }
  }

  if (message.method === "tools/call") {
    const { name, arguments: args } = message.params ?? {}
    const result = await callTool(name, args ?? {})
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  }

  return {}
}

async function runMcp() {
  let buffer = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => {
    buffer += chunk
    let newlineIndex = buffer.indexOf("\n")
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line) void respond(line)
      newlineIndex = buffer.indexOf("\n")
    }
  })
}

async function respond(line) {
  let message
  try {
    message = JSON.parse(line)
    // Notifications carry no id and get no response. id 0 is a valid request id.
    if (message.id === undefined || message.id === null) {
      return
    }
    const result = await handleRpc(message)
    writeRpc({ jsonrpc: "2.0", id: message.id, result })
  } catch (error) {
    writeRpc({
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }
}

function writeRpc(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

async function runSearchCli(args) {
  const parsed = parseArgs(args)
  const jobs = await loadJobs(parsed.jobs)
  const profile = await loadProfile(parsed.profile)
  const criteria = criteriaFromProfile(profile, { query: parsed.query, limit: parsed.limit })
  const results = searchJobs(jobs, criteria).map(summarizeJobResult)
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
}

function parseArgs(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index]
    if (!current.startsWith("--")) continue
    parsed[current.slice(2)] = args[index + 1]
    index += 1
  }
  return parsed
}

const [command = "mcp", ...args] = process.argv.slice(2)
if (command === "mcp") {
  await runMcp()
} else if (command === "search") {
  await runSearchCli(args)
} else {
  process.stderr.write(`Unknown command: ${command}\n`)
  process.exitCode = 1
}
