import fs from "node:fs/promises"
import path from "node:path"

const DEFAULT_JOBS_PATH = path.resolve("examples/jobs.sample.json")
const DEFAULT_PROFILE_PATH = path.resolve("examples/profile.sample.json")

export function resolveJobsPath(inputPath) {
  return path.resolve(inputPath ?? process.env.OPEN_ALBA_JOBS_PATH ?? DEFAULT_JOBS_PATH)
}

export function resolveProfilePath(inputPath) {
  return path.resolve(inputPath ?? process.env.OPEN_ALBA_PROFILE_PATH ?? DEFAULT_PROFILE_PATH)
}

export async function loadJobs(inputPath) {
  const filePath = resolveJobsPath(inputPath)
  const raw = await fs.readFile(filePath, "utf8")
  const jobs = filePath.endsWith(".csv") ? parseJobsCsv(raw) : parseJobsJson(raw, filePath)
  return normalizeJobs(jobs)
}

export async function loadProfile(inputPath) {
  const filePath = resolveProfilePath(inputPath)
  const raw = await fs.readFile(filePath, "utf8")
  return JSON.parse(raw)
}

function parseJobsJson(raw, filePath) {
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.jobs)) return parsed.jobs
  throw new Error(`Expected ${filePath} to contain an array or { "jobs": [] }`)
}

function parseJobsCsv(raw) {
  const rows = parseCsv(raw.trim())
  const [header, ...body] = rows
  if (!header) return []
  return body.map((row) => {
    const record = Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]))
    return {
      ...record,
      lat: numberOrUndefined(record.lat),
      lng: numberOrUndefined(record.lng),
      hourlyPay: numberOrUndefined(record.hourlyPay),
      categories: splitList(record.categories),
      tags: splitList(record.tags),
    }
  })
}

function parseCsv(raw) {
  const rows = []
  let row = []
  let value = ""
  let quoted = false

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    const next = raw[index + 1]

    if (char === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === "," && !quoted) {
      row.push(value)
      value = ""
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1
      row.push(value)
      rows.push(row)
      row = []
      value = ""
    } else {
      value += char
    }
  }

  row.push(value)
  rows.push(row)
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""))
}

function normalizeJobs(jobs) {
  return jobs.map((job, index) => ({
    id: stringOrDefault(job.id, `job-${index + 1}`),
    source: stringOrDefault(job.source, "local"),
    platform: stringOrDefault(job.platform, job.source ?? "local"),
    sourceJobId: stringOrDefault(job.sourceJobId, job.id ?? `job-${index + 1}`),
    title: stringOrDefault(job.title, "Untitled job"),
    companyName: stringOrDefault(job.companyName, "Unknown company"),
    address: stringOrDefault(job.address, ""),
    lat: numberOrUndefined(job.lat),
    lng: numberOrUndefined(job.lng),
    hourlyPay: numberOrUndefined(job.hourlyPay),
    startAt: job.startAt,
    endAt: job.endAt,
    categories: Array.isArray(job.categories) ? job.categories : splitList(job.categories),
    tags: Array.isArray(job.tags) ? job.tags : splitList(job.tags),
    description: stringOrDefault(job.description, ""),
    applyUrl: stringOrDefault(job.applyUrl, ""),
    collectedAt: job.collectedAt,
  }))
}

function splitList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  return String(value).split(/[|;]/).map((item) => item.trim()).filter(Boolean)
}

function stringOrDefault(value, fallback) {
  return value === undefined || value === null || value === "" ? fallback : String(value)
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
