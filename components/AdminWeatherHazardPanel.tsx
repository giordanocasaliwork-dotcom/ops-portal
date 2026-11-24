'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '../utils/supabase/client'

interface AdminWeatherHazardPanelProps {
  isAdmin: boolean
  userEmail: string
  userId: string
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

export default function AdminWeatherHazardPanel({
  isAdmin,
  userEmail,
  userId,
  onAuditUpdated,
}: AdminWeatherHazardPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  const [coords, setCoords] = useState<CoordinatesState | null>(null)
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [quakes, setQuakes] = useState<QuakeEvent[]>([])
  const [activeAlerts, setActiveAlerts] = useState<HazardAlertItem[]>([])
  const [loadingGps, setLoadingGps] = useState(false)
  const [checkingFeed, setCheckingFeed] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null)
  const [statusBanner, setStatusBanner] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)

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

  const persistAdminLocation = useCallback(
    async (nextCoords: CoordinatesState) => {
      setCoords(nextCoords)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ops_admin_coords', JSON.stringify(nextCoords))
      }
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
    },
    [supabase, userId]
  )

  const dispatchAlertsToBackend = useCallback(
    async (alerts: HazardAlertItem[]) => {
      if (alerts.length === 0) return
      let sentAny = false

      for (const item of alerts) {
        const { data, error } = await supabase.rpc('dispatch_admin_hazard_alert', {
          p_alert_key: item.key,
          p_severity: item.severity,
          p_title: item.title,
          p_details: item.details,
        })
        if (!error && data === 'DISPATCHED') {
          sentAny = true
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

  const evaluateHazards = useCallback(
    (
      loc: CoordinatesState,
      w: WeatherSnapshot,
      recentQuakes: QuakeEvent[]
    ): HazardAlertItem[] => {
      const alerts: HazardAlertItem[] = []
      const dateBucket = new Date().toISOString().slice(0, 10)
      const locKey = `${loc.lat.toFixed(1)}_${loc.lng.toFixed(1)}`

      // 1. Piogge alluvionali / Nubifragi / Temporali violenti
      if (
        w.rainNow >= 15 ||
        w.maxRain12h >= 20 ||
        w.sumRain12h >= 45 ||
        [82, 96, 99].includes(w.weatherCode)
      ) {
        const isCritical = w.rainNow >= 25 || w.sumRain12h >= 70 || w.weatherCode === 99
        alerts.push({
          key: `flood_${locKey}_${dateBucket}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'IDROGEOLOGICO / NUBIFRAGIO',
          title: `Allerta Piogge Intense / Rischio Alluvionale (${loc.label})`,
          details: `Precipitazione attuale: ${w.rainNow} mm/h | Picco 12h: ${w.maxRain12h} mm/h | Accumulo 12h: ${w.sumRain12h.toFixed(
            1
          )} mm (${getWeatherDescription(w.weatherCode)}).`,
        })
      }

      // 2. Caldo estremo
      if (w.temperature >= 37 || w.apparentTemperature >= 39 || w.maxTemp12h >= 38) {
        const peak = Math.max(w.temperature, w.apparentTemperature, w.maxTemp12h)
        const isCritical = peak >= 40
        alerts.push({
          key: `heat_${locKey}_${dateBucket}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'ONDATA DI CALORE',
          title: `Allerta Caldo Estremo (${loc.label})`,
          details: `Temperatura attuale: ${w.temperature}°C (percepita ${w.apparentTemperature}°C) | Massima prevista 12h: ${w.maxTemp12h}°C.`,
        })
      }

      // 3. Forti nevicate / Gelicidio / Freddo estremo
      if (
        w.snowfallNow >= 4 ||
        w.sumSnow12h >= 15 ||
        [56, 57, 66, 67, 75, 86].includes(w.weatherCode) ||
        w.minTemp12h <= -8
      ) {
        const isCritical = w.sumSnow12h >= 25 || [67, 75, 86].includes(w.weatherCode) || w.minTemp12h <= -12
        alerts.push({
          key: `snow_ice_${locKey}_${dateBucket}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'NEVE / GELO SEVERO',
          title: `Allerta Neve Intensa / Ghiaccio (${loc.label})`,
          details: `Neve attuale: ${w.snowfallNow} cm/h | Accumulo neve 12h: ${w.sumSnow12h.toFixed(
            1
          )} cm | Minima 12h: ${w.minTemp12h}°C (${getWeatherDescription(w.weatherCode)}).`,
        })
      }

      // 4. Venti di burrasca / Tempesta
      if (w.windGustsNow >= 75 || w.maxGusts12h >= 80) {
        const maxGust = Math.max(w.windGustsNow, w.maxGusts12h)
        const isCritical = maxGust >= 95
        alerts.push({
          key: `wind_${locKey}_${dateBucket}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'VENTO FORTE / TEMPESTA',
          title: `Allerta Raffiche di Vento Intense (${loc.label})`,
          details: `Raffiche attuali: ${w.windGustsNow} km/h | Picco previsto 12h: ${w.maxGusts12h} km/h.`,
        })
      }

      // 5. Terremoti recenti entro 100 km (magnitudo >= 3.5)
      const significantQuakes = recentQuakes.filter((q) => q.magnitude >= 3.5)
      if (significantQuakes.length > 0) {
        const strongest = significantQuakes.sort((a, b) => b.magnitude - a.magnitude)[0]
        const isCritical = strongest.magnitude >= 4.5
        alerts.push({
          key: `quake_${strongest.id}`,
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'ALLERTA SISMICA',
          title: `Terremoto M${strongest.magnitude.toFixed(1)} rilevato a ${strongest.distanceKm.toFixed(
            0
          )} km (${loc.label})`,
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
    async (targetCoords: CoordinatesState) => {
      setCheckingFeed(true)
      setPanelError(null)

      try {
        // 1. Meteo attuale + prossime 12 ore via Open-Meteo (zero API key)
        const meteoUrl =
          `https://api.open-meteo.com/v1/forecast?latitude=${targetCoords.lat}&longitude=${targetCoords.lng}` +
          `&current=temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_gusts_10m` +
          `&hourly=temperature_2m,precipitation,snowfall,wind_gusts_10m` +
          `&forecast_hours=12&timezone=auto`

        // 2. Sismica ultime 24 ore entro 100 km (magnitudo >= 3.0) via USGS
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const quakeUrl =
          `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
          `&latitude=${targetCoords.lat}&longitude=${targetCoords.lng}` +
          `&maxradiuskm=100&minmagnitude=3.0&starttime=${encodeURIComponent(sinceIso)}`

        const [meteoRes, quakeRes] = await Promise.all([fetch(meteoUrl), fetch(quakeUrl)])

        if (!meteoRes.ok) {
          throw new Error(`Errore feed meteo (${meteoRes.status}).`)
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
          maxTemp12h: hourlyTemp.length > 0 ? Math.max(...hourlyTemp) : Number(curr.temperature_2m ?? 0),
          minTemp12h: hourlyTemp.length > 0 ? Math.min(...hourlyTemp) : Number(curr.temperature_2m ?? 0),
        }

        let parsedQuakes: QuakeEvent[] = []
        if (quakeRes.ok) {
          const quakeJson = (await quakeRes.json()) as {
            features?: Array<{
              id: string
              properties?: { mag?: number; place?: string; time?: number }
              geometry?: { coordinates?: [number, number, number] }
            }>
          }

          parsedQuakes = (quakeJson.features || [])
            .map((f) => {
              const qLng = f.geometry?.coordinates?.[0] ?? targetCoords.lng
              const qLat = f.geometry?.coordinates?.[1] ?? targetCoords.lat
              return {
                id: f.id,
                magnitude: Number(f.properties?.mag ?? 0),
                place: String(f.properties?.place || 'Area limitrofa'),
                time: Number(f.properties?.time ?? Date.now()),
                distanceKm: haversineKm(targetCoords.lat, targetCoords.lng, qLat, qLng),
              }
            })
            .sort((a, b) => b.time - a.time)
        }

        setWeather(snapshot)
        setQuakes(parsedQuakes)
        setLastCheckTime(
          new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        )

        const detected = evaluateHazards(targetCoords, snapshot, parsedQuakes)
        setActiveAlerts(detected)

        if (detected.length > 0) {
          await dispatchAlertsToBackend(detected)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Errore aggiornamento meteo/calamita.'
        setPanelError(msg)
      } finally {
        setCheckingFeed(false)
      }
    },
    [evaluateHazards, dispatchAlertsToBackend]
  )

  const detectCurrentPosition = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPanelError('Geolocalizzazione GPS non supportata dal browser.')
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
          setPanelError('Permesso GPS negato: abilita la posizione nel browser per il monitoraggio locale.')
        } else {
          setPanelError('Impossibile rilevare la posizione GPS attuale.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [persistAdminLocation, refreshEnvironmentalData])

  // Ripristina ultima posizione salvata o avvia GPS all'apertura
  useEffect(() => {
    if (!isAdmin) return

    let cancelled = false

    const init = async () => {
      // 1. Prova da Supabase
      const { data } = await supabase
        .from('admin_hazard_state')
        .select('latitude, longitude, location_label, updated_at')
        .eq('user_id', userId)
        .maybeSingle()

      if (!cancelled && data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        const saved: CoordinatesState = {
          lat: data.latitude,
          lng: data.longitude,
          label: data.location_label || `${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`,
          updatedAt: data.updated_at || new Date().toISOString(),
        }
        setCoords(saved)
        await refreshEnvironmentalData(saved)
        return
      }

      // 2. Fallback localStorage
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem('ops_admin_coords')
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CoordinatesState
            if (!cancelled && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
              setCoords(parsed)
              await refreshEnvironmentalData(parsed)
              return
            }
          } catch {
            // ignora
          }
        }
      }

      // 3. Prima attivazione: richiedi GPS
      if (!cancelled) {
        detectCurrentPosition()
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [isAdmin, supabase, userId, refreshEnvironmentalData, detectCurrentPosition])

  // Auto-refresh ogni 10 minuti
  useEffect(() => {
    if (!isAdmin || !coords) return
    const interval = setInterval(() => {
      refreshEnvironmentalData(coords)
    }, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [isAdmin, coords, refreshEnvironmentalData])

  const handleTriggerTestAlert = async () => {
    const locLabel = coords?.label || 'Posizione Admin'
    const testKey = `test_alert_${Date.now()}`
    const { data, error } = await supabase.rpc('dispatch_admin_hazard_alert', {
      p_alert_key: testKey,
      p_severity: 'HIGH',
      p_title: `Test Sistema Allerta Meteo & Calamita (${locLabel})`,
      p_details: `Verifica operativa attivata da ${userEmail}. Coordinate monitorate: ${
        coords ? `${coords.lat}, ${coords.lng}` : 'N/D'
      }.`,
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
  }

  if (!isAdmin) return null

  return (
    <div className="bg-neutral-900 border-2 border-sky-500/70 rounded-lg p-5 shadow-xl space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-sky-500/30 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-700 text-[10px] font-bold uppercase">
              SOLO ADMIN
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-100">
              Meteo Locale &amp; Early Warning Calamita Naturali
            </h2>
            <span
              className={
                'px-2 py-0.5 rounded border text-[10px] uppercase font-bold ' +
                (activeAlerts.length > 0
                  ? 'bg-red-950 text-red-300 border-red-600 animate-pulse'
                  : 'bg-emerald-950/70 text-emerald-300 border-emerald-700')
              }
            >
              {activeAlerts.length > 0
                ? `${activeAlerts.length} ALLERTE ATTIVE`
                : 'NESSUNA CRITICITA'}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Posizione monitorata:{' '}
            <strong className="text-neutral-200">
              {coords ? `${coords.label} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : 'In attesa di GPS...'}
            </strong>
            {lastCheckTime ? ` • Ultimo check: ${lastCheckTime}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loadingGps}
            onClick={detectCurrentPosition}
            className="bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold text-xs uppercase px-3 py-1.5 rounded transition disabled:opacity-50"
          >
            {loadingGps ? 'Rilevamento GPS...' : 'Aggiorna Posizione GPS'}
          </button>

          {coords && (
            <button
              type="button"
              disabled={checkingFeed}
              onClick={() => refreshEnvironmentalData(coords)}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 text-xs uppercase px-3 py-1.5 rounded transition disabled:opacity-50"
            >
              {checkingFeed ? 'Controllo...' : 'Aggiorna Meteo/Sisma'}
            </button>
          )}

          <button
            type="button"
            onClick={handleTriggerTestAlert}
            className="bg-neutral-950 hover:bg-neutral-800 text-amber-300 border border-amber-700/80 text-xs uppercase px-3 py-1.5 rounded transition"
          >
            Test Alert Telegram
          </button>
        </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold">Condizioni</div>
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
            <div className="text-[10px] uppercase text-neutral-500 font-bold">Sismica (100 km / 24h)</div>
            <div className="text-neutral-100 font-semibold mt-1">
              {quakes.length > 0
                ? `M${quakes[0].magnitude.toFixed(1)} (${quakes[0].distanceKm.toFixed(0)} km)`
                : 'Nessun evento ≥ M3.0'}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-neutral-500 py-2">
          Clicca &quot;Aggiorna Posizione GPS&quot; per attivare il monitoraggio ambientale e sismico locale.
        </div>
      )}
    </div>
  )
}
