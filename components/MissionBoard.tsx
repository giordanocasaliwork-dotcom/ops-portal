 'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../utils/supabase/client'
import MissionRiskPanel, { RiskAssessment, ThreatLevel } from './MissionRiskPanel'

export interface Mission {
  id: string
  created_at: string
  client_vip: string
  start_time: string
  end_time: string
  pickup_point: string
  dropoff_point: string
  assigned_vehicle: string
  assigned_operator_id?: string | null
  assigned_vehicle_id?: string | null
  status: 'pianificata' | 'in corso' | 'chiusa'
  notes?: string | null
}

interface OperatorOption {
  id: string
  email: string
  full_name: string | null
  callsign: string | null
  is_active: boolean
}

interface Vehicle {
  id: string
  callsign: string
  model: string
  plate: string
  category: string
  status: 'available' | 'in_mission' | 'maintenance'
}

interface GpsCheckInRecord {
  time: string
  lat: string
  lng: string
  accuracy: number
}

interface SosAlertRecord {
  time: string
  coords: string | null
  accuracy: number | null
}

interface MissionBoardProps {
  initialMissions: Mission[]
  isAdmin: boolean
  userEmail: string
  userId: string
  onAuditUpdated?: () => void
}

export default function MissionBoard({
  initialMissions,
  isAdmin,
  userEmail,
  userId,
  onAuditUpdated,
}: MissionBoardProps) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [missions, setMissions] = useState<Mission[]>(initialMissions)
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [riskList, setRiskList] = useState<RiskAssessment[]>([])

  const [filter, setFilter] = useState<'tutte' | 'pianificata' | 'in corso' | 'chiusa'>('tutte')
  const [onlyMine, setOnlyMine] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showFleet, setShowFleet] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [lastCheckIns, setLastCheckIns] = useState<{ [id: string]: GpsCheckInRecord }>({})

  const [sosConfirmId, setSosConfirmId] = useState<string | null>(null)
  const [sendingSosId, setSendingSosId] = useState<string | null>(null)
  const [sentSosAlerts, setSentSosAlerts] = useState<{ [id: string]: SosAlertRecord }>({})

  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null)

  const [clientVip, setClientVip] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [pickupPoint, setPickupPoint] = useState('')
  const [dropoffPoint, setDropoffPoint] = useState('')
  const [assignedOperatorId, setAssignedOperatorId] = useState('')
  const [assignedVehicleId, setAssignedVehicleId] = useState('')
  const [manualVehicle, setManualVehicle] = useState('')
  const [notes, setNotes] = useState('')

  const [vehCallsign, setVehCallsign] = useState('')
  const [vehModel, setVehModel] = useState('')
  const [vehPlate, setVehPlate] = useState('')
  const [vehCategory, setVehCategory] = useState('Executive')

  const buildMapsSearchUrl = (query: string) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`
  }

  const buildMapsRouteUrl = (origin: string, destination: string) => {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin.trim())}&destination=${encodeURIComponent(destination.trim())}&travelmode=driving`
  }

  const loadAssets = useCallback(async () => {
    const opsRes = await supabase
      .from('profiles')
      .select('id, email, full_name, callsign, is_active')
      .eq('is_active', true)
      .order('callsign', { ascending: true })

    const vehRes = await supabase
      .from('vehicles')
      .select('*')
      .order('callsign', { ascending: true })

    const riskRes = await supabase.from('mission_risk_assessments').select('*')

    if (opsRes.data) setOperators(opsRes.data)
    if (vehRes.data) setVehicles(vehRes.data)
    if (riskRes.data) setRiskList(riskRes.data)
  }, [supabase])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

  useEffect(() => {
    if (!sosConfirmId) return
    const timer = setTimeout(() => {
      setSosConfirmId(null)
    }, 5000)
    return () => clearTimeout(timer)
  }, [sosConfirmId])

  const formatOperatorLabel = (opId?: string | null) => {
    if (!opId) return 'Non assegnato'
    const op = operators.find((o) => o.id === opId)
    if (!op) return 'Operatore assegnato'
    const name = op.full_name || op.email
    return op.callsign ? `[${op.callsign}] ${name}` : name
  }

  const handleRiskSaved = (missionId: string, updated: RiskAssessment) => {
    setRiskList((prev) => {
      const exists = prev.some((r) => r.mission_id === missionId)
      if (exists) {
        return prev.map((r) => (r.mission_id === missionId ? updated : r))
      }
      return [...prev, updated]
    })
  }

  const handleSosClick = (mission: Mission) => {
    if (sosConfirmId !== mission.id) {
      setSosConfirmId(mission.id)
      return
    }

    setSosConfirmId(null)
    setSendingSosId(mission.id)
    setError(null)

    const me = operators.find((o) => o.id === userId)
    const opTag = me?.callsign ? `[${me.callsign}]` : userEmail

    const dispatchSosLog = async (coordsText: string | null, accuracyVal: number | null) => {
      const locationSuffix = coordsText
        ? `@ ${coordsText} (${accuracyVal}m)`
        : '- POSIZIONE GPS NON DISPONIBILE'

      const { error: logErr } = await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `SOS_EMERGENCY ${opTag} (${mission.client_vip} - ${mission.status.toUpperCase()}) ${locationSuffix}`,
          status: 'SOS',
        },
      ])

      if (logErr) {
        setError('Errore invio segnale SOS al database. Contatta subito il Comando via radio/telefono.')
        setSendingSosId(null)
        return
      }

      const nowTime = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      setSentSosAlerts((prev) => ({
        ...prev,
        [mission.id]: {
          time: nowTime,
          coords: coordsText,
          accuracy: accuracyVal,
        },
      }))
      setSendingSosId(null)
      if (onAuditUpdated) onAuditUpdated()
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      dispatchSosLog(null, null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6)
        const lng = position.coords.longitude.toFixed(6)
        const accuracy = Math.round(position.coords.accuracy)
        dispatchSosLog(`${lat}, ${lng}`, accuracy)
      },
      () => {
        dispatchSosLog(null, null)
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    )
  }

  const handleGpsCheckIn = (mission: Mission) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('Geolocalizzazione GPS non supportata da questo dispositivo.')
      return
    }

    setCheckingInId(mission.id)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toFixed(6)
        const lng = position.coords.longitude.toFixed(6)
        const accuracy = Math.round(position.coords.accuracy)

        const me = operators.find((o) => o.id === userId)
        const opTag = me?.callsign ? `[${me.callsign}]` : userEmail

        const { error: logErr } = await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `CHECKIN_GPS ${opTag} (${mission.client_vip} - ${mission.status.toUpperCase()}) @ ${lat}, ${lng} (${accuracy}m)`,
            status: 'CHECK-IN',
          },
        ])

        if (logErr) {
          setError('Coordinate GPS rilevate ma errore nella registrazione su Audit Log.')
          setCheckingInId(null)
          return
        }

        const nowTime = new Date().toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })

        setLastCheckIns((prev) => ({
          ...prev,
          [mission.id]: { time: nowTime, lat, lng, accuracy },
        }))
        setCheckingInId(null)
        if (onAuditUpdated) onAuditUpdated()
      },
      (geoError) => {
        let msg = 'Impossibile acquisire la posizione GPS.'
        if (geoError.code === 1) {
          msg = 'Permesso GPS negato: autorizza la posizione nelle impostazioni del browser.'
        } else if (geoError.code === 2) {
          msg = 'Segnale GPS non disponibile in questa posizione.'
        } else if (geoError.code === 3) {
          msg = 'Timeout rilevamento GPS. Riprova in area aperta.'
        }
        setError(msg)
        setCheckingInId(null)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const cleanCallsign = vehCallsign.trim().toUpperCase()
      const cleanPlate = vehPlate.trim().toUpperCase()

      const { error: vehErr } = await supabase.from('vehicles').insert([
        {
          callsign: cleanCallsign,
          model: vehModel.trim(),
          plate: cleanPlate,
          category: vehCategory,
          status: 'available',
        },
      ])

      if (vehErr) throw vehErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `FLEET_ADD: [${cleanCallsign}] ${vehModel} (${cleanPlate})`,
          status: 'SUCCESS',
        },
      ])

      setVehCallsign('')
      setVehModel('')
      setVehPlate('')
      setVehCategory('Executive')
      await loadAssets()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore registrazione veicolo in flotta.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVehicle = async (veh: Vehicle) => {
    const { error: delErr } = await supabase.from('vehicles').delete().eq('id', veh.id)
    if (delErr) {
      setError('Impossibile rimuovere il mezzo dalla flotta.')
      return
    }
    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `FLEET_DELETE: [${veh.callsign}] ${veh.plate}`,
        status: 'SUCCESS',
      },
    ])
    await loadAssets()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const selectedVeh = vehicles.find((v) => v.id === assignedVehicleId)
      const vehicleSummary = selectedVeh
        ? `[${selectedVeh.callsign}] ${selectedVeh.model} (${selectedVeh.plate})`
        : manualVehicle.trim()

      if (!vehicleSummary) {
        throw new Error('Seleziona un mezzo dalla flotta o inserisci una descrizione.')
      }

      const { data, error: insertError } = await supabase
        .from('missions')
        .insert([
          {
            client_vip: clientVip,
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            pickup_point: pickupPoint,
            dropoff_point: dropoffPoint,
            assigned_vehicle: vehicleSummary,
            assigned_vehicle_id: selectedVeh ? selectedVeh.id : null,
            assigned_operator_id: assignedOperatorId || null,
            status: 'pianificata',
            notes: notes.trim() || null,
            created_by: userId,
          },
        ])
        .select()
        .single()

      if (insertError) throw insertError

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `MISSION_CREATE (${clientVip})`,
          status: 'SUCCESS',
        },
      ])

      if (data) {
        setMissions((prev) => [data, ...prev])
      }

      setClientVip('')
      setStartTime('')
      setEndTime('')
      setPickupPoint('')
      setDropoffPoint('')
      setAssignedOperatorId('')
      setAssignedVehicleId('')
      setManualVehicle('')
      setNotes('')
      setShowForm(false)
      if (onAuditUpdated) onAuditUpdated()
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Errore durante la creazione della missione.')
    } finally {
      setLoading(false)
    }
  }

  const handleReassignOperator = async (
    missionId: string,
    clientName: string,
    newOpId: string
  ) => {
    const cleanOpId = newOpId || null
    const previous = [...missions]

    setMissions((prev) =>
      prev.map((m) => (m.id === missionId ? { ...m, assigned_operator_id: cleanOpId } : m))
    )

    const { error: updateErr } = await supabase
      .from('missions')
      .update({ assigned_operator_id: cleanOpId })
      .eq('id', missionId)

    if (updateErr) {
      setMissions(previous)
      setError('Impossibile riassegnare operatore.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `MISSION_ASSIGN_OP (${clientName}) -> ${formatOperatorLabel(cleanOpId)}`,
        status: 'SUCCESS',
      },
    ])
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleStatusChange = async (
    missionId: string,
    clientName: string,
    newStatus: 'pianificata' | 'in corso' | 'chiusa'
  ) => {
    const previous = [...missions]
    setMissions((prev) =>
      prev.map((m) => (m.id === missionId ? { ...m, status: newStatus } : m))
    )

    const { error: updateError } = await supabase
      .from('missions')
      .update({ status: newStatus })
      .eq('id', missionId)

    if (updateError) {
      setMissions(previous)
      setError('Impossibile aggiornare lo stato operativo.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: 'MISSION_STATUS -> ' + newStatus.toUpperCase() + ' (' + clientName + ')',
        status: 'SUCCESS',
      },
    ])

    if (onAuditUpdated) onAuditUpdated()
    router.refresh()
  }

  const handleDeleteMission = async (missionId: string, clientName: string) => {
    const previous = [...missions]
    setMissions((prev) => prev.filter((m) => m.id !== missionId))

    const { error: deleteError } = await supabase
      .from('missions')
      .delete()
      .eq('id', missionId)

    if (deleteError) {
      setMissions(previous)
      setError('Errore nella rimozione della missione.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: 'MISSION_DELETE (' + clientName + ')',
        status: 'SUCCESS',
      },
    ])

    if (onAuditUpdated) onAuditUpdated()
    router.refresh()
  }

  const myMissionsCount = missions.filter(
    (m) => m.assigned_operator_id === userId && m.status !== 'chiusa'
  ).length

  const filteredMissions = missions.filter((m) => {
    if (onlyMine && m.assigned_operator_id !== userId) return false
    return filter === 'tutte' ? true : m.status === filter
  })

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusBadge = (status: Mission['status']) => {
    if (status === 'pianificata') return 'bg-amber-950/60 text-amber-300 border-amber-800'
    if (status === 'in corso') return 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
    return 'bg-neutral-800/80 text-neutral-400 border-neutral-700'
  }

  const threatBadge = (level?: ThreatLevel) => {
    if (level === 'CRITICAL') return 'bg-red-950 text-red-300 border-red-700'
    if (level === 'HIGH') return 'bg-orange-950/80 text-orange-300 border-orange-700'
    if (level === 'MODERATE') return 'bg-amber-950/70 text-amber-300 border-amber-700'
    if (level === 'LOW') return 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
    return 'bg-neutral-900 text-neutral-500 border-neutral-800'
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-100">
            Registro Missioni, Flotta &amp; Risk Assessment
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pianificazione movimenti, assegnazione callsign, check-in GPS, SOS e safe havens
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyMine(!onlyMine)}
            className={
              'px-2.5 py-1 rounded text-[11px] uppercase border transition font-semibold ' +
              (onlyMine
                ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:border-neutral-500')
            }
          >
            Le mie missioni ({myMissionsCount})
          </button>

          <span className="text-neutral-700">|</span>

          {(['tutte', 'pianificata', 'in corso', 'chiusa'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={
                'px-2.5 py-1 rounded text-[11px] uppercase border transition ' +
                (filter === tab
                  ? 'bg-neutral-200 text-neutral-950 border-neutral-200 font-bold'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600')
              }
            >
              {tab}
            </button>
          ))}

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowFleet(!showFleet)
                  if (!showFleet) setShowForm(false)
                }}
                className="ml-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
              >
                {showFleet ? 'Chiudi Flotta' : `Flotta (${vehicles.length})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(!showForm)
                  if (!showForm) setShowFleet(false)
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
              >
                {showForm ? 'Chiudi' : '+ Nuova Missione'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
          {error}
        </div>
      )}

      {isAdmin && showFleet && (
        <div className="mt-5 p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-4">
          <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
            Registro Flotta &amp; Assetti Mobili
          </div>

          <form onSubmit={handleAddVehicle} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <input
              type="text"
              required
              value={vehCallsign}
              onChange={(e) => setVehCallsign(e.target.value.toUpperCase())}
              placeholder="Callsign (es. UNIT-01)"
              className="bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 uppercase"
            />
            <input
              type="text"
              required
              value={vehModel}
              onChange={(e) => setVehModel(e.target.value)}
              placeholder="Modello (es. Mercedes V-Class)"
              className="bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
            />
            <input
              type="text"
              required
              value={vehPlate}
              onChange={(e) => setVehPlate(e.target.value.toUpperCase())}
              placeholder="Targa (es. GH123AB)"
              className="bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 uppercase"
            />
            <select
              value={vehCategory}
              onChange={(e) => setVehCategory(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
            >
              <option value="Executive">Executive Sedan / Van</option>
              <option value="Armored">Blindato (B6/B7)</option>
              <option value="Escort">Scorta / Supporto</option>
              <option value="Low-Profile">Low-Profile / Civile</option>
            </select>
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase rounded px-3 py-2 transition"
            >
              + Aggiungi Mezzo
            </button>
          </form>

          {vehicles.length > 0 ? (
            <div className="overflow-x-auto border border-neutral-800 rounded">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900 text-neutral-500 uppercase border-b border-neutral-800">
                  <tr>
                    <th className="px-3 py-2">Callsign</th>
                    <th className="px-3 py-2">Modello</th>
                    <th className="px-3 py-2">Targa</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {vehicles.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 font-bold text-emerald-400">{v.callsign}</td>
                      <td className="px-3 py-2 text-neutral-200">{v.model}</td>
                      <td className="px-3 py-2 text-neutral-300">{v.plate}</td>
                      <td className="px-3 py-2 text-neutral-400">{v.category}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteVehicle(v)}
                          className="text-red-400 hover:text-red-300 text-[11px] uppercase"
                        >
                          Rimuovi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              Nessun mezzo censito in flotta. Inserisci il primo veicolo qui sopra.
            </p>
          )}
        </div>
      )}

      {isAdmin && showForm && (
        <form
          onSubmit={handleCreateMission}
          className="mt-5 p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-4"
        >
          <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
            Nuovo Ordine di Servizio
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Cliente / VIP *
              </label>
              <input
                type="text"
                required
                value={clientVip}
                onChange={(e) => setClientVip(e.target.value)}
                placeholder="Denominazione soggetto o codice"
                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Operatore Assegnato (Callsign)
              </label>
              <select
                value={assignedOperatorId}
                onChange={(e) => setAssignedOperatorId(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
              >
                <option value="">-- Non ancora assegnato --</option>
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.callsign ? `[${op.callsign}] ` : ''}
                    {op.full_name || op.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Mezzo Assegnato (Flotta) *
              </label>
              {vehicles.length > 0 ? (
                <select
                  required
                  value={assignedVehicleId}
                  onChange={(e) => setAssignedVehicleId(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
                >
                  <option value="">-- Seleziona veicolo dal registro --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.callsign}] {v.model} - {v.plate} ({v.category})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  value={manualVehicle}
                  onChange={(e) => setManualVehicle(e.target.value)}
                  placeholder="Modello / Targa / Callsign (oppure censisci in Flotta)"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                  Inizio Finestra *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                  Fine Finestra *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Punto di Prelievo (Pick-up) *
              </label>
              <input
                type="text"
                required
                value={pickupPoint}
                onChange={(e) => setPickupPoint(e.target.value)}
                placeholder="Indirizzo, terminal o coordinate"
                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Punto di Rilascio (Drop-off) *
              </label>
              <input
                type="text"
                required
                value={dropoffPoint}
                onChange={(e) => setDropoffPoint(e.target.value)}
                placeholder="Destinazione o punto di rilascio"
                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase text-neutral-400 mb-1">
              Note Tattiche / Itinerario Alternativo
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Eventuali criticita percorso, safe haven o referenti in loco"
              className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-neutral-200 hover:bg-white text-neutral-950 font-bold text-xs uppercase tracking-wider px-5 py-2 rounded transition disabled:opacity-50"
            >
              {loading ? 'Registrazione...' : 'Conferma e Registra Missione'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-3">
        {filteredMissions.length > 0 ? (
          filteredMissions.map((mission) => {
            const isAssignedToMe = mission.assigned_operator_id === userId
            const risk = riskList.find((r) => r.mission_id === mission.id)
            const isExpanded = expandedRiskId === mission.id
            const isCheckingIn = checkingInId === mission.id
            const lastCheckIn = lastCheckIns[mission.id]
            const isConfirmingSos = sosConfirmId === mission.id
            const isSendingSos = sendingSosId === mission.id
            const sosAlert = sentSosAlerts[mission.id]

            return (
              <div
                key={mission.id}
                className={
                  'bg-neutral-950 border rounded-lg p-4 space-y-4 ' +
                  (sosAlert
                    ? 'border-red-600'
                    : isAssignedToMe
                    ? 'border-emerald-800/80'
                    : 'border-neutral-800/90')
                }
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          'px-2 py-0.5 rounded border text-[10px] uppercase font-bold ' +
                          statusBadge(mission.status)
                        }
                      >
                        {mission.status}
                      </span>
                      <span
                        className={
                          'px-2 py-0.5 rounded border text-[10px] uppercase font-bold ' +
                          threatBadge(risk?.threat_level)
                        }
                      >
                        {risk ? `Rischio: ${risk.threat_level}` : 'Rischio: N/D'}
                      </span>
                      <span className="text-sm font-bold text-neutral-100 uppercase tracking-wide">
                        {mission.client_vip}
                      </span>
                      <span className="text-neutral-600">|</span>
                      <span className="text-neutral-300 font-semibold">
                        Mezzo: {mission.assigned_vehicle}
                      </span>
                      <span className="text-neutral-600">|</span>
                      <span
                        className={
                          'px-2 py-0.5 rounded text-[11px] font-semibold ' +
                          (mission.assigned_operator_id
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/70'
                            : 'bg-neutral-900 text-neutral-400 border border-neutral-800')
                        }
                      >
                        Op: {formatOperatorLabel(mission.assigned_operator_id)}
                      </span>
                    </div>

                    <div className="text-neutral-400">
                      <span className="text-neutral-500">Finestra:</span>{' '}
                      {formatDateTime(mission.start_time)} &rarr; {formatDateTime(mission.end_time)}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-neutral-300">
                      <span className="text-neutral-500">Itinerario:</span>
                      <a
                        href={buildMapsSearchUrl(mission.pickup_point)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-neutral-600 hover:decoration-emerald-400 hover:text-emerald-300 transition"
                      >
                        {mission.pickup_point}
                      </a>
                      <span className="text-emerald-400 font-bold">&rarr;</span>
                      <a
                        href={buildMapsSearchUrl(mission.dropoff_point)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-neutral-600 hover:decoration-emerald-400 hover:text-emerald-300 transition"
                      >
                        {mission.dropoff_point}
                      </a>
                      <a
                        href={buildMapsRouteUrl(mission.pickup_point, mission.dropoff_point)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-emerald-400 border border-emerald-800/70 transition"
                      >
                        Rotta Maps &nearr;
                      </a>
                    </div>

                    {mission.notes && (
                      <div className="text-neutral-400 italic pt-0.5">
                        Note: {mission.notes}
                      </div>
                    )}

                    {lastCheckIn && (
                      <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-sky-300">
                        <span className="px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-800 font-semibold uppercase text-[10px]">
                          Check-in GPS OK {lastCheckIn.time}
                        </span>
                        <span>
                          {lastCheckIn.lat}, {lastCheckIn.lng} ({lastCheckIn.accuracy}m)
                        </span>
                        <a
                          href={buildMapsSearchUrl(`${lastCheckIn.lat},${lastCheckIn.lng}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-sky-600 hover:text-sky-200 font-semibold"
                        >
                          Vedi su Maps &nearr;
                        </a>
                      </div>
                    )}

                    {sosAlert && (
                      <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-red-300">
                        <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold uppercase text-[10px]">
                          ALLERTA SOS INVIATA ({sosAlert.time})
                        </span>
                        <span>
                          {sosAlert.coords
                            ? `${sosAlert.coords} (${sosAlert.accuracy}m)`
                            : 'GPS non disponibile'}
                        </span>
                        {sosAlert.coords && (
                          <a
                            href={buildMapsSearchUrl(sosAlert.coords)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-red-500 hover:text-white font-semibold"
                          >
                            Apri su Maps &nearr;
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                    <button
                      type="button"
                      disabled={isSendingSos}
                      onClick={() => handleSosClick(mission)}
                      title="Doppio clic rapido per inviare allerta SOS con posizione GPS"
                      className={
                        'px-3 py-1.5 rounded text-xs uppercase tracking-wider font-bold border transition ' +
                        (isConfirmingSos
                          ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 animate-pulse'
                          : 'bg-red-950/80 hover:bg-red-900 text-red-300 border-red-700') +
                        ' disabled:opacity-50'
                      }
                    >
                      {isSendingSos
                        ? 'INVIO SOS...'
                        : isConfirmingSos
                        ? 'CONFERMA SOS!'
                        : 'SOS'}
                    </button>

                    <button
                      type="button"
                      disabled={isCheckingIn}
                      onClick={() => handleGpsCheckIn(mission)}
                      className="px-2.5 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition bg-sky-950/60 hover:bg-sky-900/70 text-sky-300 border-sky-700 disabled:opacity-50"
                    >
                      {isCheckingIn ? 'Rilevamento GPS...' : 'Check-in GPS'}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRiskId(isExpanded ? null : mission.id)
                      }
                      className={
                        'px-2.5 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
                        (isExpanded
                          ? 'bg-neutral-200 text-neutral-950 border-neutral-200'
                          : 'bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border-emerald-800/80')
                      }
                    >
                      {isExpanded ? 'Chiudi Scheda' : 'Risk & Safe Havens'}
                    </button>

                    {isAdmin && (
                      <select
                        aria-label="Assegna operatore"
                        value={mission.assigned_operator_id || ''}
                        onChange={(e) =>
                          handleReassignOperator(mission.id, mission.client_vip, e.target.value)
                        }
                        className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-neutral-500"
                      >
                        <option value="">Op: Non assegnato</option>
                        {operators.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.callsign ? `[${op.callsign}] ` : ''}
                            {op.full_name || op.email}
                          </option>
                        ))}
                      </select>
                    )}

                    <select
                      aria-label="Stato missione"
                      value={mission.status}
                      onChange={(e) =>
                        handleStatusChange(
                          mission.id,
                          mission.client_vip,
                          e.target.value as Mission['status']
                        )
                      }
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs uppercase rounded px-2.5 py-1.5 focus:outline-none focus:border-neutral-500"
                    >
                      <option value="pianificata">Pianificata</option>
                      <option value="in corso">In Corso</option>
                      <option value="chiusa">Chiusa</option>
                    </select>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMission(mission.id, mission.client_vip)}
                        className="bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs px-2.5 py-1.5 rounded transition"
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <MissionRiskPanel
                    missionId={mission.id}
                    clientVip={mission.client_vip}
                    startTime={mission.start_time}
                    endTime={mission.end_time}
                    pickupPoint={mission.pickup_point}
                    dropoffPoint={mission.dropoff_point}
                    assignedVehicle={mission.assigned_vehicle}
                    operatorLabel={formatOperatorLabel(mission.assigned_operator_id)}
                    notes={mission.notes}
                    risk={risk}
                    isAdmin={isAdmin}
                    userEmail={userEmail}
                    userId={userId}
                    onRiskSaved={handleRiskSaved}
                  />
                )}
              </div>
            )
          })
        ) : (
          <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
            Nessuna missione presente per il filtro selezionato.
          </div>
        )}
      </div>
    </div>
  )
}
