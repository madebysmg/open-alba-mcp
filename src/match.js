const EARTH_RADIUS_KM = 6371

export function searchJobs(jobs, criteria = {}) {
  return jobs
    .map((job) => ({ job, match: scoreJob(job, criteria) }))
    .filter(({ match }) => match.passes)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, clampLimit(criteria.limit))
}

export function scoreJob(job, criteria = {}) {
  const reasons = []
  const misses = []
  let score = 0

  const query = normalizeText(criteria.query)
  if (query) {
    const haystack = normalizeText(`${job.title} ${job.companyName} ${job.description} ${job.tags.join(" ")}`)
    if (haystack.includes(query)) {
      score += 10
      reasons.push(`keyword matched: ${criteria.query}`)
    } else {
      misses.push(`keyword not found: ${criteria.query}`)
    }
  }

  const categories = asArray(criteria.categories)
  if (categories.length > 0) {
    const matched = job.categories.some((category) => categories.includes(category))
    if (matched) {
      score += 35
      reasons.push(`category matched: ${job.categories.join(", ")}`)
    } else {
      misses.push(`category mismatch: ${job.categories.join(", ") || "none"}`)
    }
  }

  const minHourlyPay = numberOrUndefined(criteria.minHourlyPay)
  if (minHourlyPay !== undefined) {
    if ((job.hourlyPay ?? 0) >= minHourlyPay) {
      score += Math.min(20, Math.round(((job.hourlyPay ?? 0) - minHourlyPay) / 500) + 10)
      reasons.push(`pay meets minimum: ${job.hourlyPay} >= ${minHourlyPay}`)
    } else {
      misses.push(`pay below minimum: ${job.hourlyPay ?? "unknown"} < ${minHourlyPay}`)
    }
  }

  const location = criteria.location
  const maxDistanceKm = numberOrUndefined(criteria.maxDistanceKm)
  const distanceKm = getDistanceKm(location, job)
  if (distanceKm !== undefined) {
    if (maxDistanceKm === undefined || distanceKm <= maxDistanceKm) {
      const distanceScore = maxDistanceKm ? Math.max(0, 25 - Math.round((distanceKm / maxDistanceKm) * 20)) : 10
      score += distanceScore
      reasons.push(`distance ${distanceKm.toFixed(1)}km`)
    } else {
      misses.push(`too far: ${distanceKm.toFixed(1)}km > ${maxDistanceKm}km`)
    }
  } else if (maxDistanceKm !== undefined) {
    misses.push("missing coordinates for distance filter")
  }

  const availableAfter = dateOrUndefined(criteria.availableAfter)
  const availableBefore = dateOrUndefined(criteria.availableBefore)
  const startAt = dateOrUndefined(job.startAt)
  const endAt = dateOrUndefined(job.endAt)
  if (startAt && availableAfter && startAt < availableAfter) {
    misses.push(`starts before availability: ${job.startAt}`)
  } else if (startAt && availableAfter) {
    score += 5
    reasons.push("starts after available time")
  }
  if (endAt && availableBefore && endAt > availableBefore) {
    misses.push(`ends after availability: ${job.endAt}`)
  } else if (endAt && availableBefore) {
    score += 5
    reasons.push("ends before unavailable time")
  }

  if (!query && categories.length === 0 && minHourlyPay === undefined && maxDistanceKm === undefined) {
    score += 1
    reasons.push("no restrictive filters")
  }

  const passes = misses.length === 0
  return {
    passes,
    score,
    distanceKm,
    reasons,
    misses,
  }
}

export function criteriaFromProfile(profile, overrides = {}) {
  return {
    location: profile.location,
    maxDistanceKm: profile.maxDistanceKm,
    minHourlyPay: profile.minHourlyPay,
    categories: profile.categories,
    availableAfter: profile.availableAfter,
    availableBefore: profile.availableBefore,
    ...overrides,
  }
}

export function summarizeJobResult({ job, match }) {
  return {
    id: job.id,
    title: job.title,
    companyName: job.companyName,
    platform: job.platform,
    address: job.address,
    hourlyPay: job.hourlyPay,
    startAt: job.startAt,
    endAt: job.endAt,
    categories: job.categories,
    applyUrl: job.applyUrl,
    score: match.score,
    distanceKm: match.distanceKm === undefined ? undefined : Number(match.distanceKm.toFixed(2)),
    reasons: match.reasons,
  }
}

export function sourceSummary(jobs) {
  const bySource = {}
  const byPlatform = {}
  for (const job of jobs) {
    bySource[job.source] = (bySource[job.source] ?? 0) + 1
    byPlatform[job.platform] = (byPlatform[job.platform] ?? 0) + 1
  }
  return { total: jobs.length, bySource, byPlatform }
}

function getDistanceKm(location, job) {
  if (!location || job.lat === undefined || job.lng === undefined) return undefined
  if (location.lat === undefined || location.lng === undefined) return undefined
  return haversineKm(location.lat, location.lng, job.lat, job.lng)
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg) {
  return deg * Math.PI / 180
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase()
}

function asArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  return [value]
}

function clampLimit(value) {
  const parsed = Number(value ?? 10)
  if (!Number.isFinite(parsed)) return 10
  return Math.max(1, Math.min(50, Math.trunc(parsed)))
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function dateOrUndefined(value) {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}
