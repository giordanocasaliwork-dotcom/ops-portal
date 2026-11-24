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
  const [missionSummaries, setMissionSummaries] = useState<MissionHazardSummary[]>([])
  const [activeAlerts, setActiveAlerts] = useState<HazardAlertItem[]>([])
  const [loadingGps, setLoadingGps] = useState(false)
  const [checkingFeed, setCheckingFeed] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null)
  const [statusBanner, setStatusBanner] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)

  const geocodeCacheRef = useRef<Record<string, { lat: number; lng: number; label: string }>>({})
  const initializedRef = useRef(false)
  const coordsRef = useRef<CoordinatesState | null>(null)

  useEffect(() => {
    coordsRef.current = coords
  }, [coords])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem('ops_geocode_cache_v1')
      if (raw) {
        geocodeCacheRef.current = JSON.parse(raw)
      }
    } catch {
      // ignora cache corrotta
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

  const fetchPointEnvironmental = useCallback(
    async (
      lat: number,
      lng: number
    ): Promise<{ weather: WeatherSnapshot; quakes: QuakeEvent[]; quakeOk: boolean }> => {
      const meteoUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_gusts_10m` +
        `&hourly=temperature_2m,precipitation,snowfall,wind_gusts_10m` +
        `&forecast_hours=12&timezone=auto`

      const meteoRes = await fetch(meteoUrl, { cache: 'no-store' })
      if (!meteoRes.ok) {
        throw new Error(`Feed meteo non raggiungibile (${meteoRes.status}).`)
      }

      const meteoJson = (await meteoRes.json()) as {
        current?: {
          temperature_2m?: number
          apparent_temperature?: number
          precipitation?: number
          rain?: number
          snowfall?: number
          weather_code?: number
          wind_gusts_10m?: number
        }
        hourly?: {
          temperature_2m?: number[]
          precipitation?: number[]
          snowfall?: number[]
          wind_gusts_10m?: number[]
        }
      }

      const curr = meteoJson.current || {}
      const hourlyTemp = meteoJson.hourly?.temperature_2m || []
      const hourlyPrecip = meteoJson.hourly?.precipitation || []
      const hourlySnow = meteoJson.hourly?.snowfall || []
      const hourlyGusts = meteoJson.hourly?.wind_gusts_10m || []

      const snapshot: WeatherSnapshot = {
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

      // Feed sismico isolato: se USGS non risponde non blocca il meteo
      let parsedQuakes: QuakeEvent[] = []
      let quakeOk = false
      try {
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const quakeUrl =
          `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
          `&latitude=${lat}&longitude=${lng}` +
          `&maxradiuskm=100&minmagnitude=3.0&starttime=${encodeURIComponent(sinceIso)}`

        const quakeRes = await fetch(quakeUrl, { cache: 'no-store' })
        if (quakeRes.ok) {
          quakeOk = true
          const quakeJson = (await quakeRes.json()) as {
            features?: Array<{
              id: string
              properties?: { mag?: number; place?: string; time?: number }
              geometry?: { coordinates?: [number, number, number] }
            }>
          }

          parsedQuakes = (quakeJson.features || [])
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
        }
      } catch {
        quakeOk = false
      }

      return { weather: snapshot, quakes: parsedQuakes, quakeOk }
    },
    []
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
        // non bloccare UI se il salvataggio remoto ritarda
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
          // continua con gli altri alert
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
    async (targetCoords: CoordinatesState | null) => {
      setCheckingFeed(true)
      setPanelError(null)

      try {
        const combinedAlerts: HazardAlertItem[] = []

        if (targetCoords) {
          const adminEnv = await fetchPointEnvironmental(targetCoords.lat, targetCoords.lng)
          setWeather(adminEnv.weather)
          setQuakes(adminEnv.quakes)
          setQuakeFeedStatus(adminEnv.quakeOk ? 'ok' : 'unavailable')

          const locKey = `admin_${targetCoords.lat.toFixed(1)}_${targetCoords.lng.toFixed(1)}`
          const adminAlerts = evaluatePointHazards(
            locKey,
            `Posizione Admin (${targetCoords.label})`,
            adminEnv.weather,
            adminEnv.quakes
          )
          combinedAlerts.push(...adminAlerts)
        }

        const uniqueRawPlaces = Array.from(
          new Set(
            activeMissions
              .flatMap((m) => [m.pickup_point, m.dropoff_point])
              .map((p) => p.trim())
              .filter(Boolean)
          )
        )

        const endpointMap = new Map<string, EndpointEnvReport>()

        await Promise.all(
          uniqueRawPlaces.map(async (rawPlace) => {
            const geo = await geocodePlace(rawPlace)
            if (!geo) return
            try {
              const env = await fetchPointEnvironmental(geo.lat, geo.lng)
              endpointMap.set(rawPlace.toLowerCase(), {
                rawQuery: rawPlace,
                resolvedLabel: geo.label,
                lat: geo.lat,
                lng: geo.lng,
                weather: env.weather,
                quakes: env.quakes,
              })
            } catch {
              // salta endpoint se temporaneamente non raggiungibile
            }
          })
        )

        const summaries: MissionHazardSummary[] = activeMissions.map((m) => {
          const pickupReport = endpointMap.get(m.pickup_point.trim().toLowerCase()) || null
          const dropoffReport = endpointMap.get(m.dropoff_point.trim().toLowerCase()) || null
          const mAlerts: HazardAlertItem[] = []

          if (pickupReport) {
            const pAlerts = evaluatePointHazards(
              `mission_${m.id}_pickup`,
              `Missione ${m.client_vip} [PARTENZA: ${m.pickup_point}]`,
              pickupReport.weather,
              pickupReport.quakes
            )
            mAlerts.push(...pAlerts)
          }

          if (dropoffReport) {
            const dAlerts = evaluatePointHazards(
              `mission_${m.id}_dropoff`,
              `Missione ${m.client_vip} [ARRIVO: ${m.dropoff_point}]`,
              dropoffReport.weather,
              dropoffReport.quakes
            )
            mAlerts.push(...dAlerts)
          }

          combinedAlerts.push(...mAlerts)

          return {
            mission: m,
            pickupReport,
            dropoffReport,
            alerts: mAlerts,
          }
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
      fetchPointEnvironmental,
      geocodePlace,
      evaluatePointHazards,
      dispatchAlertsToBackend,
    ]
  )

  const detectCurrentPosition = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPanelError('Geolocalizzazione GPS non supportata dal browser.')
      refreshEnvironmentalData(null)
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
        await refreshEnvironmentalData(updated)
      },
      (geoErr) => {
        setLoadingGps(false)
        if (geoErr.code === 1) {
          setPanelError(
            'Permesso GPS negato: abilita la posizione nel browser per il monitoraggio locale (monitoraggio tratte comunque attivo).'
          )
        } else {
          setPanelError('Impossibile rilevare la posizione GPS attuale.')
        }
        refreshEnvironmentalData(coordsRef.current)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [persistAdminLocation, refreshEnvironmentalData])

  // Inizializza una sola volta al mount
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
          await refreshEnvironmentalData(saved)
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
              await refreshEnvironmentalData(parsed)
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

  // Aggiorna solo le tratte se cambiano le missioni attive dopo l'avvio
  useEffect(() => {
    if (!isAdmin || !initializedRef.current) return
    if (!activeMissionsSignature) {
      setMissionSummaries([])
      return
    }
    refreshEnvironmentalData(coordsRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMissionsSignature])

  // Auto-refresh ogni 10 minuti
  useEffect(() => {
    if (!isAdmin) return
    const interval = setInterval(() => {
      refreshEnvironmentalData(coordsRef.current)
    }, 10 * 60 * 1000)
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
    <div className="bg-neutral-900 border-2 border-sky-500/70 rounded-lg p-5 shadow-xl space-y-4">
      <div className="flex flex-col gap-3 border-b border-sky-500/30 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-700 text-[10px] font-bold uppercase shrink-0">
              SOLO ADMIN
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-100">
              Meteo Locale, Tratte Missioni &amp; Early Warning Calamita
            </h2>
            <span
              className={
                'px-2 py-0.5 rounded border text-[10px] uppercase font-bold shrink-0 ' +
                (activeAlerts.length > 0
                  ? 'bg-red-950 text-red-300 border-red-600'
                  : 'bg-emerald-950/70 text-emerald-300 border-emerald-700')
              }
            >
              {activeAlerts.length > 0
                ? `${activeAlerts.length} ALLERTE ATTIVE`
                : 'NESSUNA CRITICITA'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loadingGps}
              onClick={detectCurrentPosition}
              className="shrink-0 bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold text-[11px] uppercase px-3 py-1.5 rounded transition disabled:opacity-50"
            >
              {loadingGps ? 'Rilevamento GPS...' : 'Aggiorna Posizione GPS'}
            </button>

            <button
              type="button"
              disabled={checkingFeed}
              onClick={() => refreshEnvironmentalData(coordsRef.current)}
              className="shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 text-[11px] uppercase px-3 py-1.5 rounded transition disabled:opacity-50"
            >
              {checkingFeed ? 'Controllo...' : 'Aggiorna Meteo/Sisma'}
            </button>

            <button
              type="button"
              onClick={handleTriggerTestAlert}
              className="shrink-0 bg-neutral-950 hover:bg-neutral-800 text-amber-300 border border-amber-700/80 text-[11px] uppercase px-3 py-1.5 rounded transition"
            >
              Test Alert Telegram
            </button>
          </div>
        </div>

        <p className="text-xs text-neutral-400">
          Posizione Admin:{' '}
          <strong className="text-neutral-200">
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
        <div className="p-2.5 bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs rounded">
          {statusBanner}
        </div>
      )}

      {panelError && (
        <div className="p-2.5 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded">
          {panelError}
        </div>
      )}

      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((alert) => (
            <div
              key={alert.key}
              className={
                'p-3 rounded-lg border text-xs space-y-1 ' +
                (alert.severity === 'CRITICAL'
                  ? 'bg-red-950/80 border-red-600 text-red-200'
                  : 'bg-amber-950/70 border-amber-600 text-amber-200')
              }
            >
              <div className="flex items-center justify-between gap-2 font-bold uppercase">
                <span>
                  [{alert.severity}] {alert.category} — {alert.title}
                </span>
              </div>
              <div className="text-neutral-200">{alert.details}</div>
            </div>
          ))}
        </div>
      )}

      {weather ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold">Condizioni (Tu)</div>
            <div className="text-neutral-100 font-semibold mt-1">
              {getWeatherDescription(weather.weatherCode)}
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold">Temperatura</div>
            <div className="text-neutral-100 font-bold text-sm mt-1">
              {weather.temperature}°C{' '}
              <span className="text-[11px] font-normal text-neutral-400">
                (perc. {weather.apparentTemperature}°C)
              </span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold">Pioggia / 12h</div>
            <div className="text-neutral-100 font-semibold mt-1">
              {weather.rainNow} mm/h •{' '}
              <span className="text-sky-300">{weather.sumRain12h.toFixed(1)} mm</span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold">Neve / 12h</div>
            <div className="text-neutral-100 font-semibold mt-1">
              {weather.snowfallNow} cm/h •{' '}
              <span className="text-sky-200">{weather.sumSnow12h.toFixed(1)} cm</span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold">Raffiche Vento</div>
            <div className="text-neutral-100 font-semibold mt-1">
              {weather.windGustsNow} km/h{' '}
              <span className="text-[11px] font-normal text-neutral-400">
                (max {weather.maxGusts12h})
              </span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold">
              Sismica (100 km / 24h)
            </div>
            <div className="text-neutral-100 font-semibold mt-1">
              {quakeFeedStatus === 'unavailable'
                ? 'Feed USGS in attesa'
                : quakes.length > 0
                ? `M${quakes[0].magnitude.toFixed(1)} (${quakes[0].distanceKm.toFixed(0)} km)`
                : 'Nessun evento ≥ M3.0'}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-neutral-500 py-1">
          Clicca &quot;Aggiorna Posizione GPS&quot; per attivare il monitoraggio locale sulla tua posizione.
        </div>
      )}

      {missionSummaries.length > 0 && (
        <div className="border-t border-neutral-800 pt-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wider font-bold text-sky-300">
            Monitoraggio Meteo &amp; Sismica — Tratte Missioni Pianificate / In Corso
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {missionSummaries.map(({ mission, pickupReport, dropoffReport, alerts }) => {
              const hasAlert = alerts.length > 0
              const renderEndpointLine = (
                roleLabel: string,
                rawPoint: string,
                rep: EndpointEnvReport | null
              ) => {
                if (!rep) {
                  return (
                    <div className="text-neutral-500">
                      <span className="text-neutral-400 font-semibold">{roleLabel}:</span>{' '}
                      {rawPoint} (coordinate non risolte)
                    </div>
                  )
                }
                const maxQ =
                  rep.quakes.length > 0
                    ? ` | Sisma M${Math.max(...rep.quakes.map((q) => q.magnitude)).toFixed(1)}`
                    : ''
                return (
                  <div className="text-neutral-300">
                    <span className="text-neutral-400 font-semibold">{roleLabel}:</span>{' '}
                    <span className="text-neutral-100">{rawPoint}</span>{' '}
                    <span className="text-neutral-400">
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
                    'bg-neutral-950 border rounded p-3 space-y-1.5 ' +
                    (hasAlert ? 'border-red-600/90' : 'border-neutral-800')
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-neutral-100 uppercase">
                      {mission.client_vip}
                    </span>
                    <span
                      className={
                        'px-2 py-0.5 rounded text-[10px] font-bold uppercase border ' +
                        (hasAlert
                          ? 'bg-red-950 text-red-300 border-red-600'
                          : 'bg-emerald-950/60 text-emerald-300 border-emerald-800')
                      }
                    >
                      {hasAlert ? `${alerts.length} ALLERTE TRATTA` : 'TRATTA REGOLARE'}
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
