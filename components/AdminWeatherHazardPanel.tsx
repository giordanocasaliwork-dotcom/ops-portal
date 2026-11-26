 'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '../utils/supabase/client'

export interface MonitoredMissionItem {
  id: string
  client_vip: string
  start_time: string
  end_time: string
  pickup_point: string
  dropoff_point: string
  status: string
}

interface AdminWeatherHazardPanelProps {
  isAdmin: boolean
  userEmail: string
  userId: string
  missions?: MonitoredMissionItem[]
  onAuditUpdated?: () => void
}

interface CoordinatesState {
  lat: number
  lng: number
  label: string
  updatedAt: string
}

interface WeatherSnapshot {
  temperature: number
  apparentTemperature: number
  precipitationNow: number
  rainNow: number
  snowfallNow: number
  windGustsNow: number
  weatherCode: number
  maxRain12h: number
  sumRain12h: number
  sumSnow12h: number
  maxGusts12h: number
  maxTemp12h: number
  minTemp12h: number
}

interface QuakeEvent {
  id: string
  magnitude: number
  place: string
  time: number
  distanceKm: number
}

interface HazardAlertItem {
  key: string
  severity: 'HIGH' | 'CRITICAL'
  category: string
  title: string
  details: string
}

interface EndpointEnvReport {
  rawQuery: string
  resolvedLabel: string
  lat: number
  lng: number
  weather: WeatherSnapshot
  quakes: QuakeEvent[]
}

interface MissionHazardSummary {
  mission: MonitoredMissionItem
  pickupReport: EndpointEnvReport | null
  dropoffReport: EndpointEnvReport | null
  alerts: HazardAlertItem[]
}

interface CachedEnvEntry {
  timestamp: number
  weather: WeatherSnapshot
  quakes: QuakeEvent[]
  quakeOk: boolean
}

const ENV_CACHE_STORAGE_KEY = 'ops_env_feed_cache_v2'
const ENV_CACHE_TTL_MS = 15 * 60 * 1000

function getCoordCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)}_${lng.toFixed(2)}`
}

function getWeatherDescription(code: number): string {
  if (code === 0) return 'Cielo sereno'
  if (code === 1 || code === 2) return 'Parzialmente nuvoloso'
  if (code === 3) return 'Coperto'
  if (code === 45 || code === 48) return 'Nebbia / Caligo'
  if ([51, 53, 55].includes(code)) return 'Pioviggine'
  if ([56, 57, 66, 67].includes(code)) return 'Pioggia gelata (Gelicidio)'
  if ([61, 63].includes(code)) return 'Pioggia moderata'
  if (code === 65) return 'Pioggia forte'
  if ([71, 73].includes(code)) return 'Nevicata'
  if (code === 75 || code === 77) return 'Nevicata intensa'
  if ([80, 81].includes(code)) return 'Rovesci di pioggia'
  if (code === 82) return 'Nubifragio / Rovesci violenti'
  if ([85, 86].includes(code)) return 'Rovesci nevosi intensi'
  if (code === 95) return 'Temporale'
  if (code === 96 || code === 99) return 'Temporale violento con grandine'
  return `Condizione meteo (WMO ${code})`
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function buildGeocodeCandidates(raw: string): string[] {
  const clean = raw.trim()
  if (!clean) return []

  const candidates = new Set<string>([clean])

  if (clean.includes(',')) {
    const parts = clean
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 1) {
      candidates.add(parts[parts.length - 1])
      candidates.add(parts.slice(1).join(', '))
    }
  }

  if (clean.includes(' - ')) {
    const firstPart = clean.split(' - ')[0].trim()
    if (firstPart) candidates.add(firstPart)
  }

  const withoutStreet = clean
    .replace(
      /^(via|viale|piazza|piazzale|corso|largo|strada|vicolo|lungotevere|lungarno)\s+[^,0-9]+[0-9a-zA-Z/]*[\s,-]*/i,
      ''
    )
    .trim()
  if (withoutStreet && withoutStreet.length >= 3) {
    candidates.add(withoutStreet)
  }

  const words = clean.split(/\s+/).filter((w) => w.length >= 3)
  if (words.length >= 2) {
    candidates.add(words[0])
    candidates.add(words[words.length - 1])
  }

  return Array.from(candidates)
}

function parseOpenMeteoNode(node: any): WeatherSnapshot {
  const curr = node?.current || {}
  const hourlyTemp: number[] = node?.hourly?.temperature_2m || []
  const hourlyPrecip: number[] = node?.hourly?.precipitation || []
  const hourlySnow: number[] = node?.hourly?.snowfall || []
  const hourlyGusts: number[] = node?.hourly?.wind_gusts_10m || []

  return {
    temperature: Number(curr.temperature_2m ?? 0),
    apparentTemperature: Number(curr.apparent_temperature ?? curr.temperature_2m ?? 0),
    precipitationNow: Number(curr.precipitation ?? 0),
    rainNow: Number(curr.rain ?? 0),
    snowfallNow: Number(curr.snowfall ?? 0),
    windGustsNow: Number(curr.wind_gusts_10m ?? 0),
    weatherCode: Number(curr.weather_code ?? 0),
    maxRain12h: hourlyPrecip.length > 0 ? Math.max(...hourlyPrecip) : 0,
    sumRain12h: hourlyPrecip.reduce((acc, v) => acc + (Number(v) || 0), 0),
    sumSnow12h: hourlySnow.reduce((acc, v) => acc + (Number(v) || 0), 0),
    maxGusts12h: hourlyGusts.length > 0 ? Math.max(...hourlyGusts) : 0,
    maxTemp12h:
      hourlyTemp.length > 0 ? Math.max(...hourlyTemp) : Number(curr.temperature_2m ?? 0),
    minTemp12h:
      hourlyTemp.length > 0 ? Math.min(...hourlyTemp) : Number(curr.temperature_2m ?? 0),
  }
}

export default function AdminWeatherHazardPanel({
  isAdmin,
  userEmail,
  userId,
  missions = [],
  onAuditUpdated,
}: AdminWeatherHazardPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  const [coords, setCoords] = useState<CoordinatesState | null>(null)
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [quakes, setQuakes] = useState<QuakeEvent[]>([])
  const [quakeFeedStatus, setQuakeFeedStatus] = useState<'ok' | 'unavailable'>('ok')
  const [feedNotice, setFeedNotice] = useState<string | null>(null)
  const [missionSummaries, setMissionSummaries] = useState<MissionHazardSummary[]>([])
  const [activeAlerts, setActiveAlerts] = useState<HazardAlertItem[]>([])
  const [loadingGps, setLoadingGps] = useState(false)
  const [checkingFeed, setCheckingFeed] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null)
  const [statusBanner, setStatusBanner] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)

  const geocodeCacheRef = useRef<Record<string, { lat: number; lng: number; label: string }>>({})
  const envCacheRef = useRef<Record<string, CachedEnvEntry>>({})
  const initializedRef = useRef(false)
  const coordsRef = useRef<CoordinatesState | null>(null)
  const rateLimitUntilRef = useRef<number>(0)

  useEffect(() => {
    coordsRef.current = coords
  }, [coords])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const rawGeo = window.localStorage.getItem('ops_geocode_cache_v1')
      if (rawGeo) geocodeCacheRef.current = JSON.parse(rawGeo)
    } catch {
      // ignora
    }
    try {
      const rawEnv = window.localStorage.getItem(ENV_CACHE_STORAGE_KEY)
      if (rawEnv) envCacheRef.current = JSON.parse(rawEnv)
    } catch {
      // ignora
    }
  }, [])

  const saveEnvCache = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(ENV_CACHE_STORAGE_KEY, JSON.stringify(envCacheRef.current))
    } catch {
      // ignora quota storage
    }
  }, [])

  const activeMissions = useMemo(
    () => missions.filter((m) => m.status === 'pianificata' || m.status === 'in corso'),
    [missions]
  )

  const activeMissionsSignature = useMemo(
    () =>
      activeMissions
        .map((m) => `${m.id}:${m.status}:${m.pickup_point}:${m.dropoff_point}`)
        .join('|'),
    [activeMissions]
  )

  const resolveLocationName = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=it`
      )
      if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      const data = (await res.json()) as {
        city?: string
        locality?: string
        principalSubdivision?: string
        countryName?: string
      }
      const parts = [data.city || data.locality, data.principalSubdivision, data.countryName].filter(
        Boolean
      )
      return parts.length > 0 ? parts.join(', ') : `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    }
  }

  const geocodePlace = useCallback(
    async (rawPlace: string): Promise<{ lat: number; lng: number; label: string } | null> => {
      const normalizedKey = rawPlace.trim().toLowerCase()
      if (!normalizedKey) return null

      if (geocodeCacheRef.current[normalizedKey]) {
        return geocodeCacheRef.current[normalizedKey]
      }

      const candidates = buildGeocodeCandidates(rawPlace)
      for (const candidate of candidates) {
        try {
          const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            candidate
          )}&count=1&language=it&format=json`
          const res = await fetch(url)
          if (res.status === 429) break
          if (!res.ok) continue
          const data = (await res.json()) as {
            results?: Array<{
              latitude: number
              longitude: number
              name: string
              admin1?: string
            }>
          }
          const hit = data.results?.[0]
          if (hit && typeof hit.latitude === 'number' && typeof hit.longitude === 'number') {
            const labelParts = [hit.name, hit.admin1].filter(Boolean)
            const resolved = {
              lat: Number(hit.latitude.toFixed(5)),
              lng: Number(hit.longitude.toFixed(5)),
              label: labelParts.length > 0 ? labelParts.join(', ') : rawPlace.trim(),
            }
            geocodeCacheRef.current[normalizedKey] = resolved
            if (typeof window !== 'undefined') {
              try {
                window.localStorage.setItem(
                  'ops_geocode_cache_v1',
                  JSON.stringify(geocodeCacheRef.current)
                )
              } catch {
                // ignora
              }
            }
            return resolved
          }
        } catch {
          // prova candidato successivo
        }
      }

      return null
    },
    []
  )

  const fetchUsgsQuakes = useCallback(
    async (lat: number, lng: number): Promise<{ quakes: QuakeEvent[]; ok: boolean }> => {
      try {
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const quakeUrl =
          `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
          `&latitude=${lat}&longitude=${lng}` +
          `&maxradiuskm=100&minmagnitude=3.0&starttime=${encodeURIComponent(sinceIso)}`

        const quakeRes = await fetch(quakeUrl)
        if (!quakeRes.ok) return { quakes: [], ok: false }

        const quakeJson = (await quakeRes.json()) as {
          features?: Array<{
            id: string
            properties?: { mag?: number; place?: string; time?: number }
            geometry?: { coordinates?: [number, number, number] }
          }>
        }

        const parsedQuakes = (quakeJson.features || [])
          .map((f) => {
            const qLng = f.geometry?.coordinates?.[0] ?? lng
            const qLat = f.geometry?.coordinates?.[1] ?? lat
            return {
              id: f.id,
              magnitude: Number(f.properties?.mag ?? 0),
              place: String(f.properties?.place || 'Area limitrofa'),
              time: Number(f.properties?.time ?? Date.now()),
              distanceKm: haversineKm(lat, lng, qLat, qLng),
            }
          })
          .sort((a, b) => b.time - a.time)

        return { quakes: parsedQuakes, ok: true }
      } catch {
        return { quakes: [], ok: false }
      }
    },
    []
  )

  const fetchPointsBatch = useCallback(
    async (
      points: Array<{ key: string; lat: number; lng: number }>,
      forceFresh: boolean
    ): Promise<{
      dataMap: Map<string, CachedEnvEntry>
      usedCacheFallback: boolean
      rateLimited: boolean
    }> => {
      const dataMap = new Map<string, CachedEnvEntry>()
      const now = Date.now()
      const toFetch: Array<{ key: string; lat: number; lng: number }> = []

      for (const pt of points) {
        const cached = envCacheRef.current[pt.key]
        if (!forceFresh && cached && now - cached.timestamp < ENV_CACHE_TTL_MS) {
          dataMap.set(pt.key, cached)
        } else {
          toFetch.push(pt)
        }
      }

      if (toFetch.length === 0) {
        return { dataMap, usedCacheFallback: false, rateLimited: false }
      }

      if (now < rateLimitUntilRef.current) {
        for (const pt of toFetch) {
          const stale = envCacheRef.current[pt.key]
          if (stale) dataMap.set(pt.key, stale)
        }
        return { dataMap, usedCacheFallback: true, rateLimited: true }
      }

      const latsParam = toFetch.map((p) => p.lat).join(',')
      const lngsParam = toFetch.map((p) => p.lng).join(',')
      const batchUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${latsParam}&longitude=${lngsParam}` +
        `&current=temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_gusts_10m` +
        `&hourly=temperature_2m,precipitation,snowfall,wind_gusts_10m` +
        `&forecast_hours=12&timezone=auto`

      const meteoRes = await fetch(batchUrl)

      if (meteoRes.status === 429) {
        rateLimitUntilRef.current = Date.now() + 5 * 60 * 1000
        for (const pt of toFetch) {
          const stale = envCacheRef.current[pt.key]
          if (stale) dataMap.set(pt.key, stale)
        }
        return { dataMap, usedCacheFallback: true, rateLimited: true }
      }

      if (!meteoRes.ok) {
        throw new Error(`Feed meteo temporaneamente non disponibile (${meteoRes.status}).`)
      }

      const rawJson = await meteoRes.json()
      const nodes: any[] = Array.isArray(rawJson) ? rawJson : [rawJson]

      for (let i = 0; i < toFetch.length; i++) {
        const pt = toFetch[i]
        const node = nodes[i]
        if (!node) continue
        const weatherSnap = parseOpenMeteoNode(node)
        const quakeRes = await fetchUsgsQuakes(pt.lat, pt.lng)

        const entry: CachedEnvEntry = {
          timestamp: Date.now(),
          weather: weatherSnap,
          quakes: quakeRes.quakes,
          quakeOk: quakeRes.ok,
        }
        envCacheRef.current[pt.key] = entry
        dataMap.set(pt.key, entry)
      }

      saveEnvCache()
      return { dataMap, usedCacheFallback: false, rateLimited: false }
    },
    [fetchUsgsQuakes, saveEnvCache]
  )

  const persistAdminLocation = useCallback(
    async (nextCoords: CoordinatesState) => {
      setCoords(nextCoords)
      coordsRef.current = nextCoords
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ops_admin_coords', JSON.stringify(nextCoords))
      }
      try {
        await supabase.from('admin_hazard_state').upsert(
          {
            user_id: userId,
            latitude: nextCoords.lat,
            longitude: nextCoords.lng,
            location_label: nextCoords.label,
            updated_at: nextCoords.updatedAt,
          },
          { onConflict: 'user_id' }
        )
      } catch {
        // non bloccare UI
      }
    },
    [supabase, userId]
  )

  const dispatchAlertsToBackend = useCallback(
    async (alerts: HazardAlertItem[]) => {
      if (alerts.length === 0) return
      let sentAny = false

      for (const item of alerts) {
        try {
          const { data, error } = await supabase.rpc('dispatch_admin_hazard_alert', {
            p_alert_key: item.key,
            p_severity: item.severity,
            p_title: item.title,
            p_details: item.details,
          })
          if (!error && data === 'DISPATCHED') {
            sentAny = true
          }
        } catch {
          // continua
        }
      }

      if (sentAny) {
        setStatusBanner('Allerta critica inviata su Telegram e registrata in Audit Log.')
        if (onAuditUpdated) onAuditUpdated()
        setTimeout(() => setStatusBanner(null), 6000)
      }
    },
    [supabase, onAuditUpdated]
  )

  const evaluatePointHazards = useCallback(
    (
      contextPrefix: string,
      displayContext: string,
      w: WeatherSnapshot,
      recentQuakes: QuakeEvent[]
    ): HazardAlertItem[] => {
      const alerts: HazardAlertItem[] = []
      const dateBucket = new Date().toISOString().slice(0, 10)

      if (
        w.rainNow >= 15 ||
        w.maxRain12h >= 20 ||
        w.sumRain12h >= 45 ||
        [82, 96, 99].includes(w.weatherCode)
      ) {
        const isCritical = w.rainNow >= 25 || w.sumRain12h >= 70 || w.weatherCode === 99
        alerts.push({
          key: `${contextPrefix}_flood_${dateBucket}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'IDROGEOLOGICO / NUBIFRAGIO',
          title: `Allerta Piogge Intense / Rischio Alluvionale — ${displayContext}`,
          details: `Precipitazione attuale: ${w.rainNow} mm/h | Picco 12h: ${w.maxRain12h} mm/h | Accumulo 12h: ${w.sumRain12h.toFixed(
            1
          )} mm (${getWeatherDescription(w.weatherCode)}).`,
        })
      }

      if (w.temperature >= 37 || w.apparentTemperature >= 39 || w.maxTemp12h >= 38) {
        const peak = Math.max(w.temperature, w.apparentTemperature, w.maxTemp12h)
        const isCritical = peak >= 40
        alerts.push({
          key: `${contextPrefix}_heat_${dateBucket}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'ONDATA DI CALORE',
          title: `Allerta Caldo Estremo — ${displayContext}`,
          details: `Temperatura attuale: ${w.temperature}°C (percepita ${w.apparentTemperature}°C) | Massima prevista 12h: ${w.maxTemp12h}°C.`,
        })
      }

      if (
        w.snowfallNow >= 4 ||
        w.sumSnow12h >= 15 ||
        [56, 57, 66, 67, 75, 86].includes(w.weatherCode) ||
        w.minTemp12h <= -8
      ) {
        const isCritical =
          w.sumSnow12h >= 25 || [67, 75, 86].includes(w.weatherCode) || w.minTemp12h <= -12
        alerts.push({
          key: `${contextPrefix}_snow_ice_${dateBucket}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'NEVE / GELO SEVERO',
          title: `Allerta Neve Intensa / Ghiaccio — ${displayContext}`,
          details: `Neve attuale: ${w.snowfallNow} cm/h | Accumulo neve 12h: ${w.sumSnow12h.toFixed(
            1
          )} cm | Minima 12h: ${w.minTemp12h}°C (${getWeatherDescription(w.weatherCode)}).`,
        })
      }

      if (w.windGustsNow >= 75 || w.maxGusts12h >= 80) {
        const maxGust = Math.max(w.windGustsNow, w.maxGusts12h)
        const isCritical = maxGust >= 95
        alerts.push({
          key: `${contextPrefix}_wind_${dateBucket}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'VENTO FORTE / TEMPESTA',
          title: `Allerta Raffiche di Vento Intense — ${displayContext}`,
          details: `Raffiche attuali: ${w.windGustsNow} km/h | Picco previsto 12h: ${w.maxGusts12h} km/h.`,
        })
      }

      const significantQuakes = recentQuakes.filter((q) => q.magnitude >= 3.5)
      if (significantQuakes.length > 0) {
        const strongest = significantQuakes.sort((a, b) => b.magnitude - a.magnitude)[0]
        const isCritical = strongest.magnitude >= 4.5
        alerts.push({
          key: `${contextPrefix}_quake_${strongest.id}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'ALLERTA SISMICA',
          title: `Terremoto M${strongest.magnitude.toFixed(1)} a ${strongest.distanceKm.toFixed(
            0
          )} km — ${displayContext}`,
          details: `Epicentro: ${strongest.place} | Magnitudo: ${strongest.magnitude.toFixed(
            1
          )} | Ora evento: ${new Date(strongest.time).toLocaleString('it-IT')}.`,
        })
      }

      return alerts
    },
    []
  )

  const refreshEnvironmentalData = useCallback(
    async (targetCoords: CoordinatesState | null, forceFresh = false) => {
      setCheckingFeed(true)
      setPanelError(null)
      setFeedNotice(null)

      try {
        const uniquePointsMap = new Map<string, { key: string; lat: number; lng: number }>()

        let adminKey: string | null = null
        if (targetCoords) {
          adminKey = getCoordCacheKey(targetCoords.lat, targetCoords.lng)
          uniquePointsMap.set(adminKey, {
            key: adminKey,
            lat: targetCoords.lat,
            lng: targetCoords.lng,
          })
        }

        const uniqueRawPlaces = Array.from(
          new Set(
            activeMissions
              .flatMap((m) => [m.pickup_point, m.dropoff_point])
              .map((p) => p.trim())
              .filter(Boolean)
          )
        )

        const placeGeoMap = new Map<string, { lat: number; lng: number; label: string; key: string }>()
        for (const rawPlace of uniqueRawPlaces) {
          const geo = await geocodePlace(rawPlace)
          if (geo) {
            const pKey = getCoordCacheKey(geo.lat, geo.lng)
            placeGeoMap.set(rawPlace.toLowerCase(), { ...geo, key: pKey })
            if (!uniquePointsMap.has(pKey)) {
              uniquePointsMap.set(pKey, { key: pKey, lat: geo.lat, lng: geo.lng })
            }
          }
        }

        const allPoints = Array.from(uniquePointsMap.values())
        if (allPoints.length === 0) {
          setCheckingFeed(false)
          return
        }

        const { dataMap, rateLimited } = await fetchPointsBatch(allPoints, forceFresh)

        if (rateLimited) {
          setFeedNotice(
            dataMap.size > 0
              ? 'Limite richieste feed raggiunto (429): visualizzati dati recenti in cache.'
              : 'Feed meteo momentaneamente in pausa per limite richieste (429). Riprova tra qualche minuto.'
          )
        }

        const combinedAlerts: HazardAlertItem[] = []

        if (targetCoords && adminKey) {
          const adminEntry = dataMap.get(adminKey)
          if (adminEntry) {
            setWeather(adminEntry.weather)
            setQuakes(adminEntry.quakes)
            setQuakeFeedStatus(adminEntry.quakeOk ? 'ok' : 'unavailable')

            const adminAlerts = evaluatePointHazards(
              `admin_${adminKey}`,
              `Posizione Admin (${targetCoords.label})`,
              adminEntry.weather,
              adminEntry.quakes
            )
            combinedAlerts.push(...adminAlerts)
          }
        }

        const summaries: MissionHazardSummary[] = activeMissions.map((m) => {
          const pGeo = placeGeoMap.get(m.pickup_point.trim().toLowerCase())
          const dGeo = placeGeoMap.get(m.dropoff_point.trim().toLowerCase())

          const pEntry = pGeo ? dataMap.get(pGeo.key) : undefined
          const dEntry = dGeo ? dataMap.get(dGeo.key) : undefined

          const pickupReport: EndpointEnvReport | null =
            pGeo && pEntry
              ? {
                  rawQuery: m.pickup_point,
                  resolvedLabel: pGeo.label,
                  lat: pGeo.lat,
                  lng: pGeo.lng,
                  weather: pEntry.weather,
                  quakes: pEntry.quakes,
                }
              : null

          const dropoffReport: EndpointEnvReport | null =
            dGeo && dEntry
              ? {
                  rawQuery: m.dropoff_point,
                  resolvedLabel: dGeo.label,
                  lat: dGeo.lat,
                  lng: dGeo.lng,
                  weather: dEntry.weather,
                  quakes: dEntry.quakes,
                }
              : null

          const mAlerts: HazardAlertItem[] = []
          if (pickupReport) {
            mAlerts.push(
              ...evaluatePointHazards(
                `mission_${m.id}_pickup`,
                `Missione ${m.client_vip} [PARTENZA: ${m.pickup_point}]`,
                pickupReport.weather,
                pickupReport.quakes
              )
            )
          }
          if (dropoffReport) {
            mAlerts.push(
              ...evaluatePointHazards(
                `mission_${m.id}_dropoff`,
                `Missione ${m.client_vip} [ARRIVO: ${m.dropoff_point}]`,
                dropoffReport.weather,
                dropoffReport.quakes
              )
            )
          }

          combinedAlerts.push(...mAlerts)
          return { mission: m, pickupReport, dropoffReport, alerts: mAlerts }
        })

        setMissionSummaries(summaries)
        setActiveAlerts(combinedAlerts)
        setLastCheckTime(
          new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        )

        if (combinedAlerts.length > 0) {
          await dispatchAlertsToBackend(combinedAlerts)
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? `Errore connessione feed meteo: ${err.message}`
            : 'Errore aggiornamento meteo/calamita.'
        setPanelError(msg)
      } finally {
        setCheckingFeed(false)
      }
    },
    [
      activeMissions,
      geocodePlace,
      fetchPointsBatch,
      evaluatePointHazards,
      dispatchAlertsToBackend,
    ]
  )

  const detectCurrentPosition = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPanelError('Geolocalizzazione GPS non supportata dal browser.')
      refreshEnvironmentalData(null, false)
      return
    }

    setLoadingGps(true)
    setPanelError(null)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5))
        const lng = Number(pos.coords.longitude.toFixed(5))
        const label = await resolveLocationName(lat, lng)
        const updated: CoordinatesState = {
          lat,
          lng,
          label,
          updatedAt: new Date().toISOString(),
        }
        await persistAdminLocation(updated)
        setLoadingGps(false)
        await refreshEnvironmentalData(updated, true)
      },
      (geoErr) => {
        setLoadingGps(false)
        if (geoErr.code === 1) {
          setPanelError(
            'Permesso GPS negato: abilita la posizione nel browser per il monitoraggio locale.'
          )
        } else {
          setPanelError('Impossibile rilevare la posizione GPS attuale.')
        }
        refreshEnvironmentalData(coordsRef.current, false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [persistAdminLocation, refreshEnvironmentalData])

  useEffect(() => {
    if (!isAdmin || initializedRef.current) return
    initializedRef.current = true

    const init = async () => {
      try {
        const { data } = await supabase
          .from('admin_hazard_state')
          .select('latitude, longitude, location_label, updated_at')
          .eq('user_id', userId)
          .maybeSingle()

        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          const saved: CoordinatesState = {
            lat: data.latitude,
            lng: data.longitude,
            label:
              data.location_label || `${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`,
            updatedAt: data.updated_at || new Date().toISOString(),
          }
          setCoords(saved)
          coordsRef.current = saved
          await refreshEnvironmentalData(saved, false)
          return
        }
      } catch {
        // usa fallback localStorage
      }

      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem('ops_admin_coords')
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CoordinatesState
            if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
              setCoords(parsed)
              coordsRef.current = parsed
              await refreshEnvironmentalData(parsed, false)
              return
            }
          } catch {
            // ignora
          }
        }
      }

      detectCurrentPosition()
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, userId])

  useEffect(() => {
    if (!isAdmin || !initializedRef.current) return
    if (!activeMissionsSignature) {
      setMissionSummaries([])
      return
    }
    refreshEnvironmentalData(coordsRef.current, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMissionsSignature])

  useEffect(() => {
    if (!isAdmin) return
    const interval = setInterval(() => {
      refreshEnvironmentalData(coordsRef.current, true)
    }, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [isAdmin, refreshEnvironmentalData])

  const handleTriggerTestAlert = async () => {
    const locLabel = coords?.label || 'Posizione Admin'
    const testKey = `test_alert_${Date.now()}`
    try {
      const { data, error } = await supabase.rpc('dispatch_admin_hazard_alert', {
        p_alert_key: testKey,
        p_severity: 'HIGH',
        p_title: `Test Sistema Allerta Meteo & Calamita (${locLabel})`,
        p_details: `Verifica operativa attivata da ${userEmail}. Coordinate: ${
          coords ? `${coords.lat}, ${coords.lng}` : 'N/D'
        } | Missioni monitorate: ${activeMissions.length}.`,
      })

      if (error) {
        setPanelError(`Errore invio test alert: ${error.message}`)
        return
      }

      if (data === 'DISPATCHED') {
        setStatusBanner('Alert di test inviato su Telegram e registrato in Audit Log.')
        if (onAuditUpdated) onAuditUpdated()
        setTimeout(() => setStatusBanner(null), 5000)
      }
    } catch (err: unknown) {
      setPanelError(
        err instanceof Error ? `Errore rete test alert: ${err.message}` : 'Errore invio test alert.'
      )
    }
  }

  if (!isAdmin) return null

  return (
    <div className="bg-neutral-900 border border-neutral-800 border-t-2 border-t-sky-500 rounded-xl p-4 sm:p-6 shadow-xl space-y-5">
      <div className="flex flex-col gap-3.5 border-b border-neutral-800 pb-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/40 text-xs font-bold uppercase shrink-0">
              Solo Admin
            </span>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-white">
              Meteo Locale, Tratte Missioni &amp; Early Warning Calamita
            </h2>
            <span
              className={
                'px-2.5 py-0.5 rounded-md border text-xs uppercase font-bold shrink-0 ' +
                (activeAlerts.length > 0
                  ? 'bg-red-950 text-red-300 border-red-600'
                  : 'bg-emerald-950/70 text-emerald-300 border-emerald-700')
              }
            >
              {activeAlerts.length > 0
                ? `${activeAlerts.length} Allerte Attive`
                : 'Nessuna Criticita'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loadingGps}
              onClick={detectCurrentPosition}
              className="min-h-[38px] shrink-0 bg-sky-400 hover:bg-sky-300 text-neutral-950 font-bold text-xs uppercase px-3.5 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {loadingGps ? 'Rilevamento GPS...' : 'Aggiorna GPS'}
            </button>

            <button
              type="button"
              disabled={checkingFeed}
              onClick={() => refreshEnvironmentalData(coordsRef.current, true)}
              className="min-h-[38px] shrink-0 bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs font-semibold uppercase px-3.5 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {checkingFeed ? 'Controllo...' : 'Aggiorna Meteo/Sisma'}
            </button>

            <button
              type="button"
              onClick={handleTriggerTestAlert}
              className="min-h-[38px] shrink-0 bg-neutral-950 hover:bg-neutral-800 text-amber-300 border border-amber-700/80 text-xs font-semibold uppercase px-3.5 py-1.5 rounded-lg transition"
            >
              Test Alert Telegram
            </button>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-neutral-400">
          Posizione Admin:{' '}
          <strong className="text-neutral-100">
            {coords
              ? `${coords.label} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
              : 'In attesa di GPS...'}
          </strong>
          {' • '}Missioni attive monitorate:{' '}
          <strong className="text-sky-300">{activeMissions.length}</strong>
          {lastCheckTime ? ` • Ultimo check: ${lastCheckTime}` : ''}
        </p>
      </div>

      {statusBanner && (
        <div className="p-3.5 bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-sm rounded-xl">
          {statusBanner}
        </div>
      )}

      {feedNotice && (
        <div className="p-3.5 bg-amber-950/50 border border-amber-700/80 text-amber-200 text-sm rounded-xl">
          {feedNotice}
        </div>
      )}

      {panelError && (
        <div className="p-3.5 bg-red-950/60 border border-red-800 text-red-200 text-sm rounded-xl">
          {panelError}
        </div>
      )}

      {activeAlerts.length > 0 && (
        <div className="space-y-2.5">
          {activeAlerts.map((alert) => (
            <div
              key={alert.key}
              className={
                'p-4 rounded-xl border text-sm space-y-1.5 ' +
                (alert.severity === 'CRITICAL'
                  ? 'bg-red-950/80 border-red-600 text-red-200'
                  : 'bg-amber-950/70 border-amber-600 text-amber-200')
              }
            >
              <div className="font-bold uppercase">
                [{alert.severity}] {alert.category} — {alert.title}
              </div>
              <div className="text-neutral-100 leading-relaxed">{alert.details}</div>
            </div>
          ))}
        </div>
      )}

      {weather ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-semibold">Condizioni (Tu)</div>
            <div className="text-white text-sm sm:text-base font-bold mt-1">
              {getWeatherDescription(weather.weatherCode)}
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-semibold">Temperatura</div>
            <div className="text-white font-bold font-mono text-base mt-1">
              {weather.temperature}°C{' '}
              <span className="text-xs font-sans font-normal text-neutral-400 block sm:inline">
                (perc. {weather.apparentTemperature}°C)
              </span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-semibold">Pioggia / 12h</div>
            <div className="text-white font-semibold font-mono text-sm sm:text-base mt-1">
              {weather.rainNow} mm/h •{' '}
              <span className="text-sky-300 font-bold">{weather.sumRain12h.toFixed(1)} mm</span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-semibold">Neve / 12h</div>
            <div className="text-white font-semibold font-mono text-sm sm:text-base mt-1">
              {weather.snowfallNow} cm/h •{' '}
              <span className="text-sky-200 font-bold">{weather.sumSnow12h.toFixed(1)} cm</span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-semibold">Raffiche Vento</div>
            <div className="text-white font-semibold font-mono text-sm sm:text-base mt-1">
              {weather.windGustsNow} km/h{' '}
              <span className="text-xs font-sans font-normal text-neutral-400 block sm:inline">
                (max {weather.maxGusts12h})
              </span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-semibold">
              Sismica (100 km / 24h)
            </div>
            <div className="text-white font-semibold text-sm sm:text-base mt-1">
              {quakeFeedStatus === 'unavailable'
                ? 'Feed USGS in attesa'
                : quakes.length > 0
                ? `M${quakes[0].magnitude.toFixed(1)} (${quakes[0].distanceKm.toFixed(0)} km)`
                : 'Nessun evento ≥ M3.0'}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-neutral-400 py-1">
          Clicca &quot;Aggiorna GPS&quot; per attivare il monitoraggio locale sulla tua posizione.
        </div>
      )}

      {missionSummaries.length > 0 && (
        <div className="border-t border-neutral-800 pt-4 space-y-3">
          <div className="text-xs sm:text-sm uppercase tracking-wider font-bold text-sky-400">
            Monitoraggio Meteo &amp; Sismica — Tratte Missioni Pianificate / In Corso
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-sm">
            {missionSummaries.map(({ mission, pickupReport, dropoffReport, alerts }) => {
              const hasAlert = alerts.length > 0
              const renderEndpointLine = (
                roleLabel: string,
                rawPoint: string,
                rep: EndpointEnvReport | null
              ) => {
                if (!rep) {
                  return (
                    <div className="text-neutral-400 text-xs sm:text-sm">
                      <span className="text-neutral-300 font-semibold">{roleLabel}:</span>{' '}
                      {rawPoint} (coordinate non risolte)
                    </div>
                  )
                }
                const maxQ =
                  rep.quakes.length > 0
                    ? ` | Sisma M${Math.max(...rep.quakes.map((q) => q.magnitude)).toFixed(1)}`
                    : ''
                return (
                  <div className="text-neutral-200 text-xs sm:text-sm leading-relaxed">
                    <span className="text-neutral-400 font-semibold">{roleLabel}:</span>{' '}
                    <span className="text-white font-medium">{rawPoint}</span>{' '}
                    <span className="text-neutral-300">
                      ({rep.weather.temperature}°C, {getWeatherDescription(rep.weather.weatherCode)}
                      , pioggia 12h: {rep.weather.sumRain12h.toFixed(1)}mm, raffiche:{' '}
                      {rep.weather.windGustsNow}km/h{maxQ})
                    </span>
                  </div>
                )
              }

              return (
                <div
                  key={mission.id}
                  className={
                    'bg-neutral-950 border rounded-xl p-4 space-y-2 ' +
                    (hasAlert ? 'border-red-600/90' : 'border-neutral-800')
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-bold text-white uppercase">
                      {mission.client_vip}
                    </span>
                    <span
                      className={
                        'px-2.5 py-0.5 rounded-md text-xs font-bold uppercase border ' +
                        (hasAlert
                          ? 'bg-red-950 text-red-300 border-red-600'
                          : 'bg-emerald-950/60 text-emerald-300 border-emerald-800')
                      }
                    >
                      {hasAlert ? `${alerts.length} Allerte Tratta` : 'Tratta Regolare'}
                    </span>
                  </div>

                  {renderEndpointLine('Partenza', mission.pickup_point, pickupReport)}
                  {renderEndpointLine('Arrivo', mission.dropoff_point, dropoffReport)}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
