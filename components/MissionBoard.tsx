 'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../utils/supabase/client'

export interface RouteLeg {
  leg_number: number
  transport_mode: string
  origin: string
  destination: string
  carrier_code?: string
  departure_time?: string
  arrival_time?: string
  notes?: string
}

export interface MissionDebriefing {
  outcome: 'REGOLARE' | 'CRITICITA LIEVI' | 'ANOMALIA SICUREZZA'
  actual_end_time: string
  vehicle_condition: string
  operational_summary: string
  incidents_notes?: string
  operator_email: string
  operator_label: string
  submitted_at: string
}

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
  route_legs?: RouteLeg[] | null
  closed_at?: string | null
  closed_by?: string | null
  debriefing?: MissionDebriefing | null
  debriefing_completed_at?: string | null
}

export type ThreatLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export interface RiskAssessment {
  mission_id: string
  threat_level: ThreatLevel
  choke_points: string | null
  safe_havens: string | null
  medical_facilities: string | null
  evacuation_route: string | null
  emergency_contacts: string | null
  updated_at?: string
}

export interface ExecutiveBrief {
  mission_id: string
  counterpart_name: string | null
  counterpart_role: string | null
  meeting_objective: string | null
  talking_points: string | null
  travel_booking_ref: string | null
  hospitality_details: string | null
  confidential_notes: string | null
  updated_at?: string
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return fallback
}

function formatLegsSummaryLines(legs?: RouteLeg[] | null): string[] {
  if (!Array.isArray(legs) || legs.length === 0) return []
  return legs.map((leg, idx) => {
    const num = leg.leg_number || idx + 1
    const mode = (leg.transport_mode || 'Trasferimento').toUpperCase()
    const carrier = leg.carrier_code ? ` [${leg.carrier_code}]` : ''
    const dep = leg.departure_time
      ? new Date(leg.departure_time).toLocaleString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
    const arr = leg.arrival_time
      ? new Date(leg.arrival_time).toLocaleString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
    const timing = dep || arr ? ` (${dep || '?'} -> ${arr || '?'})` : ''
    const note = leg.notes ? ` - ${leg.notes}` : ''
    return `Tappa ${num} [${mode}]${carrier}: ${leg.origin} -> ${leg.destination}${timing}${note}`
  })
}

interface MissionDebriefingPanelProps {
  mission: Mission
  canCompile: boolean
  operatorLabel: string
  userEmail: string
  onDebriefingSaved: (updatedMission: Mission) => void
  onAuditUpdated?: () => void
}

function MissionDebriefingPanel({
  mission,
  canCompile,
  operatorLabel,
  userEmail,
  onDebriefingSaved,
  onAuditUpdated,
}: MissionDebriefingPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  const toLocalNow = (iso?: string | null) => {
    const d = iso ? new Date(iso) : new Date()
    const valid = Number.isNaN(d.getTime()) ? new Date() : d
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}T${pad(
      valid.getHours()
    )}:${pad(valid.getMinutes())}`
  }

  const [outcome, setOutcome] = useState<'REGOLARE' | 'CRITICITA LIEVI' | 'ANOMALIA SICUREZZA'>(
    'REGOLARE'
  )
  const [actualEndTime, setActualEndTime] = useState(() => toLocalNow(mission.closed_at))
  const [vehicleCondition, setVehicleCondition] = useState('')
  const [operationalSummary, setOperationalSummary] = useState('')
  const [incidentsNotes, setIncidentsNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedDebrief, setCopiedDebrief] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)

  const existing = mission.debriefing

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const handleSubmitDebriefing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canCompile) return
    setSaving(true)
    setPanelError(null)

    try {
      const nowIso = new Date().toISOString()
      const debriefPayload: MissionDebriefing = {
        outcome,
        actual_end_time: actualEndTime ? new Date(actualEndTime).toISOString() : nowIso,
        vehicle_condition: vehicleCondition.trim(),
        operational_summary: operationalSummary.trim(),
        incidents_notes: incidentsNotes.trim() || undefined,
        operator_email: userEmail,
        operator_label: operatorLabel,
        submitted_at: nowIso,
      }

      const { data, error } = await supabase
        .from('missions')
        .update({
          debriefing: debriefPayload,
          debriefing_completed_at: nowIso,
        })
        .eq('id', mission.id)
        .select()
        .single()

      if (error) throw error

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `MISSION_DEBRIEFING_ARCHIVED (${mission.client_vip}) -> ${outcome}`,
          status: 'SUCCESS',
        },
      ])

      if (data) {
        onDebriefingSaved(data as Mission)
      }
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: unknown) {
      setPanelError(getErrorMessage(err, 'Errore durante il salvataggio del Débriefing Operativo.'))
    } finally {
      setSaving(false)
    }
  }

  const handleCopyDebrief = async () => {
    if (!existing) return
    const lines = [
      `DEBRIEFING OPERATIVO ARCHIVIATO - ${mission.client_vip.toUpperCase()}`,
      `Esito Missione: ${existing.outcome}`,
      `Conclusione Effettiva: ${formatDateTime(existing.actual_end_time)}`,
      `Operatore Esecutore: ${existing.operator_label} (${existing.operator_email})`,
      `Stato Mezzo & Dotazioni: ${existing.vehicle_condition || 'Regolare'}`,
      `Resoconto Operativo:\n${existing.operational_summary}`,
      existing.incidents_notes ? `Criticita / Note Future:\n${existing.incidents_notes}` : null,
      `Archiviato il: ${formatDateTime(existing.submitted_at)}`,
    ].filter(Boolean)

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedDebrief(true)
      setTimeout(() => setCopiedDebrief(false), 2000)
    } catch {
      setPanelError('Impossibile copiare il débriefing negli appunti.')
    }
  }

  return (
    <div className="border-t border-emerald-700/60 pt-4 bg-neutral-900/90 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              'px-2.5 py-0.5 rounded-md border text-xs font-bold uppercase ' +
              (existing
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/50')
            }
          >
            {existing ? 'Archiviata nel Registro' : 'Débriefing Obbligatorio'}
          </span>
          <span className="text-xs sm:text-sm uppercase tracking-wider font-bold text-white">
            Débriefing Operativo Post-Missione
          </span>
        </div>

        {existing && (
          <button
            type="button"
            onClick={handleCopyDebrief}
            className="min-h-[36px] bg-neutral-950 hover:bg-neutral-800 text-emerald-300 border border-emerald-700/70 text-xs font-semibold uppercase px-3.5 py-1.5 rounded-lg transition"
          >
            {copiedDebrief ? 'Débriefing Copiato' : 'Copia Débriefing'}
          </button>
        )}
      </div>

      {panelError && (
        <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-sm rounded-lg">
          {panelError}
        </div>
      )}

      {existing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-sm">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-bold mb-1">
              Esito Generale &amp; Orario Conclusione
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  'px-2.5 py-0.5 rounded-md border text-xs font-bold uppercase ' +
                  (existing.outcome === 'ANOMALIA SICUREZZA'
                    ? 'bg-red-950 text-red-300 border-red-700'
                    : existing.outcome === 'CRITICITA LIEVI'
                    ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-700')
                }
              >
                {existing.outcome}
              </span>
              <span className="font-mono text-neutral-200 text-xs sm:text-sm">
                {formatDateTime(existing.actual_end_time)}
              </span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-bold mb-1">
              Operatore Esecutore &amp; Archiviazione
            </div>
            <div className="text-white font-semibold">{existing.operator_label}</div>
            <div className="text-xs font-mono text-neutral-400 mt-0.5">
              Registrato il {formatDateTime(existing.submitted_at)}
            </div>
          </div>

          <div className="md:col-span-2 bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-emerald-400 font-bold mb-1">
              Stato Mezzo, Chilometraggio &amp; Dotazioni
            </div>
            <div className="text-neutral-100 whitespace-pre-line">
              {existing.vehicle_condition || 'Nessuna annotazione sul mezzo.'}
            </div>
          </div>

          <div className="md:col-span-2 bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-emerald-400 font-bold mb-1">
              Relazione Svolgimento Missione
            </div>
            <div className="text-neutral-100 whitespace-pre-line leading-relaxed">
              {existing.operational_summary}
            </div>
          </div>

          {existing.incidents_notes && (
            <div className="md:col-span-2 bg-amber-950/25 border border-amber-800/70 rounded-xl p-3.5">
              <div className="text-xs uppercase text-amber-300 font-bold mb-1">
                Criticità Rilevate / Note per Pianificazioni Future
              </div>
              <div className="text-amber-100 whitespace-pre-line leading-relaxed">
                {existing.incidents_notes}
              </div>
            </div>
          )}
        </div>
      ) : canCompile ? (
        <form onSubmit={handleSubmitDebriefing} className="space-y-3.5 text-sm">
          <div className="p-3 bg-amber-950/40 border border-amber-700/70 rounded-lg text-amber-200 text-xs sm:text-sm">
            La missione è chiusa e bloccata. Compila il rapporto finale qui sotto per archiviare definitivamente la missione nel <strong>Registro Missioni</strong>.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Esito Generale Servizio *
              </label>
              <select
                value={outcome}
                onChange={(e) =>
                  setOutcome(
                    e.target.value as 'REGOLARE' | 'CRITICITA LIEVI' | 'ANOMALIA SICUREZZA'
                  )
                }
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              >
                <option value="REGOLARE">REGOLARE — Nessuna anomalia</option>
                <option value="CRITICITA LIEVI">CRITICITÀ LIEVI — Ritardi / Viabilità</option>
                <option value="ANOMALIA SICUREZZA">ANOMALIA SICUREZZA — Evento rilevante</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Ora Effettiva Rientro / Conclusione *
              </label>
              <input
                type="datetime-local"
                required
                value={actualEndTime}
                onChange={(e) => setActualEndTime(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Stato Mezzo, Rifornimento &amp; Dotazioni Bordo *
              </label>
              <input
                type="text"
                required
                value={vehicleCondition}
                onChange={(e) => setVehicleCondition(e.target.value)}
                placeholder="Es. Mezzo integro, serbatoio 3/4, kit medico e dotazioni verificati"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Relazione Operativa Svolgimento Missione *
              </label>
              <textarea
                rows={4}
                required
                value={operationalSummary}
                onChange={(e) => setOperationalSummary(e.target.value)}
                placeholder="Descrivi l'andamento del movimento, puntualità pick-up/drop-off, condizioni itinerario, accoglienza e rispetto protocolli."
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Criticità Rilevate / Suggerimenti per Missioni Future (Opzionale)
              </label>
              <textarea
                rows={2}
                value={incidentsNotes}
                onChange={(e) => setIncidentsNotes(e.target.value)}
                placeholder="Segnala eventuali choke points, cantieri, accessi difficoltosi o accorgimenti per il prossimo servizio."
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-5 py-2 rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Archiviazione in corso...' : 'Conferma Débriefing & Archivia'}
            </button>
          </div>
        </form>
      ) : (
        <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-300">
          In attesa che l&apos;operatore esecutore (<strong>{operatorLabel}</strong>) compili il Débriefing Operativo per completare l&apos;archiviazione nel Registro.
        </div>
      )}
    </div>
  )
}

interface MissionRiskPanelProps {
  missionId: string
  clientVip: string
  startTime: string
  endTime: string
  pickupPoint: string
  dropoffPoint: string
  assignedVehicle: string
  operatorLabel: string
  notes?: string | null
  routeLegs?: RouteLeg[] | null
  risk?: RiskAssessment
  isAdmin: boolean
  isLockedClosed: boolean
  isAnalyzingAi: boolean
  userEmail: string
  userId: string
  onRunAiAnalysis: () => void
  onPrintMission: () => void
  onRiskSaved: (missionId: string, updated: RiskAssessment) => void
  onAuditUpdated?: () => void
}

function MissionRiskPanel({
  missionId,
  clientVip,
  startTime,
  endTime,
  pickupPoint,
  dropoffPoint,
  assignedVehicle,
  operatorLabel,
  notes,
  routeLegs,
  risk,
  isAdmin,
  isLockedClosed,
  isAnalyzingAi,
  userEmail,
  userId,
  onRunAiAnalysis,
  onPrintMission,
  onRiskSaved,
  onAuditUpdated,
}: MissionRiskPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  const [editing, setEditing] = useState(!risk && isAdmin && !isLockedClosed)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)

  const [threatLevel, setThreatLevel] = useState<ThreatLevel>(risk?.threat_level || 'LOW')
  const [chokePoints, setChokePoints] = useState(risk?.choke_points || '')
  const [safeHavens, setSafeHavens] = useState(risk?.safe_havens || '')
  const [medicalFacilities, setMedicalFacilities] = useState(risk?.medical_facilities || '')
  const [evacuationRoute, setEvacuationRoute] = useState(risk?.evacuation_route || '')
  const [emergencyContacts, setEmergencyContacts] = useState(risk?.emergency_contacts || '')

  useEffect(() => {
    if (risk) {
      setThreatLevel(risk.threat_level || 'LOW')
      setChokePoints(risk.choke_points || '')
      setSafeHavens(risk.safe_havens || '')
      setMedicalFacilities(risk.medical_facilities || '')
      setEvacuationRoute(risk.evacuation_route || '')
      setEmergencyContacts(risk.emergency_contacts || '')
      setEditing(false)
    }
  }, [risk])

  useEffect(() => {
    if (isLockedClosed) setEditing(false)
  }, [isLockedClosed])

  const buildMapsSearchUrl = (query: string) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`
  }

  const buildMapsRouteUrl = (origin: string, destination: string) => {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin.trim())}&destination=${encodeURIComponent(destination.trim())}&travelmode=driving`
  }

  const parseLines = (raw: string | null | undefined): string[] => {
    if (!raw) return []
    return raw
      .split('\n')
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((line) => line.length > 0)
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLockedClosed) return
    setSaving(true)
    setPanelError(null)

    try {
      const payload = {
        mission_id: missionId,
        threat_level: threatLevel,
        choke_points: chokePoints.trim() || null,
        safe_havens: safeHavens.trim() || null,
        medical_facilities: medicalFacilities.trim() || null,
        evacuation_route: evacuationRoute.trim() || null,
        emergency_contacts: emergencyContacts.trim() || null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }

      const { data, error } = await supabase
        .from('mission_risk_assessments')
        .upsert(payload, { onConflict: 'mission_id' })
        .select()
        .single()

      if (error) throw error

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `RISK_ASSESSMENT_UPDATE (${clientVip}) -> ${threatLevel}`,
          status: 'SUCCESS',
        },
      ])

      if (data) {
        onRiskSaved(missionId, data as RiskAssessment)
      }
      if (onAuditUpdated) onAuditUpdated()
      setEditing(false)
    } catch (err: unknown) {
      setPanelError(getErrorMessage(err, 'Errore salvataggio scheda Risk Assessment.'))
    } finally {
      setSaving(false)
    }
  }

  const handleCopyBriefing = async () => {
    const legLines = formatLegsSummaryLines(routeLegs)
    const lines = [
      `BRIEFING LOGISTICO & SICUREZZA - ${clientVip.toUpperCase()}`,
      `Finestra: ${formatDate(startTime)} -> ${formatDate(endTime)}`,
      `Tratta Generale: ${pickupPoint} -> ${dropoffPoint}`,
      legLines.length > 0 ? `\nPIANO DI VIAGGIO MULTIMODALE:\n${legLines.join('\n')}` : null,
      `Rotta Maps: ${buildMapsRouteUrl(pickupPoint, dropoffPoint)}`,
      `Assetto: ${assignedVehicle} | Op: ${operatorLabel}`,
      `Livello Rischio: ${risk?.threat_level || 'NON VALUTATO'}`,
      risk?.choke_points ? `\nCHOKE POINTS & COUNTRY INTELLIGENCE:\n${risk.choke_points}` : null,
      risk?.safe_havens ? `\nSAFE HAVENS (FFOO / AMBASCIATE):\n${risk.safe_havens}` : null,
      risk?.medical_facilities ? `\nSTRUTTURE SANITARIE / DEA:\n${risk.medical_facilities}` : null,
      risk?.evacuation_route ? `\nPIANO B / ESFILTRAZIONE:\n${risk.evacuation_route}` : null,
      risk?.emergency_contacts ? `\nContatti Emergenza: ${risk.emergency_contacts}` : null,
      notes ? `Note Logistica: ${notes}` : null,
    ].filter(Boolean)

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setPanelError('Impossibile copiare il briefing negli appunti.')
    }
  }

  const safeHavenList = parseLines(risk?.safe_havens)
  const medicalList = parseLines(risk?.medical_facilities)

  return (
    <div className="border-t border-neutral-800 pt-4 bg-neutral-900/70 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-xs sm:text-sm uppercase tracking-wider font-bold text-emerald-400">
          Intelligence • Risk Assessment, Country Profile, Safe Havens &amp; Piano B
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && !isLockedClosed && (
            <button
              type="button"
              disabled={isAnalyzingAi}
              onClick={onRunAiAnalysis}
              className="min-h-[38px] bg-sky-400 hover:bg-sky-300 text-neutral-950 font-bold text-xs uppercase px-3.5 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {isAnalyzingAi
                ? 'Analisi AI in corso...'
                : risk
                ? 'Aggiorna Analisi AI'
                : 'Genera Analisi AI'}
            </button>
          )}
          <button
            type="button"
            onClick={onPrintMission}
            className="min-h-[38px] bg-neutral-200 hover:bg-white text-neutral-950 font-bold text-xs uppercase px-3.5 py-1.5 rounded-lg transition"
          >
            PDF / Stampa
          </button>
          <button
            type="button"
            onClick={handleCopyBriefing}
            className="min-h-[38px] bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs font-semibold uppercase px-3.5 py-1.5 rounded-lg transition"
          >
            {copied ? 'Briefing Copiato' : 'Copia Briefing'}
          </button>
          {isAdmin && !isLockedClosed && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-[38px] bg-neutral-950 hover:bg-neutral-800 text-emerald-300 border border-emerald-700/70 text-xs uppercase px-3.5 py-1.5 rounded-lg transition font-semibold"
            >
              {risk ? 'Modifica' : 'Compila Manuale'}
            </button>
          )}
        </div>
      </div>

      {isAnalyzingAi && (
        <div className="p-3.5 bg-sky-950/60 border border-sky-700 text-sky-200 text-sm rounded-lg">
          Valutazione tattica server-side in corso: analisi tappe multimodali, profilo Paese estero, choke points, Safe Havens, DEA e Piano B...
        </div>
      )}

      {panelError && (
        <div className="p-3 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-lg">
          {panelError}
        </div>
      )}

      {isAdmin && !isLockedClosed && editing ? (
        <form onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Livello Minaccia Stimato *
              </label>
              <select
                value={threatLevel}
                onChange={(e) => setThreatLevel(e.target.value as ThreatLevel)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              >
                <option value="LOW">LOW (Basso - Ordinario)</option>
                <option value="MODERATE">MODERATE (Moderato - Attenzione)</option>
                <option value="HIGH">HIGH (Alto - Protocolli Rafforzati)</option>
                <option value="CRITICAL">CRITICAL (Critico - Massima Allerta)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Contatti Emergenza / Ambasciate / Sala Operativa
              </label>
              <input
                type="text"
                value={emergencyContacts}
                onChange={(e) => setEmergencyContacts(e.target.value)}
                placeholder="Es. NUE 112 - Ambasciata d'Italia - Unita di Crisi +39 06 36225"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Choke Points, Tappe &amp; Country Intelligence
              </label>
              <textarea
                rows={4}
                value={chokePoints}
                onChange={(e) => setChokePoints(e.target.value)}
                placeholder="Analisi tappe, valichi/terminal, profilo Paese (valuta, vaccini, norme), choke points"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Safe Havens, Presidi FFOO &amp; Ambasciate (uno per riga)
              </label>
              <textarea
                rows={4}
                value={safeHavens}
                onChange={(e) => setSafeHavens(e.target.value)}
                placeholder="Es. Ambasciata d'Italia Nairobi"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Strutture Sanitarie / DEA (uno per riga)
              </label>
              <textarea
                rows={3}
                value={medicalFacilities}
                onChange={(e) => setMedicalFacilities(e.target.value)}
                placeholder="Es. Aga Khan University Hospital Nairobi"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Piano B — Itinerario Alternativo &amp; Esfiltrazione
              </label>
              <textarea
                rows={3}
                value={evacuationRoute}
                onChange={(e) => setEvacuationRoute(e.target.value)}
                placeholder="Percorso secondario, riprotezione voli/treni e vie di esfiltrazione"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-1">
            {risk && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-[38px] bg-neutral-950 text-neutral-300 border border-neutral-700 text-xs uppercase px-4 py-1.5 rounded-lg font-semibold"
              >
                Annulla
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="min-h-[38px] bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs uppercase px-5 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva Scheda Risk Assessment'}
            </button>
          </div>
        </form>
      ) : risk ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-sm">
          <div className="md:col-span-2 bg-neutral-950 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs uppercase text-amber-400 font-bold mb-2">
              Country Intelligence, Analisi Tappe &amp; Choke Points (Percorso A)
            </div>
            <div className="text-neutral-100 whitespace-pre-line leading-relaxed">
              {risk.choke_points || 'Nessuna criticita segnalata.'}
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs uppercase text-emerald-400 font-bold mb-2">
              Safe Havens, Presidi FFOO &amp; Ambasciate
            </div>
            {safeHavenList.length > 0 ? (
              <div className="space-y-2">
                {safeHavenList.map((entry, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2">
                    <span className="text-neutral-100">{entry}</span>
                    <a
                      href={buildMapsSearchUrl(entry)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs uppercase font-bold px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-emerald-400 border border-emerald-800/70 transition"
                    >
                      Maps ↗
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-neutral-400">Nessun safe haven censito.</div>
            )}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs uppercase text-sky-400 font-bold mb-2">
              Strutture Sanitarie / DEA Lungo Tratta
            </div>
            {medicalList.length > 0 ? (
              <div className="space-y-2">
                {medicalList.map((entry, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2">
                    <span className="text-neutral-100">{entry}</span>
                    <a
                      href={buildMapsSearchUrl(entry)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs uppercase font-bold px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-sky-400 border border-sky-800/70 transition"
                    >
                      Maps ↗
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-neutral-400">Nessuna struttura sanitaria indicata.</div>
            )}
          </div>

          <div className="md:col-span-2 bg-neutral-950 border border-emerald-800/60 rounded-xl p-4">
            <div className="text-xs uppercase text-emerald-400 font-bold mb-2">
              Piano B — Itinerario Alternativo &amp; Esfiltrazione
            </div>
            <div className="text-neutral-100 whitespace-pre-line leading-relaxed">
              {risk.evacuation_route || 'Nessun itinerario secondario inserito.'}
            </div>
          </div>

          <div className="md:col-span-2 bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-xs uppercase text-neutral-400 font-bold mr-2">
                Contatti Emergenza:
              </span>
              <span className="text-neutral-100 font-medium">
                {risk.emergency_contacts || 'NUE 112 - Unita di Crisi Farnesina +39 06 36225'}
              </span>
            </div>
            {risk.updated_at && (
              <span className="text-xs font-mono text-neutral-400">
                Aggiornato: {formatDate(risk.updated_at)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-neutral-400 py-2">
          Scheda Risk Assessment non compilata per questa missione.
        </div>
      )}
    </div>
  )
}

interface ExecutiveBriefPanelProps {
  mission: Mission
  operatorLabel: string
  risk?: RiskAssessment
  brief?: ExecutiveBrief
  isLockedClosed: boolean
  userEmail: string
  userId: string
  onBriefSaved: (missionId: string, updated: ExecutiveBrief) => void
  onAuditUpdated?: () => void
}

function ExecutiveBriefPanel({
  mission,
  operatorLabel,
  risk,
  brief,
  isLockedClosed,
  userEmail,
  userId,
  onBriefSaved,
  onAuditUpdated,
}: ExecutiveBriefPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  const [editing, setEditing] = useState(!brief && !isLockedClosed)
  const [saving, setSaving] = useState(false)
  const [copiedExec, setCopiedExec] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)

  const [counterpartName, setCounterpartName] = useState(brief?.counterpart_name || '')
  const [counterpartRole, setCounterpartRole] = useState(brief?.counterpart_role || '')
  const [meetingObjective, setMeetingObjective] = useState(brief?.meeting_objective || '')
  const [talkingPoints, setTalkingPoints] = useState(brief?.talking_points || '')
  const [travelBookingRef, setTravelBookingRef] = useState(brief?.travel_booking_ref || '')
  const [hospitalityDetails, setHospitalityDetails] = useState(brief?.hospitality_details || '')
  const [confidentialNotes, setConfidentialNotes] = useState(brief?.confidential_notes || '')

  useEffect(() => {
    if (brief) {
      setCounterpartName(brief.counterpart_name || '')
      setCounterpartRole(brief.counterpart_role || '')
      setMeetingObjective(brief.meeting_objective || '')
      setTalkingPoints(brief.talking_points || '')
      setTravelBookingRef(brief.travel_booking_ref || '')
      setHospitalityDetails(brief.hospitality_details || '')
      setConfidentialNotes(brief.confidential_notes || '')
      setEditing(false)
    }
  }, [brief])

  useEffect(() => {
    if (isLockedClosed) setEditing(false)
  }, [isLockedClosed])

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleSaveBrief = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLockedClosed) return
    setSaving(true)
    setBriefError(null)

    try {
      const payload = {
        mission_id: mission.id,
        counterpart_name: counterpartName.trim() || null,
        counterpart_role: counterpartRole.trim() || null,
        meeting_objective: meetingObjective.trim() || null,
        talking_points: talkingPoints.trim() || null,
        travel_booking_ref: travelBookingRef.trim() || null,
        hospitality_details: hospitalityDetails.trim() || null,
        confidential_notes: confidentialNotes.trim() || null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }

      const { data, error } = await supabase
        .from('mission_executive_briefs')
        .upsert(payload, { onConflict: 'mission_id' })
        .select()
        .single()

      if (error) throw error

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `EXEC_BRIEF_UPDATE (${mission.client_vip})`,
          status: 'SUCCESS',
        },
      ])

      if (data) {
        onBriefSaved(mission.id, data as ExecutiveBrief)
      }
      if (onAuditUpdated) onAuditUpdated()
      setEditing(false)
    } catch (err: unknown) {
      setBriefError(getErrorMessage(err, 'Errore salvataggio Dossier Direzionale.'))
    } finally {
      setSaving(false)
    }
  }

  const handleCopyExecutiveBrief = async () => {
    const legLines = formatLegsSummaryLines(mission.route_legs)
    const lines = [
      `EXECUTIVE BRIEFING - ${mission.client_vip.toUpperCase()}`,
      `Orario: ${formatDate(mission.start_time)} -> ${formatDate(mission.end_time)}`,
      `Spostamento: ${mission.pickup_point} -> ${mission.dropoff_point}`,
      legLines.length > 0 ? `Tappe Multimodali:\n${legLines.join('\n')}` : null,
      `Assetto: ${mission.assigned_vehicle} | Ref: ${operatorLabel}`,
      brief?.counterpart_name
        ? `Interlocutore: ${brief.counterpart_name}${brief.counterpart_role ? ' (' + brief.counterpart_role + ')' : ''}`
        : null,
      brief?.meeting_objective ? `Obiettivo Incontro: ${brief.meeting_objective}` : null,
      brief?.talking_points ? `Talking Points:\n${brief.talking_points}` : null,
      brief?.travel_booking_ref ? `Travel / PNR: ${brief.travel_booking_ref}` : null,
      brief?.hospitality_details ? `Ospitalita / Hotel: ${brief.hospitality_details}` : null,
      brief?.confidential_notes ? `Note Riservate: ${brief.confidential_notes}` : null,
      risk?.threat_level ? `Livello Rischio Area: ${risk.threat_level}` : null,
      risk?.choke_points ? `\nCHOKE POINTS & COUNTRY INTELLIGENCE:\n${risk.choke_points}` : null,
      risk?.safe_havens ? `\nSAFE HAVENS (FFOO):\n${risk.safe_havens}` : null,
      risk?.medical_facilities ? `\nSTRUTTURE SANITARIE / DEA:\n${risk.medical_facilities}` : null,
      risk?.evacuation_route ? `\nPIANO B / ESFILTRAZIONE:\n${risk.evacuation_route}` : null,
    ].filter(Boolean)

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedExec(true)
      setTimeout(() => setCopiedExec(false), 2000)
    } catch {
      setBriefError('Impossibile copiare il Dossier Direzionale.')
    }
  }

  return (
    <div className="border-t border-amber-800/60 pt-4 bg-amber-950/15 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase">
            Solo Direzione
          </span>
          <span className="text-xs sm:text-sm uppercase tracking-wider font-bold text-amber-300">
            Dossier Incontro &amp; Travel Management
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyExecutiveBrief}
            className="min-h-[36px] bg-neutral-950 hover:bg-neutral-800 text-amber-200 border border-amber-800/80 text-xs uppercase px-3 py-1.5 rounded-lg font-semibold transition"
          >
            {copiedExec ? 'Dossier Copiato' : 'Copia per Direzione'}
          </button>
          {!isLockedClosed && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-[36px] bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-700 text-xs uppercase px-3 py-1.5 rounded-lg transition font-semibold"
            >
              {brief ? 'Modifica Dossier' : 'Compila Dossier'}
            </button>
          )}
        </div>
      </div>

      {briefError && (
        <div className="p-3 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-lg">
          {briefError}
        </div>
      )}

      {!isLockedClosed && editing ? (
        <form onSubmit={handleSaveBrief} className="space-y-3.5 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Controparte / Interlocutore Principale
              </label>
              <input
                type="text"
                value={counterpartName}
                onChange={(e) => setCounterpartName(e.target.value)}
                placeholder="Nome e Cognome interlocutore"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Ruolo / Societa / Istituzione
              </label>
              <input
                type="text"
                value={counterpartRole}
                onChange={(e) => setCounterpartRole(e.target.value)}
                placeholder="Es. CEO / Partner / Funzionario"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Travel Booking (Voli / Treni / PNR / Gate)
              </label>
              <textarea
                rows={2}
                value={travelBookingRef}
                onChange={(e) => setTravelBookingRef(e.target.value)}
                placeholder="Es. Volo AZ610 PNR X8Y9Z2 - Fast Track / Lounge"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Ospitalita (Hotel / Check-in / Ristorante Riservato)
              </label>
              <textarea
                rows={2}
                value={hospitalityDetails}
                onChange={(e) => setHospitalityDetails(e.target.value)}
                placeholder="Struttura, codice prenotazione, tavolo riservato, preferenze"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Obiettivo Strategico dell&apos;Incontro
              </label>
              <textarea
                rows={2}
                value={meetingObjective}
                onChange={(e) => setMeetingObjective(e.target.value)}
                placeholder="Esito atteso, firma accordo, negoziazione"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Talking Points &amp; Punti Sensibili
              </label>
              <textarea
                rows={2}
                value={talkingPoints}
                onChange={(e) => setTalkingPoints(e.target.value)}
                placeholder="Temi chiave da trattare e argomenti da evitare"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-amber-400 mb-1.5 font-semibold">
              Note Riservate Assistente di Direzione (Invisibili agli operatori logistici)
            </label>
            <input
              type="text"
              value={confidentialNotes}
              onChange={(e) => setConfidentialNotes(e.target.value)}
              placeholder="Dettagli sensibili, omaggi protocollo, accorgimenti relazionali"
              className="w-full bg-neutral-950 border border-amber-800/70 rounded-lg p-2.5 text-base sm:text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-1">
            {brief && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-[38px] bg-neutral-950 text-neutral-300 border border-neutral-700 text-xs uppercase px-4 py-1.5 rounded-lg font-semibold"
              >
                Annulla
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="min-h-[38px] bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs uppercase px-5 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva Dossier Direzionale'}
            </button>
          </div>
        </form>
      ) : brief ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-sm">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-amber-400 font-bold mb-1">
              Interlocutore &amp; Ruolo
            </div>
            <div className="text-white font-semibold text-base">
              {brief.counterpart_name || 'Non specificato'}
            </div>
            {brief.counterpart_role && (
              <div className="text-neutral-300 mt-0.5">{brief.counterpart_role}</div>
            )}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-amber-400 font-bold mb-1">
              Obiettivo Strategico
            </div>
            <div className="text-neutral-100 whitespace-pre-line">
              {brief.meeting_objective || 'Nessun obiettivo registrato.'}
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-bold mb-1">
              Travel Booking (Voli / Treni / PNR)
            </div>
            <div className="text-neutral-100 whitespace-pre-line">
              {brief.travel_booking_ref || 'Nessun titolo di viaggio collegato.'}
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-neutral-400 font-bold mb-1">
              Ospitalita &amp; Hotel
            </div>
            <div className="text-neutral-100 whitespace-pre-line">
              {brief.hospitality_details || 'Nessuna prenotazione alberghiera.'}
            </div>
          </div>

          <div className="md:col-span-2 bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-xs uppercase text-amber-400 font-bold mb-1">
              Talking Points &amp; Punti Sensibili
            </div>
            <div className="text-neutral-100 whitespace-pre-line">
              {brief.talking_points || 'Nessun talking point inserito.'}
            </div>
          </div>

          {brief.confidential_notes && (
            <div className="md:col-span-2 bg-amber-950/30 border border-amber-800/70 rounded-xl p-3.5">
              <div className="text-xs uppercase text-amber-300 font-bold mb-1">
                Note Riservate Direzione
              </div>
              <div className="text-amber-100">{brief.confidential_notes}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-neutral-400 py-2">
          Dossier Direzionale non compilato per questa missione.
        </div>
      )}
    </div>
  )
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

interface DraftLegItem {
  id: string
  transport_mode: string
  origin: string
  destination: string
  carrier_code: string
  departure_time: string
  arrival_time: string
  notes: string
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
  const missionFormRef = useRef<HTMLFormElement | null>(null)

  const [missions, setMissions] = useState<Mission[]>(initialMissions)
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [riskList, setRiskList] = useState<RiskAssessment[]>([])
  const [briefList, setBriefList] = useState<ExecutiveBrief[]>([])

  const [filter, setFilter] = useState<'attive' | 'pianificata' | 'in corso' | 'registro' | 'tutte'>(
    'attive'
  )
  const [onlyMine, setOnlyMine] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null)
  const [closeConfirmMissionId, setCloseConfirmMissionId] = useState<string | null>(null)
  const [closingMissionId, setClosingMissionId] = useState<string | null>(null)
  const [showFleet, setShowFleet] = useState(false)
  const [showMorningBrief, setShowMorningBrief] = useState(false)
  const [copiedMorningBrief, setCopiedMorningBrief] = useState(false)
  const [copiedMissionId, setCopiedMissionId] = useState<string | null>(null)
  const [sendingTelegramBrief, setSendingTelegramBrief] = useState(false)
  const [telegramBriefStatus, setTelegramBriefStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [analyzingMissionId, setAnalyzingMissionId] = useState<string | null>(null)
  const [autoAiOnCreate, setAutoAiOnCreate] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [lastCheckIns, setLastCheckIns] = useState<{ [id: string]: GpsCheckInRecord }>({})

  const [sosConfirmId, setSosConfirmId] = useState<string | null>(null)
  const [sendingSosId, setSendingSosId] = useState<string | null>(null)
  const [sentSosAlerts, setSentSosAlerts] = useState<{ [id: string]: SosAlertRecord }>({})

  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null)
  const [expandedBriefId, setExpandedBriefId] = useState<string | null>(null)
  const [expandedDebriefId, setExpandedDebriefId] = useState<string | null>(null)

  const [clientVip, setClientVip] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [pickupPoint, setPickupPoint] = useState('')
  const [dropoffPoint, setDropoffPoint] = useState('')
  const [assignedOperatorId, setAssignedOperatorId] = useState('')
  const [assignedVehicleId, setAssignedVehicleId] = useState('')
  const [manualVehicle, setManualVehicle] = useState('')
  const [notes, setNotes] = useState('')
  const [draftLegs, setDraftLegs] = useState<DraftLegItem[]>([])

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

  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br/>')

  const toLocalInputFormat = (isoString: string) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`
  }

  const formatIcsDate = (isoString: string) => {
    return new Date(isoString).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }

  const escapeIcsText = (raw: string) => {
    return raw.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  }

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatOperatorLabel = useCallback(
    (opId?: string | null) => {
      if (!opId) return 'Non assegnato'
      const op = operators.find((o) => o.id === opId)
      if (!op) return 'Operatore assegnato'
      const name = op.full_name || op.email
      return op.callsign ? `[${op.callsign}] ${name}` : name
    },
    [operators]
  )

  const resetMissionForm = () => {
    setEditingMissionId(null)
    setClientVip('')
    setStartTime('')
    setEndTime('')
    setPickupPoint('')
    setDropoffPoint('')
    setAssignedOperatorId('')
    setAssignedVehicleId('')
    setManualVehicle('')
    setNotes('')
    setDraftLegs([])
    setAutoAiOnCreate(true)
    setShowForm(false)
  }

  const handleEditMission = (mission: Mission) => {
    if (mission.status === 'chiusa') return
    setError(null)
    setEditingMissionId(mission.id)
    setClientVip(mission.client_vip || '')
    setStartTime(toLocalInputFormat(mission.start_time))
    setEndTime(toLocalInputFormat(mission.end_time))
    setPickupPoint(mission.pickup_point || '')
    setDropoffPoint(mission.dropoff_point || '')
    setAssignedOperatorId(mission.assigned_operator_id || '')

    const hasMatchedFleetVeh =
      mission.assigned_vehicle_id &&
      vehicles.some((v) => v.id === mission.assigned_vehicle_id)

    if (vehicles.length > 0) {
      if (hasMatchedFleetVeh && mission.assigned_vehicle_id) {
        setAssignedVehicleId(mission.assigned_vehicle_id)
        setManualVehicle(mission.assigned_vehicle || '')
      } else if (mission.assigned_vehicle) {
        setAssignedVehicleId('__KEEP_EXISTING__')
        setManualVehicle(mission.assigned_vehicle)
      } else {
        setAssignedVehicleId('')
        setManualVehicle('')
      }
    } else {
      setAssignedVehicleId('')
      setManualVehicle(mission.assigned_vehicle || '')
    }

    setNotes(mission.notes || '')
    setDraftLegs(
      Array.isArray(mission.route_legs)
        ? mission.route_legs.map((leg, idx) => ({
            id: `leg_edit_${mission.id}_${idx}_${Date.now()}`,
            transport_mode: leg.transport_mode || 'Auto / NCC',
            origin: leg.origin || '',
            destination: leg.destination || '',
            carrier_code: leg.carrier_code || '',
            departure_time: leg.departure_time ? toLocalInputFormat(leg.departure_time) : '',
            arrival_time: leg.arrival_time ? toLocalInputFormat(leg.arrival_time) : '',
            notes: leg.notes || '',
          }))
        : []
    )
    setAutoAiOnCreate(false)
    setShowFleet(false)
    setShowMorningBrief(false)
    setShowForm(true)

    setTimeout(() => {
      missionFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleAddDraftLeg = () => {
    const previousEnd =
      draftLegs.length > 0
        ? draftLegs[draftLegs.length - 1].destination
        : pickupPoint.trim()

    setDraftLegs((prev) => [
      ...prev,
      {
        id: `leg_${Date.now()}_${prev.length + 1}`,
        transport_mode: prev.length === 0 ? 'Auto / NCC' : 'Volo Commerciale',
        origin: previousEnd,
        destination: '',
        carrier_code: '',
        departure_time: '',
        arrival_time: '',
        notes: '',
      },
    ])
  }

  const handleUpdateDraftLeg = (
    id: string,
    field: keyof Omit<DraftLegItem, 'id'>,
    value: string
  ) => {
    setDraftLegs((prev) =>
      prev.map((leg) => (leg.id === id ? { ...leg, [field]: value } : leg))
    )
  }

  const handleRemoveDraftLeg = (id: string) => {
    setDraftLegs((prev) => prev.filter((leg) => leg.id !== id))
  }

  const handleDownloadMissionIcs = (mission: Mission) => {
    const risk = riskList.find((r) => r.mission_id === mission.id)
    const legLines = formatLegsSummaryLines(mission.route_legs)
    const descParts = [
      `Tratta: ${mission.pickup_point} -> ${mission.dropoff_point}`,
      legLines.length > 0 ? `Tappe Multimodali:\n${legLines.join('\n')}` : null,
      `Assetto: ${mission.assigned_vehicle}`,
      `Operatore: ${formatOperatorLabel(mission.assigned_operator_id)}`,
      risk?.threat_level ? `Livello Rischio: ${risk.threat_level}` : null,
      risk?.safe_havens ? `Safe Havens:\n${risk.safe_havens}` : null,
      risk?.evacuation_route ? `Piano B:\n${risk.evacuation_route}` : null,
      mission.notes ? `Note: ${mission.notes}` : null,
    ].filter(Boolean)

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Ops Portal//Mission Control//IT',
      'BEGIN:VEVENT',
      `UID:mission-${mission.id}@ops-portal`,
      `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
      `DTSTART:${formatIcsDate(mission.start_time)}`,
      `DTEND:${formatIcsDate(mission.end_time)}`,
      `SUMMARY:${escapeIcsText(`Movimento: ${mission.client_vip}`)}`,
      `LOCATION:${escapeIcsText(`${mission.pickup_point} -> ${mission.dropoff_point}`)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `missione-${mission.client_vip.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const buildMissionFullText = (mission: Mission) => {
    const risk = riskList.find((r) => r.mission_id === mission.id)
    const brief = isAdmin ? briefList.find((b) => b.mission_id === mission.id) : undefined
    const legLines = formatLegsSummaryLines(mission.route_legs)
    const debrief = mission.debriefing

    const lines = [
      `SCHEDA MISSIONE & ANALISI TATTICA - ${mission.client_vip.toUpperCase()}`,
      `Stato: ${mission.status.toUpperCase()}${
        mission.debriefing_completed_at ? ' (ARCHIVIATA IN REGISTRO)' : ''
      } | Livello Rischio: ${risk?.threat_level || 'NON VALUTATO'}`,
      `Finestra: ${formatDateTime(mission.start_time)} -> ${formatDateTime(mission.end_time)}`,
      `Tratta Generale: ${mission.pickup_point} -> ${mission.dropoff_point}`,
      legLines.length > 0 ? `\nPIANO DI VIAGGIO MULTIMODALE:\n${legLines.join('\n')}` : null,
      `Rotta Maps: ${buildMapsRouteUrl(mission.pickup_point, mission.dropoff_point)}`,
      `Assetto: ${mission.assigned_vehicle} | Operatore: ${formatOperatorLabel(mission.assigned_operator_id)}`,
      mission.notes ? `Note Logistica: ${mission.notes}` : null,
      debrief
        ? `\nDEBRIEFING OPERATIVO ARCHIVIATO:\nEsito: ${debrief.outcome} | Conclusione: ${formatDateTime(
            debrief.actual_end_time
          )}\nOperatore Esecutore: ${debrief.operator_label}\nStato Mezzo: ${
            debrief.vehicle_condition
          }\nRelazione:\n${debrief.operational_summary}${
            debrief.incidents_notes ? `\nCriticita / Note Future:\n${debrief.incidents_notes}` : ''
          }`
        : null,
      brief?.counterpart_name
        ? `\nDOSSIER DIREZIONALE:\nInterlocutore: ${brief.counterpart_name}${brief.counterpart_role ? ' (' + brief.counterpart_role + ')' : ''}`
        : null,
      brief?.meeting_objective ? `Obiettivo: ${brief.meeting_objective}` : null,
      brief?.travel_booking_ref ? `Travel / PNR: ${brief.travel_booking_ref}` : null,
      brief?.hospitality_details ? `Ospitalita / Hotel: ${brief.hospitality_details}` : null,
      brief?.talking_points ? `Talking Points:\n${brief.talking_points}` : null,
      brief?.confidential_notes ? `Note Riservate: ${brief.confidential_notes}` : null,
      risk?.choke_points ? `\nCOUNTRY INTELLIGENCE & CHOKE POINTS:\n${risk.choke_points}` : null,
      risk?.safe_havens ? `\nSAFE HAVENS & PRESIDI FFOO:\n${risk.safe_havens}` : null,
      risk?.medical_facilities ? `\nSTRUTTURE SANITARIE / DEA:\n${risk.medical_facilities}` : null,
      risk?.evacuation_route ? `\nPIANO B — ITINERARIO ALTERNATIVO & ESFILTRAZIONE:\n${risk.evacuation_route}` : null,
      risk?.emergency_contacts ? `\nContatti Emergenza: ${risk.emergency_contacts}` : null,
    ].filter(Boolean)

    return lines.join('\n')
  }

  const handleCopyFullMissionText = async (mission: Mission) => {
    try {
      await navigator.clipboard.writeText(buildMissionFullText(mission))
      setCopiedMissionId(mission.id)
      setTimeout(() => setCopiedMissionId(null), 2000)
    } catch {
      setError('Impossibile copiare la scheda completa negli appunti.')
    }
  }

  const handlePrintMission = (mission: Mission) => {
    const printWin = window.open('', '_blank', 'width=900,height=950')
    if (!printWin) {
      setError('Abilita i pop-up del browser per generare il PDF/stampa della missione.')
      return
    }

    const risk = riskList.find((r) => r.mission_id === mission.id)
    const brief = isAdmin ? briefList.find((b) => b.mission_id === mission.id) : undefined
    const legLines = formatLegsSummaryLines(mission.route_legs)
    const debrief = mission.debriefing

    const debriefHtml = debrief
      ? `
        <div class="section">
          <div class="section-title">Débriefing Operativo &amp; Archiviazione Registro</div>
          <div class="box-planb">
            <div><strong>Esito Missione:</strong> ${escapeHtml(debrief.outcome)} &mdash; <strong>Conclusione Effettiva:</strong> ${escapeHtml(formatDateTime(debrief.actual_end_time))}</div>
            <div><strong>Operatore Esecutore:</strong> ${escapeHtml(debrief.operator_label)} (${escapeHtml(debrief.operator_email)})</div>
            <div><strong>Stato Mezzo &amp; Dotazioni:</strong> ${escapeHtml(debrief.vehicle_condition)}</div>
            <div style="margin-top:6px;"><strong>Relazione Operativa:</strong><br/>${escapeHtml(debrief.operational_summary)}</div>
            ${debrief.incidents_notes ? `<div style="margin-top:6px;"><strong>Criticita / Note Future:</strong><br/>${escapeHtml(debrief.incidents_notes)}</div>` : ''}
          </div>
        </div>`
      : ''

    const legsHtml =
      legLines.length > 0
        ? `
        <div class="section">
          <div class="section-title">Piano di Viaggio &amp; Tappe Multimodali</div>
          <div class="box">${legLines.map((l) => escapeHtml(l)).join('<br/>')}</div>
        </div>`
        : ''

    const execHtml =
      isAdmin && brief
        ? `
        <div class="section">
          <div class="section-title">Dossier Direzionale &amp; Travel Management</div>
          <div class="box">
            ${brief.counterpart_name ? `<div><strong>Interlocutore:</strong> ${escapeHtml(brief.counterpart_name)}${brief.counterpart_role ? ' (' + escapeHtml(brief.counterpart_role) + ')' : ''}</div>` : ''}
            ${brief.meeting_objective ? `<div><strong>Obiettivo Incontro:</strong> ${escapeHtml(brief.meeting_objective)}</div>` : ''}
            ${brief.travel_booking_ref ? `<div><strong>Travel / PNR:</strong> ${escapeHtml(brief.travel_booking_ref)}</div>` : ''}
            ${brief.hospitality_details ? `<div><strong>Ospitalita / Hotel:</strong> ${escapeHtml(brief.hospitality_details)}</div>` : ''}
            ${brief.talking_points ? `<div style="margin-top:6px;"><strong>Talking Points:</strong><br/>${escapeHtml(brief.talking_points)}</div>` : ''}
            ${brief.confidential_notes ? `<div style="margin-top:6px;"><strong>Note Riservate:</strong> ${escapeHtml(brief.confidential_notes)}</div>` : ''}
          </div>
        </div>`
        : ''

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="utf-8" />
        <title>Briefing Missione - ${escapeHtml(mission.client_vip)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; padding: 36px; line-height: 1.5; font-size: 13px; }
          .header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .tag { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #444; }
          h1 { font-size: 20px; margin: 4px 0 0 0; text-transform: uppercase; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f6f6f6; border: 1px solid #d4d4d8; padding: 14px; border-radius: 6px; margin-bottom: 20px; }
          .section { margin-bottom: 18px; page-break-inside: avoid; }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #111; border-bottom: 1px solid #d4d4d8; padding-bottom: 4px; margin-bottom: 8px; }
          .box { padding: 10px 12px; border-left: 3px solid #111; background: #fafafa; }
          .box-planb { padding: 10px 12px; border-left: 3px solid #047857; background: #f0fdf4; }
          .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .footer { margin-top: 28px; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="tag">SCHEDA OPERATIVA &amp; TRAVEL RISK ASSESSMENT</div>
            <h1>${escapeHtml(mission.client_vip)}</h1>
          </div>
          <div style="text-align:right;">
            <div class="tag">STATO: ${escapeHtml(mission.status.toUpperCase())}${mission.debriefing_completed_at ? ' (ARCHIVIATA)' : ''}</div>
            <div class="tag">RISCHIO: ${escapeHtml(risk?.threat_level || 'NON VALUTATO')}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div><strong>Finestra Oraria:</strong><br/>${escapeHtml(formatDateTime(mission.start_time))} &rarr; ${escapeHtml(formatDateTime(mission.end_time))}</div>
          <div><strong>Assetto &amp; Operatore:</strong><br/>${escapeHtml(mission.assigned_vehicle)} | ${escapeHtml(formatOperatorLabel(mission.assigned_operator_id))}</div>
          <div style="grid-column: span 2;"><strong>Itinerario Generale:</strong><br/>${escapeHtml(mission.pickup_point)} &rarr; ${escapeHtml(mission.dropoff_point)}</div>
          ${mission.notes ? `<div style="grid-column: span 2;"><strong>Note Logistica:</strong> ${escapeHtml(mission.notes)}</div>` : ''}
        </div>

        ${debriefHtml}
        ${legsHtml}
        ${execHtml}

        <div class="section">
          <div class="section-title">Country Intelligence, Analisi Tappe &amp; Choke Points</div>
          <div class="box">${risk?.choke_points ? escapeHtml(risk.choke_points) : 'Nessuna analisi Choke Points registrata.'}</div>
        </div>

        <div class="two-col">
          <div class="section">
            <div class="section-title">Safe Havens, Presidi FFOO &amp; Ambasciate</div>
            <div class="box">${risk?.safe_havens ? escapeHtml(risk.safe_havens) : 'Nessun Safe Haven censito.'}</div>
          </div>
          <div class="section">
            <div class="section-title">Strutture Sanitarie / DEA Lungo Tratta</div>
            <div class="box">${risk?.medical_facilities ? escapeHtml(risk.medical_facilities) : 'Nessuna struttura sanitaria censita.'}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Piano B — Itinerario Alternativo &amp; Esfiltrazione</div>
          <div class="box-planb">${risk?.evacuation_route ? escapeHtml(risk.evacuation_route) : 'Nessun Piano B inserito.'}</div>
        </div>

        <div class="section">
          <div class="section-title">Contatti Emergenza &amp; Sala Operativa</div>
          <div class="box">${risk?.emergency_contacts ? escapeHtml(risk.emergency_contacts) : 'NUE 112 - Unita di Crisi Farnesina +39 06 36225'}</div>
        </div>

        <div class="footer">Documento generato da Ops Portal il ${new Date().toLocaleString('it-IT')}</div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `)
    printWin.document.close()
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

    if (isAdmin) {
      const briefRes = await supabase.from('mission_executive_briefs').select('*')
      if (briefRes.data) setBriefList(briefRes.data)
    }
  }, [supabase, isAdmin])

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

  const handleRiskSaved = (missionId: string, updated: RiskAssessment) => {
    setRiskList((prev) => {
      const exists = prev.some((r) => r.mission_id === missionId)
      if (exists) {
        return prev.map((r) => (r.mission_id === missionId ? updated : r))
      }
      return [...prev, updated]
    })
  }

  const handleBriefSaved = (missionId: string, updated: ExecutiveBrief) => {
    setBriefList((prev) => {
      const exists = prev.some((b) => b.mission_id === missionId)
      if (exists) {
        return prev.map((b) => (b.mission_id === missionId ? updated : b))
      }
      return [...prev, updated]
    })
  }

  const handleDebriefingSaved = (updatedMission: Mission) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === updatedMission.id ? updatedMission : m))
    )
    router.refresh()
  }

  const runAiRouteRiskAnalysis = async (mission: Mission) => {
    if (mission.status === 'chiusa') return
    setAnalyzingMissionId(mission.id)
    setExpandedRiskId(mission.id)
    setExpandedBriefId(null)
    setExpandedDebriefId(null)
    setError(null)

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('analyze-route-risk', {
        body: { mission_id: mission.id },
      })

      if (fnErr) {
        let detailedMsg = fnErr.message || 'Errore chiamata Edge Function analyze-route-risk.'
        const ctx = (fnErr as { context?: Response }).context
        if (ctx && typeof ctx.text === 'function') {
          try {
            const errBody = await ctx.text()
            const parsedErr = JSON.parse(errBody) as { error?: string }
            if (parsedErr?.error) {
              detailedMsg = parsedErr.error
            }
          } catch {
            // mantieni messaggio di default
          }
        }
        throw new Error(detailedMsg)
      }

      const responseData = data as { assessment?: RiskAssessment; error?: string } | null
      if (responseData?.error) {
        throw new Error(responseData.error)
      }

      if (!responseData?.assessment) {
        throw new Error('Risposta vuota ricevuta dal server di analisi AI.')
      }

      handleRiskSaved(mission.id, responseData.assessment)
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Impossibile completare l analisi AI del percorso.'))
    } finally {
      setAnalyzingMissionId(null)
    }
  }

  const generateMorningBriefingText = () => {
    const todayStr = new Date().toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    const todayKey = new Date().toDateString()

    const todayMissions = missions.filter(
      (m) => new Date(m.start_time).toDateString() === todayKey && m.status !== 'chiusa'
    )
    const targetMissions =
      todayMissions.length > 0
        ? todayMissions
        : missions.filter((m) => m.status !== 'chiusa')

    const headerLabel =
      todayMissions.length > 0
        ? `AGENDA OPERATIVA ODIERNA (${todayMissions.length} movimentazioni)`
        : `PROSSIME MOVIMENTAZIONI ATTIVE (${targetMissions.length} pianificate)`

    const lines: string[] = [
      `MORNING BRIEFING DIREZIONE - ${todayStr.toUpperCase()}`,
      headerLabel,
      '==================================================',
    ]

    if (targetMissions.length === 0) {
      lines.push('Nessuna movimentazione o appuntamento attivo in agenda.')
    } else {
      targetMissions.forEach((m, index) => {
        const risk = riskList.find((r) => r.mission_id === m.id)
        const brief = briefList.find((b) => b.mission_id === m.id)
        const legLines = formatLegsSummaryLines(m.route_legs)
        const startHour = new Date(m.start_time).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
        })
        const endHour = new Date(m.end_time).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
        })

        lines.push(`${index + 1}. [${startHour} - ${endHour}] ${m.client_vip.toUpperCase()}`)
        lines.push(`   Tratta Generale: ${m.pickup_point} -> ${m.dropoff_point}`)
        if (legLines.length > 0) {
          lines.push(`   Tappe Multimodali:\n   ${legLines.join('\n   ')}`)
        }
        lines.push(`   Assetto: ${m.assigned_vehicle} | Op: ${formatOperatorLabel(m.assigned_operator_id)}`)
        if (brief?.counterpart_name) {
          lines.push(
            `   Incontro: ${brief.counterpart_name}${brief.counterpart_role ? ' (' + brief.counterpart_role + ')' : ''}`
          )
        }
        if (brief?.meeting_objective) {
          lines.push(`   Obiettivo: ${brief.meeting_objective}`)
        }
        if (brief?.travel_booking_ref) {
          lines.push(`   Travel/PNR: ${brief.travel_booking_ref}`)
        }
        if (brief?.hospitality_details) {
          lines.push(`   Ospitalita: ${brief.hospitality_details}`)
        }
        if (risk?.threat_level) {
          lines.push(`   Livello Rischio: ${risk.threat_level}`)
        }
        if (risk?.choke_points) {
          lines.push(`   Country Intelligence & Choke Points:\n${risk.choke_points}`)
        }
        if (risk?.safe_havens) {
          lines.push(`   Safe Havens (FFOO):\n${risk.safe_havens}`)
        }
        if (risk?.medical_facilities) {
          lines.push(`   Strutture Sanitarie / DEA:\n${risk.medical_facilities}`)
        }
        if (risk?.evacuation_route) {
          lines.push(`   Piano B / Esfiltrazione:\n${risk.evacuation_route}`)
        }
        if (risk?.emergency_contacts) {
          lines.push(`   Contatti Emergenza: ${risk.emergency_contacts}`)
        }
        lines.push('--------------------------------------------------')
      })
    }

    return lines.join('\n').trim()
  }

  const handleCopyMorningBriefing = async () => {
    try {
      await navigator.clipboard.writeText(generateMorningBriefingText())
      setCopiedMorningBrief(true)
      setTimeout(() => setCopiedMorningBrief(false), 2500)
    } catch {
      setError('Impossibile copiare il Morning Briefing negli appunti.')
    }
  }

  const handlePrintMorningBriefing = () => {
    const printWin = window.open('', '_blank', 'width=900,height=950')
    if (!printWin) {
      setError('Abilita i pop-up del browser per generare il PDF/stampa.')
      return
    }

    const todayStr = new Date().toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    const todayKey = new Date().toDateString()
    const todayMissions = missions.filter(
      (m) => new Date(m.start_time).toDateString() === todayKey && m.status !== 'chiusa'
    )
    const targetMissions =
      todayMissions.length > 0 ? todayMissions : missions.filter((m) => m.status !== 'chiusa')

    const cardsHtml =
      targetMissions.length === 0
        ? '<p>Nessuna movimentazione o appuntamento attivo in agenda.</p>'
        : targetMissions
            .map((m, idx) => {
              const risk = riskList.find((r) => r.mission_id === m.id)
              const brief = briefList.find((b) => b.mission_id === m.id)
              const legLines = formatLegsSummaryLines(m.route_legs)
              const startHour = new Date(m.start_time).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              })
              const endHour = new Date(m.end_time).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              })

              return `
                <div class="card">
                  <div class="card-head">
                    <div>
                      <span class="badge">${idx + 1}. ${escapeHtml(startHour)} - ${escapeHtml(endHour)}</span>
                      <strong class="title">${escapeHtml(m.client_vip)}</strong>
                    </div>
                    <div class="risk">RISCHIO: ${escapeHtml(risk?.threat_level || 'N/D')}</div>
                  </div>
                  <div class="meta">
                    <div><strong>Tratta Generale:</strong> ${escapeHtml(m.pickup_point)} &rarr; ${escapeHtml(m.dropoff_point)}</div>
                    ${legLines.length > 0 ? `<div><strong>Tappe Multimodali:</strong><br/>${legLines.map((l) => escapeHtml(l)).join('<br/>')}</div>` : ''}
                    <div><strong>Assetto:</strong> ${escapeHtml(m.assigned_vehicle)} | <strong>Operatore:</strong> ${escapeHtml(formatOperatorLabel(m.assigned_operator_id))}</div>
                    ${brief?.counterpart_name ? `<div><strong>Interlocutore:</strong> ${escapeHtml(brief.counterpart_name)}</div>` : ''}
                    ${brief?.travel_booking_ref ? `<div><strong>Travel/PNR:</strong> ${escapeHtml(brief.travel_booking_ref)}</div>` : ''}
                  </div>
                  ${risk?.choke_points ? `<div class="sub"><strong>Country Intelligence &amp; Choke Points:</strong><br/>${escapeHtml(risk.choke_points)}</div>` : ''}
                  ${risk?.safe_havens ? `<div class="sub"><strong>Safe Havens (FFOO):</strong><br/>${escapeHtml(risk.safe_havens)}</div>` : ''}
                  ${risk?.medical_facilities ? `<div class="sub"><strong>Strutture Sanitarie / DEA:</strong><br/>${escapeHtml(risk.medical_facilities)}</div>` : ''}
                  ${risk?.evacuation_route ? `<div class="sub-planb"><strong>Piano B / Esfiltrazione:</strong><br/>${escapeHtml(risk.evacuation_route)}</div>` : ''}
                </div>
              `
            })
            .join('')

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="utf-8" />
        <title>Morning Briefing Direzione - ${escapeHtml(todayStr)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; padding: 36px; line-height: 1.45; font-size: 13px; }
          .top { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 20px; }
          .tag { font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px; font-weight: 700; color: #444; }
          h1 { margin: 4px 0 0 0; font-size: 20px; text-transform: uppercase; }
          .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-bottom: 16px; page-break-inside: avoid; }
          .card-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px; }
          .badge { background: #111; color: #fff; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-right: 8px; }
          .title { font-size: 15px; text-transform: uppercase; }
          .risk { font-size: 11px; font-weight: 700; }
          .meta { background: #f8fafc; padding: 8px 10px; border-radius: 4px; margin-bottom: 8px; }
          .sub { margin-top: 8px; padding-left: 10px; border-left: 3px solid #64748b; }
          .sub-planb { margin-top: 8px; padding: 8px 10px; border-left: 3px solid #047857; background: #f0fdf4; }
        </style>
      </head>
      <body>
        <div class="top">
          <div class="tag">RISERVATO DIREZIONE • MORNING BRIEFING ESECUTIVO</div>
          <h1>${escapeHtml(todayStr)}</h1>
        </div>
        ${cardsHtml}
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `)
    printWin.document.close()
  }

  const handleSendMorningBriefingTelegram = async () => {
    setSendingTelegramBrief(true)
    setTelegramBriefStatus(null)
    setError(null)

    try {
      const { data, error: rpcErr } = await supabase.rpc('send_telegram_morning_briefing')
      if (rpcErr) throw rpcErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: 'MORNING_BRIEFING_TELEGRAM (INVIO MANUALE)',
          status: 'SUCCESS',
        },
      ])

      setTelegramBriefStatus(String(data || 'Briefing inviato su Telegram'))
      if (onAuditUpdated) onAuditUpdated()
      setTimeout(() => setTelegramBriefStatus(null), 4000)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Errore invio Morning Briefing su Telegram.'))
    } finally {
      setSendingTelegramBrief(false)
    }
  }

  const handleSosClick = (mission: Mission) => {
    if (mission.status === 'chiusa') return
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
    if (mission.status === 'chiusa') return
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Errore registrazione veicolo in flotta.'))
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

  const handleSaveMission = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let vehicleSummary = ''
      let vehicleIdToSave: string | null = null

      if (assignedVehicleId === '__KEEP_EXISTING__') {
        vehicleSummary = manualVehicle.trim()
        vehicleIdToSave = null
      } else {
        const selectedVeh = vehicles.find((v) => v.id === assignedVehicleId)
        if (selectedVeh) {
          vehicleSummary = `[${selectedVeh.callsign}] ${selectedVeh.model} (${selectedVeh.plate})`
          vehicleIdToSave = selectedVeh.id
        } else {
          vehicleSummary = manualVehicle.trim()
          vehicleIdToSave = null
        }
      }

      if (!vehicleSummary) {
        throw new Error('Seleziona un mezzo dalla flotta o inserisci una descrizione.')
      }

      const normalizedLegs: RouteLeg[] = draftLegs
        .filter((l) => l.origin.trim() && l.destination.trim())
        .map((l, idx) => ({
          leg_number: idx + 1,
          transport_mode: l.transport_mode.trim() || 'Trasferimento',
          origin: l.origin.trim(),
          destination: l.destination.trim(),
          carrier_code: l.carrier_code.trim() || undefined,
          departure_time: l.departure_time ? new Date(l.departure_time).toISOString() : undefined,
          arrival_time: l.arrival_time ? new Date(l.arrival_time).toISOString() : undefined,
          notes: l.notes.trim() || undefined,
        }))

      const shouldRunAi = autoAiOnCreate
      let savedMission: Mission | null = null

      if (editingMissionId) {
        const { data, error: updateError } = await supabase
          .from('missions')
          .update({
            client_vip: clientVip.trim(),
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            pickup_point: pickupPoint.trim(),
            dropoff_point: dropoffPoint.trim(),
            assigned_vehicle: vehicleSummary,
            assigned_vehicle_id: vehicleIdToSave,
            assigned_operator_id: assignedOperatorId || null,
            notes: notes.trim() || null,
            route_legs: normalizedLegs,
          })
          .eq('id', editingMissionId)
          .select()
          .single()

        if (updateError) throw updateError

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `MISSION_UPDATE (${clientVip.trim()}${
              normalizedLegs.length > 0 ? ` - ${normalizedLegs.length} tappe` : ''
            })`,
            status: 'SUCCESS',
          },
        ])

        savedMission = data as Mission | null
        if (savedMission) {
          setMissions((prev) =>
            prev.map((m) => (m.id === savedMission!.id ? savedMission! : m))
          )
        }
      } else {
        const { data, error: insertError } = await supabase
          .from('missions')
          .insert([
            {
              client_vip: clientVip.trim(),
              start_time: new Date(startTime).toISOString(),
              end_time: new Date(endTime).toISOString(),
              pickup_point: pickupPoint.trim(),
              dropoff_point: dropoffPoint.trim(),
              assigned_vehicle: vehicleSummary,
              assigned_vehicle_id: vehicleIdToSave,
              assigned_operator_id: assignedOperatorId || null,
              status: 'pianificata',
              notes: notes.trim() || null,
              route_legs: normalizedLegs,
              created_by: userId,
            },
          ])
          .select()
          .single()

        if (insertError) throw insertError

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `MISSION_CREATE (${clientVip.trim()}${
              normalizedLegs.length > 0 ? ` - ${normalizedLegs.length} tappe` : ''
            })`,
            status: 'SUCCESS',
          },
        ])

        savedMission = data as Mission | null
        if (savedMission) {
          setMissions((prev) => [savedMission!, ...prev])
        }
      }

      resetMissionForm()
      if (onAuditUpdated) onAuditUpdated()
      router.refresh()

      if (savedMission && shouldRunAi) {
        await runAiRouteRiskAnalysis(savedMission)
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Errore durante il salvataggio della missione.'))
    } finally {
      setLoading(false)
    }
  }

  const handleReassignOperator = async (
    mission: Mission,
    newOpId: string
  ) => {
    if (mission.status === 'chiusa') return
    const cleanOpId = newOpId || null
    const previous = [...missions]

    setMissions((prev) =>
      prev.map((m) => (m.id === mission.id ? { ...m, assigned_operator_id: cleanOpId } : m))
    )

    const { error: updateErr } = await supabase
      .from('missions')
      .update({ assigned_operator_id: cleanOpId })
      .eq('id', mission.id)

    if (updateErr) {
      setMissions(previous)
      setError('Impossibile riassegnare operatore.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `MISSION_ASSIGN_OP (${mission.client_vip}) -> ${formatOperatorLabel(cleanOpId)}`,
        status: 'SUCCESS',
      },
    ])
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleStatusChange = async (
    mission: Mission,
    newStatus: 'pianificata' | 'in corso' | 'chiusa'
  ) => {
    if (mission.status === 'chiusa') {
      setError('Una missione chiusa è archiviata nel Registro e non può essere riaperta.')
      return
    }

    if (newStatus === 'chiusa') {
      if (mission.assigned_operator_id && mission.assigned_operator_id !== userId) {
        setError(
          `Solo l'operatore assegnato (${formatOperatorLabel(
            mission.assigned_operator_id
          )}) può chiudere questa missione e compilare il Débriefing.`
        )
        return
      }
      setCloseConfirmMissionId(mission.id)
      return
    }

    const previous = [...missions]
    setMissions((prev) =>
      prev.map((m) => (m.id === mission.id ? { ...m, status: newStatus } : m))
    )

    const { error: updateError } = await supabase
      .from('missions')
      .update({ status: newStatus })
      .eq('id', mission.id)

    if (updateError) {
      setMissions(previous)
      setError(getErrorMessage(updateError, 'Impossibile aggiornare lo stato operativo.'))
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: 'MISSION_STATUS -> ' + newStatus.toUpperCase() + ' (' + mission.client_vip + ')',
        status: 'SUCCESS',
      },
    ])

    if (onAuditUpdated) onAuditUpdated()
    router.refresh()
  }

  const handleConfirmCloseMission = async (mission: Mission) => {
    if (mission.status === 'chiusa') return
    if (mission.assigned_operator_id && mission.assigned_operator_id !== userId) {
      setError('Solo l operatore che ha eseguito la missione può chiuderla.')
      setCloseConfirmMissionId(null)
      return
    }

    setClosingMissionId(mission.id)
    setError(null)

    try {
      const nowIso = new Date().toISOString()
      const executorId = mission.assigned_operator_id || userId

      const { data, error: closeErr } = await supabase
        .from('missions')
        .update({
          status: 'chiusa',
          assigned_operator_id: executorId,
          closed_at: nowIso,
          closed_by: userId,
        })
        .eq('id', mission.id)
        .select()
        .single()

      if (closeErr) throw closeErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `MISSION_CLOSED_LOCKED (${mission.client_vip}) — In attesa Débriefing Operatore`,
          status: 'SUCCESS',
        },
      ])

      const updatedMission = (data as Mission) || {
        ...mission,
        status: 'chiusa' as const,
        assigned_operator_id: executorId,
        closed_at: nowIso,
        closed_by: userId,
      }

      setMissions((prev) =>
        prev.map((m) => (m.id === mission.id ? updatedMission : m))
      )
      setCloseConfirmMissionId(null)
      if (editingMissionId === mission.id) resetMissionForm()
      setExpandedRiskId(null)
      setExpandedBriefId(null)
      setExpandedDebriefId(mission.id)

      if (filter === 'attive' || filter === 'pianificata' || filter === 'in corso') {
        setFilter('registro')
      }

      if (onAuditUpdated) onAuditUpdated()
      router.refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Errore durante la chiusura definitiva della missione.'))
    } finally {
      setClosingMissionId(null)
    }
  }

  const handleDeleteMission = async (mission: Mission) => {
    if (mission.status === 'chiusa') {
      setError('Le missioni chiuse sono archiviate nel Registro e non possono essere eliminate.')
      return
    }

    const previous = [...missions]
    setMissions((prev) => prev.filter((m) => m.id !== mission.id))

    const { error: deleteError } = await supabase
      .from('missions')
      .delete()
      .eq('id', mission.id)

    if (deleteError) {
      setMissions(previous)
      setError(getErrorMessage(deleteError, 'Errore nella rimozione della missione.'))
      return
    }

    if (editingMissionId === mission.id) {
      resetMissionForm()
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: 'MISSION_DELETE (' + mission.client_vip + ')',
        status: 'SUCCESS',
      },
    ])

    if (onAuditUpdated) onAuditUpdated()
    router.refresh()
  }

  const myMissionsCount = missions.filter(
    (m) => m.assigned_operator_id === userId && m.status !== 'chiusa'
  ).length

  const closedRegistryCount = missions.filter((m) => m.status === 'chiusa').length
  const pendingMyDebriefCount = missions.filter(
    (m) =>
      m.status === 'chiusa' &&
      !m.debriefing_completed_at &&
      m.assigned_operator_id === userId
  ).length

  const filteredMissions = missions.filter((m) => {
    if (onlyMine && m.assigned_operator_id !== userId) return false
    if (filter === 'attive') return m.status !== 'chiusa'
    if (filter === 'registro') return m.status === 'chiusa'
    if (filter === 'tutte') return true
    return m.status === filter
  })

  const statusBadge = (status: Mission['status']) => {
    if (status === 'pianificata') return 'bg-amber-950/60 text-amber-300 border-amber-700'
    if (status === 'in corso') return 'bg-emerald-950/70 text-emerald-300 border-emerald-600'
    return 'bg-neutral-800 text-neutral-300 border-neutral-600'
  }

  const threatBadge = (level?: ThreatLevel) => {
    if (level === 'CRITICAL') return 'bg-red-950 text-red-300 border-red-700'
    if (level === 'HIGH') return 'bg-orange-950/80 text-orange-300 border-orange-700'
    if (level === 'MODERATE') return 'bg-amber-950/70 text-amber-300 border-amber-700'
    if (level === 'LOW') return 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
    return 'bg-neutral-900 text-neutral-400 border-neutral-700'
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 border-t-2 border-t-neutral-200 rounded-xl p-4 sm:p-6 shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-white">
            Agenda Direzionale, Flotta &amp; Registro Missioni
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Movimenti multimodali, analisi AI, Safe Havens, Débriefing post-missione e archivio storico
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyMine(!onlyMine)}
            className={
              'min-h-[38px] px-3 py-1.5 rounded-lg text-xs uppercase border transition font-semibold ' +
              (onlyMine
                ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
            }
          >
            Le mie ({myMissionsCount})
          </button>

          {(
            [
              { id: 'attive', label: 'Attive' },
              { id: 'pianificata', label: 'Pianificate' },
              { id: 'in corso', label: 'In Corso' },
              { id: 'registro', label: `Registro (${closedRegistryCount})` },
              { id: 'tutte', label: 'Tutte' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={
                'min-h-[38px] px-3 py-1.5 rounded-lg text-xs uppercase border transition flex items-center gap-1.5 ' +
                (filter === tab.id
                  ? 'bg-neutral-100 text-neutral-950 border-neutral-100 font-bold'
                  : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
              }
            >
              <span>{tab.label}</span>
              {tab.id === 'registro' && pendingMyDebriefCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-neutral-950 text-[11px] font-bold animate-pulse">
                  !
                </span>
              )}
            </button>
          ))}

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowMorningBrief(!showMorningBrief)
                  if (!showMorningBrief) {
                    setShowFleet(false)
                    resetMissionForm()
                  }
                }}
                className="min-h-[38px] bg-neutral-950 hover:bg-neutral-800 text-amber-300 border border-amber-700/80 text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition font-semibold"
              >
                {showMorningBrief ? 'Chiudi Briefing' : 'Morning Briefing'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFleet(!showFleet)
                  if (!showFleet) {
                    resetMissionForm()
                    setShowMorningBrief(false)
                  }
                }}
                className="min-h-[38px] bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition font-semibold"
              >
                {showFleet ? 'Chiudi Flotta' : `Flotta (${vehicles.length})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (showForm) {
                    resetMissionForm()
                  } else {
                    setEditingMissionId(null)
                    setAutoAiOnCreate(true)
                    setShowFleet(false)
                    setShowMorningBrief(false)
                    setShowForm(true)
                  }
                }}
                className="min-h-[38px] bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-1.5 rounded-lg transition"
              >
                {showForm ? 'Chiudi Modulo' : '+ Nuova Missione'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3.5 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-lg">
          {error}
        </div>
      )}

      {isAdmin && showMorningBrief && (
        <div className="mt-5 p-4 sm:p-5 bg-neutral-950 border border-amber-800/80 rounded-xl space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <div className="text-sm uppercase tracking-wider text-amber-400 font-bold">
                Morning Briefing Direzione — Riepilogo Completo
              </div>
              <p className="text-xs sm:text-sm text-neutral-400">
                Include appuntamenti, movimentazioni multimodali, Country Intelligence, Safe Havens e Piano B
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={sendingTelegramBrief}
                onClick={handleSendMorningBriefingTelegram}
                className="min-h-[38px] bg-sky-400 hover:bg-sky-300 text-neutral-950 font-bold text-xs uppercase px-3.5 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {sendingTelegramBrief ? 'Invio Telegram...' : 'Invia Telegram'}
              </button>
              <button
                type="button"
                onClick={handlePrintMorningBriefing}
                className="min-h-[38px] bg-neutral-200 hover:bg-white text-neutral-950 font-bold text-xs uppercase px-3.5 py-1.5 rounded-lg transition"
              >
                PDF / Stampa
              </button>
              <button
                type="button"
                onClick={handleCopyMorningBriefing}
                className="min-h-[38px] bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs uppercase px-3.5 py-1.5 rounded-lg transition"
              >
                {copiedMorningBrief ? 'Copiato' : 'Copia Testo'}
              </button>
            </div>
          </div>

          {telegramBriefStatus && (
            <div className="p-3 bg-sky-950/60 border border-sky-700 text-sky-200 text-sm rounded-lg">
              {telegramBriefStatus}
            </div>
          )}

          <pre className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-100 whitespace-pre-wrap font-mono overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">
            {generateMorningBriefingText()}
          </pre>
        </div>
      )}

      {isAdmin && showFleet && (
        <div className="mt-5 p-4 sm:p-5 bg-neutral-950 border border-neutral-800 rounded-xl space-y-4">
          <div className="text-sm uppercase tracking-wider text-emerald-400 font-bold">
            Registro Flotta &amp; Assetti Mobili
          </div>

          <form onSubmit={handleAddVehicle} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <input
              type="text"
              required
              value={vehCallsign}
              onChange={(e) => setVehCallsign(e.target.value.toUpperCase())}
              placeholder="Callsign (es. UNIT-01)"
              className="bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white uppercase"
            />
            <input
              type="text"
              required
              value={vehModel}
              onChange={(e) => setVehModel(e.target.value)}
              placeholder="Modello (es. Mercedes V-Class)"
              className="bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
            />
            <input
              type="text"
              required
              value={vehPlate}
              onChange={(e) => setVehPlate(e.target.value.toUpperCase())}
              placeholder="Targa (es. GH123AB)"
              className="bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white uppercase"
            />
            <select
              value={vehCategory}
              onChange={(e) => setVehCategory(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
            >
              <option value="Executive">Executive Sedan / Van</option>
              <option value="Armored">Blindato (B6/B7)</option>
              <option value="Escort">Scorta / Supporto</option>
              <option value="Low-Profile">Low-Profile / Civile</option>
            </select>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[42px] bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase rounded-lg px-4 py-2 transition"
            >
              + Aggiungi Mezzo
            </button>
          </form>

          {vehicles.length > 0 ? (
            <div className="overflow-x-auto border border-neutral-800 rounded-lg">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-neutral-900 text-neutral-400 uppercase border-b border-neutral-800 text-xs">
                  <tr>
                    <th className="px-3.5 py-2.5">Callsign</th>
                    <th className="px-3.5 py-2.5">Modello</th>
                    <th className="px-3.5 py-2.5">Targa</th>
                    <th className="px-3.5 py-2.5">Categoria</th>
                    <th className="px-3.5 py-2.5 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/70">
                  {vehicles.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3.5 py-2.5 font-bold font-mono text-emerald-400">
                        {v.callsign}
                      </td>
                      <td className="px-3.5 py-2.5 text-white">{v.model}</td>
                      <td className="px-3.5 py-2.5 font-mono text-neutral-200">{v.plate}</td>
                      <td className="px-3.5 py-2.5 text-neutral-300">{v.category}</td>
                      <td className="px-3.5 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteVehicle(v)}
                          className="text-red-400 hover:text-red-300 text-xs font-semibold uppercase"
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
            <p className="text-sm text-neutral-400">
              Nessun mezzo censito in flotta. Inserisci il primo veicolo qui sopra.
            </p>
          )}
        </div>
      )}

      {isAdmin && showForm && (
        <form
          ref={missionFormRef}
          onSubmit={handleSaveMission}
          className="mt-5 p-4 sm:p-5 bg-neutral-950 border border-emerald-500/50 rounded-xl space-y-4 text-sm"
        >
          <div className="text-sm uppercase tracking-wider text-emerald-400 font-bold">
            {editingMissionId
              ? 'Modifica Ordine di Servizio / Trasferta Multimodale'
              : 'Nuovo Ordine di Servizio / Trasferta Multimodale'}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Cliente / VIP / Oggetto Agenda *
              </label>
              <input
                type="text"
                required
                value={clientVip}
                onChange={(e) => setClientVip(e.target.value)}
                placeholder="Denominazione soggetto o codice"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Operatore Assegnato (Callsign)
              </label>
              <select
                value={assignedOperatorId}
                onChange={(e) => setAssignedOperatorId(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
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
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Assetto / Mezzo Principale *
              </label>
              {vehicles.length > 0 ? (
                <select
                  required
                  value={assignedVehicleId}
                  onChange={(e) => setAssignedVehicleId(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                >
                  <option value="">-- Seleziona veicolo dal registro --</option>
                  {editingMissionId && manualVehicle && (
                    <option value="__KEEP_EXISTING__">Attuale: {manualVehicle}</option>
                  )}
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
                  placeholder="Modello / Targa / Callsign / Multimodale"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                  Inizio Finestra *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                  Fine Finestra *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Origine Generale / Partenza (Pick-up) *
              </label>
              <input
                type="text"
                required
                value={pickupPoint}
                onChange={(e) => setPickupPoint(e.target.value)}
                placeholder="Es. Roma EUR, Italia"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Destinazione Finale (Drop-off) *
              </label>
              <input
                type="text"
                required
                value={dropoffPoint}
                onChange={(e) => setDropoffPoint(e.target.value)}
                placeholder="Es. Nairobi Westlands, Kenya"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <div className="text-xs sm:text-sm uppercase font-bold text-sky-400">
                  Piano di Viaggio &amp; Tappe Multimodali (Auto, Treno, Volo, Scali)
                </div>
                <p className="text-xs sm:text-sm text-neutral-400">
                  Aggiungi o modifica ogni segmento del viaggio per l&apos;analisi AI completa
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddDraftLeg}
                className="min-h-[38px] bg-sky-400 hover:bg-sky-300 text-neutral-950 font-bold text-xs uppercase px-3.5 py-1.5 rounded-lg transition shrink-0"
              >
                + Aggiungi Tappa / Mezzo
              </button>
            </div>

            {draftLegs.length > 0 ? (
              <div className="space-y-3">
                {draftLegs.map((leg, idx) => (
                  <div
                    key={leg.id}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-3.5 space-y-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-sky-400">
                        Tappa #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDraftLeg(leg.id)}
                        className="text-xs font-semibold uppercase text-red-400 hover:text-red-300"
                      >
                        Rimuovi Tappa
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs uppercase text-neutral-400 mb-1">
                          Modalita Trasporto *
                        </label>
                        <select
                          value={leg.transport_mode}
                          onChange={(e) =>
                            handleUpdateDraftLeg(leg.id, 'transport_mode', e.target.value)
                          }
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                        >
                          <option value="Auto / NCC">Auto / NCC</option>
                          <option value="Auto Blindata">Auto Blindata</option>
                          <option value="Treno Alta Velocita">Treno Alta Velocita</option>
                          <option value="Volo Commerciale">Volo Commerciale</option>
                          <option value="Jet Privato / FBO">Jet Privato / FBO</option>
                          <option value="Elicottero">Elicottero</option>
                          <option value="Traghetto / Nave">Traghetto / Nave</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs uppercase text-neutral-400 mb-1">
                          Partenza Tappa *
                        </label>
                        <input
                          type="text"
                          required
                          value={leg.origin}
                          onChange={(e) => handleUpdateDraftLeg(leg.id, 'origin', e.target.value)}
                          placeholder="Es. Roma Fiumicino (FCO)"
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs uppercase text-neutral-400 mb-1">
                          Arrivo Tappa *
                        </label>
                        <input
                          type="text"
                          required
                          value={leg.destination}
                          onChange={(e) =>
                            handleUpdateDraftLeg(leg.id, 'destination', e.target.value)
                          }
                          placeholder="Es. Nairobi (NBO)"
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs uppercase text-neutral-400 mb-1">
                          Vettore / Volo / Targa
                        </label>
                        <input
                          type="text"
                          value={leg.carrier_code}
                          onChange={(e) =>
                            handleUpdateDraftLeg(leg.id, 'carrier_code', e.target.value)
                          }
                          placeholder="Es. Volo KQ125"
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs uppercase text-neutral-400 mb-1">
                          Partenza Tappa (Opz.)
                        </label>
                        <input
                          type="datetime-local"
                          value={leg.departure_time}
                          onChange={(e) =>
                            handleUpdateDraftLeg(leg.id, 'departure_time', e.target.value)
                          }
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs uppercase text-neutral-400 mb-1">
                          Arrivo Tappa (Opz.)
                        </label>
                        <input
                          type="datetime-local"
                          value={leg.arrival_time}
                          onChange={(e) =>
                            handleUpdateDraftLeg(leg.id, 'arrival_time', e.target.value)
                          }
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs uppercase text-neutral-400 mb-1">
                          Dettagli Operativi Tappa
                        </label>
                        <input
                          type="text"
                          value={leg.notes}
                          onChange={(e) => handleUpdateDraftLeg(leg.id, 'notes', e.target.value)}
                          placeholder="Es. Terminal, Gate, Dogana, Scorta locale"
                          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-neutral-400">
                Nessuna tappa intermedia aggiunta: verra analizzata la tratta diretta.
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
              Note Logistica Generali (Visibili anche all&apos;operatore sul campo)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Accesso carraio, pass ZTL, tempi di attesa, dotazioni"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2.5 text-xs sm:text-sm text-sky-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAiOnCreate}
                onChange={(e) => setAutoAiOnCreate(e.target.checked)}
                className="accent-sky-400 w-4 h-4 shrink-0"
              />
              <span>
                {editingMissionId
                  ? 'Ricalcola automaticamente Valutazione Rischio AI Real-Time al salvataggio'
                  : 'Elabora automaticamente Valutazione Rischio AI Real-Time (Tappe, Profilo Paese, Safe Havens & Piano B)'}
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={resetMissionForm}
                className="min-h-[42px] bg-neutral-900 text-neutral-300 border border-neutral-700 text-xs sm:text-sm uppercase px-4 py-2 rounded-lg font-semibold"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[42px] bg-white hover:bg-neutral-200 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-5 py-2 rounded-lg transition disabled:opacity-50"
              >
                {loading
                  ? 'Salvataggio...'
                  : editingMissionId
                  ? 'Aggiorna Missione'
                  : 'Conferma e Registra'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-4">
        {filteredMissions.length > 0 ? (
          filteredMissions.map((mission) => {
            const isClosed = mission.status === 'chiusa'
            const isArchived = isClosed && Boolean(mission.debriefing_completed_at)
            const isExecutor = mission.assigned_operator_id === userId
            const canCompileDebrief = isClosed && !isArchived && isExecutor
            const canUserClose =
              !isClosed && (!mission.assigned_operator_id || mission.assigned_operator_id === userId)

            const risk = riskList.find((r) => r.mission_id === mission.id)
            const brief = isAdmin
              ? briefList.find((b) => b.mission_id === mission.id)
              : undefined
            const isRiskExpanded = expandedRiskId === mission.id
            const isBriefExpanded = isAdmin && expandedBriefId === mission.id
            const isDebriefExpanded =
              isClosed && (expandedDebriefId === mission.id || canCompileDebrief)

            const isCheckingIn = checkingInId === mission.id
            const lastCheckIn = lastCheckIns[mission.id]
            const isConfirmingSos = sosConfirmId === mission.id
            const isSendingSos = sendingSosId === mission.id
            const sosAlert = sentSosAlerts[mission.id]
            const isAnalyzingThis = analyzingMissionId === mission.id
            const isConfirmingClose = closeConfirmMissionId === mission.id
            const isClosingThis = closingMissionId === mission.id
            const missionLegs = Array.isArray(mission.route_legs) ? mission.route_legs : []

            return (
              <div
                key={mission.id}
                className={
                  'bg-neutral-950 border rounded-xl p-4 sm:p-5 space-y-4 ' +
                  (sosAlert
                    ? 'border-red-600'
                    : canCompileDebrief
                    ? 'border-amber-500/80'
                    : isClosed
                    ? 'border-neutral-800/80'
                    : isExecutor
                    ? 'border-emerald-700/80'
                    : 'border-neutral-800')
                }
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          'px-2.5 py-0.5 rounded-md border text-xs uppercase font-bold ' +
                          statusBadge(mission.status)
                        }
                      >
                        {mission.status}
                      </span>

                      {isArchived && (
                        <span className="px-2.5 py-0.5 rounded-md border text-xs uppercase font-bold bg-emerald-950/70 text-emerald-300 border-emerald-700">
                          Archiviata in Registro
                        </span>
                      )}

                      {isClosed && !isArchived && (
                        <span className="px-2.5 py-0.5 rounded-md border text-xs uppercase font-bold bg-amber-950/80 text-amber-300 border-amber-600 animate-pulse">
                          In Attesa Débriefing Operatore
                        </span>
                      )}

                      <span
                        className={
                          'px-2.5 py-0.5 rounded-md border text-xs uppercase font-bold ' +
                          threatBadge(risk?.threat_level)
                        }
                      >
                        {risk ? `Rischio: ${risk.threat_level}` : 'Rischio: N/D'}
                      </span>
                      {missionLegs.length > 0 && (
                        <span className="px-2.5 py-0.5 rounded-md border text-xs uppercase font-bold bg-sky-950/70 text-sky-300 border-sky-700">
                          {missionLegs.length} Tappe
                        </span>
                      )}
                      {isAdmin && brief && (
                        <span className="px-2.5 py-0.5 rounded-md border text-xs uppercase font-bold bg-amber-950/70 text-amber-300 border-amber-700">
                          Dossier OK
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="text-base sm:text-lg font-bold text-white uppercase tracking-wide">
                        {mission.client_vip}
                      </span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-neutral-200 font-semibold font-mono text-xs sm:text-sm">
                        {mission.assigned_vehicle}
                      </span>
                      <span className="text-neutral-600">•</span>
                      <span
                        className={
                          'px-2.5 py-0.5 rounded-md text-xs font-semibold ' +
                          (mission.assigned_operator_id
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/70'
                            : 'bg-neutral-900 text-neutral-400 border border-neutral-800')
                        }
                      >
                        Op: {formatOperatorLabel(mission.assigned_operator_id)}
                      </span>
                    </div>

                    <div className="text-neutral-300 font-mono text-xs sm:text-sm">
                      <span className="text-neutral-400 font-sans">Finestra:</span>{' '}
                      {formatDateTime(mission.start_time)} &rarr; {formatDateTime(mission.end_time)}
                      {mission.closed_at && (
                        <span className="text-neutral-400">
                          {' '}
                          (Chiusa il {formatDateTime(mission.closed_at)})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-neutral-100 text-sm sm:text-base font-medium">
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
                        className="text-xs uppercase font-bold px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-emerald-400 border border-emerald-800/70 transition"
                      >
                        Rotta Maps ↗
                      </a>
                    </div>

                    {missionLegs.length > 0 && (
                      <div className="mt-2 bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-1.5 text-xs sm:text-sm">
                        <div className="text-xs uppercase font-bold text-sky-400">
                          Dettaglio Tappe &amp; Mezzi:
                        </div>
                        {missionLegs.map((leg, idx) => (
                          <div
                            key={idx}
                            className="text-neutral-200 flex flex-wrap items-center gap-1.5"
                          >
                            <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 text-xs font-bold uppercase">
                              {leg.leg_number || idx + 1}. {leg.transport_mode}
                            </span>
                            {leg.carrier_code && (
                              <span className="text-amber-300 font-mono font-semibold">
                                [{leg.carrier_code}]
                              </span>
                            )}
                            <span>
                              {leg.origin} &rarr; {leg.destination}
                            </span>
                            {leg.notes && (
                              <span className="text-neutral-400 italic">({leg.notes})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {isAdmin && brief?.counterpart_name && (
                      <div className="text-xs sm:text-sm text-amber-300">
                        <span className="text-neutral-400">Interlocutore:</span>{' '}
                        {brief.counterpart_name}
                        {brief.counterpart_role ? ` (${brief.counterpart_role})` : ''}
                        {brief.travel_booking_ref ? ` | Travel: ${brief.travel_booking_ref}` : ''}
                      </div>
                    )}

                    {mission.notes && (
                      <div className="text-neutral-300 italic text-sm pt-0.5">
                        Note Logistica: {mission.notes}
                      </div>
                    )}

                    {lastCheckIn && (
                      <div className="pt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-sky-300">
                        <span className="px-2 py-0.5 rounded bg-sky-950/70 border border-sky-800 font-bold uppercase text-xs">
                          Check-in GPS OK {lastCheckIn.time}
                        </span>
                        <span className="font-mono">
                          {lastCheckIn.lat}, {lastCheckIn.lng} ({lastCheckIn.accuracy}m)
                        </span>
                        <a
                          href={buildMapsSearchUrl(`${lastCheckIn.lat},${lastCheckIn.lng}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-sky-600 hover:text-sky-200 font-semibold"
                        >
                          Vedi su Maps ↗
                        </a>
                      </div>
                    )}

                    {sosAlert && (
                      <div className="pt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-red-300">
                        <span className="px-2.5 py-0.5 rounded bg-red-600 text-white font-bold uppercase text-xs">
                          ALLERTA SOS INVIATA ({sosAlert.time})
                        </span>
                        <span className="font-mono">
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
                            Apri su Maps ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                    {isClosed && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canCompileDebrief) {
                            setExpandedDebriefId(isDebriefExpanded ? null : mission.id)
                            if (!isDebriefExpanded) {
                              setExpandedRiskId(null)
                              setExpandedBriefId(null)
                            }
                          }
                        }}
                        className={
                          'min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold border transition ' +
                          (canCompileDebrief
                            ? 'bg-amber-400 text-neutral-950 border-amber-300'
                            : isDebriefExpanded
                            ? 'bg-emerald-400 text-neutral-950 border-emerald-400'
                            : 'bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border-emerald-700/80')
                        }
                      >
                        {canCompileDebrief
                          ? 'Compila Débriefing'
                          : isDebriefExpanded
                          ? 'Chiudi Débriefing'
                          : 'Débriefing Operativo'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setExpandedRiskId(isRiskExpanded ? null : mission.id)
                        if (!isRiskExpanded) {
                          setExpandedBriefId(null)
                          if (!canCompileDebrief) setExpandedDebriefId(null)
                        }
                      }}
                      className={
                        'min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold border transition ' +
                        (isRiskExpanded
                          ? 'bg-emerald-400 text-neutral-950 border-emerald-400'
                          : 'bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border-emerald-700/80')
                      }
                    >
                      {isAnalyzingThis
                        ? 'AI in corso...'
                        : isRiskExpanded
                        ? 'Chiudi Risk'
                        : 'Risk & Safe Havens'}
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedBriefId(isBriefExpanded ? null : mission.id)
                          if (!isBriefExpanded) {
                            setExpandedRiskId(null)
                            if (!canCompileDebrief) setExpandedDebriefId(null)
                          }
                        }}
                        className={
                          'min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold border transition ' +
                          (isBriefExpanded
                            ? 'bg-amber-400 text-neutral-950 border-amber-400'
                            : 'bg-neutral-900 hover:bg-neutral-800 text-amber-300 border-amber-700/80')
                        }
                      >
                        {isBriefExpanded ? 'Chiudi Dossier' : 'Dossier'}
                      </button>
                    )}

                    {!isClosed && (
                      <>
                        <button
                          type="button"
                          disabled={isCheckingIn}
                          onClick={() => handleGpsCheckIn(mission)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider font-semibold border transition bg-neutral-900 hover:bg-neutral-800 text-sky-300 border-sky-800/80 disabled:opacity-50"
                        >
                          {isCheckingIn ? 'GPS...' : 'Check-in GPS'}
                        </button>

                        <button
                          type="button"
                          disabled={isSendingSos}
                          onClick={() => handleSosClick(mission)}
                          title="Doppio clic rapido per inviare allerta SOS con posizione GPS"
                          className={
                            'min-h-[38px] px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold border transition ' +
                            (isConfirmingSos
                              ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 animate-pulse'
                              : 'bg-red-950/80 hover:bg-red-900 text-red-300 border-red-800') +
                            ' disabled:opacity-50'
                          }
                        >
                          {isSendingSos
                            ? 'INVIO...'
                            : isConfirmingSos
                            ? 'CONFERMA!'
                            : 'SOS'}
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopyFullMissionText(mission)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs uppercase font-semibold border transition bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border-neutral-700"
                    >
                      {copiedMissionId === mission.id ? 'Copiato' : 'Copia'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePrintMission(mission)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs uppercase font-semibold border transition bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border-neutral-700"
                    >
                      PDF
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadMissionIcs(mission)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs uppercase font-semibold border transition bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border-neutral-700"
                    >
                      .ICS
                    </button>

                    {!isClosed && isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleEditMission(mission)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs uppercase font-semibold border transition bg-neutral-900 hover:bg-neutral-800 text-neutral-100 border-neutral-700"
                      >
                        Modifica
                      </button>
                    )}

                    {!isClosed && isAdmin && (
                      <select
                        aria-label="Assegna operatore"
                        value={mission.assigned_operator_id || ''}
                        onChange={(e) =>
                          handleReassignOperator(mission, e.target.value)
                        }
                        className="min-h-[38px] bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs font-semibold rounded-lg px-3 py-1.5"
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

                    {!isClosed ? (
                      <select
                        aria-label="Stato missione"
                        value={mission.status}
                        onChange={(e) =>
                          handleStatusChange(
                            mission,
                            e.target.value as Mission['status']
                          )
                        }
                        className="min-h-[38px] bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs font-semibold uppercase rounded-lg px-3 py-1.5"
                      >
                        <option value="pianificata">Pianificata</option>
                        <option value="in corso">In Corso</option>
                        <option value="chiusa" disabled={!canUserClose}>
                          {canUserClose ? 'Chiudi Missione...' : 'Chiusa (Solo Op. Assegnato)'}
                        </option>
                      </select>
                    ) : (
                      <span className="min-h-[38px] inline-flex items-center px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs font-bold uppercase">
                        Bloccata
                      </span>
                    )}

                    {!isClosed && isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMission(mission)}
                        className="min-h-[38px] bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </div>

                {!isClosed && isConfirmingClose && (
                  <div className="p-4 bg-amber-950/40 border border-amber-500/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                    <div className="text-amber-100">
                      <strong>Confermi la chiusura definitiva?</strong> Una volta chiusa, la missione non potrà più essere riaperta, modificata o eliminata, e dovrai compilare il <strong>Débriefing Operativo</strong> per l&apos;archiviazione nel Registro.
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isClosingThis}
                        onClick={() => setCloseConfirmMissionId(null)}
                        className="min-h-[38px] bg-neutral-900 text-neutral-200 border border-neutral-700 text-xs uppercase font-semibold px-3.5 py-1.5 rounded-lg"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        disabled={isClosingThis}
                        onClick={() => handleConfirmCloseMission(mission)}
                        className="min-h-[38px] bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs uppercase font-bold px-4 py-1.5 rounded-lg transition disabled:opacity-50"
                      >
                        {isClosingThis ? 'Chiusura...' : 'Conferma Chiusura'}
                      </button>
                    </div>
                  </div>
                )}

                {isDebriefExpanded && (
                  <MissionDebriefingPanel
                    canCompile={canCompileDebrief}
                    mission={mission}
                    onAuditUpdated={onAuditUpdated}
                    onDebriefingSaved={handleDebriefingSaved}
                    operatorLabel={formatOperatorLabel(mission.assigned_operator_id)}
                    userEmail={userEmail}
                  />
                )}

                {isBriefExpanded && (
                  <ExecutiveBriefPanel
                    brief={brief}
                    isLockedClosed={isClosed}
                    mission={mission}
                    onAuditUpdated={onAuditUpdated}
                    onBriefSaved={handleBriefSaved}
                    operatorLabel={formatOperatorLabel(mission.assigned_operator_id)}
                    risk={risk}
                    userEmail={userEmail}
                    userId={userId}
                  />
                )}

                {isRiskExpanded && (
                  <MissionRiskPanel
                    assignedVehicle={mission.assigned_vehicle}
                    clientVip={mission.client_vip}
                    dropoffPoint={mission.dropoff_point}
                    endTime={mission.end_time}
                    isAdmin={isAdmin}
                    isAnalyzingAi={isAnalyzingThis}
                    isLockedClosed={isClosed}
                    missionId={mission.id}
                    notes={mission.notes}
                    onRunAiAnalysis={() => runAiRouteRiskAnalysis(mission)}
                    onPrintMission={() => handlePrintMission(mission)}
                    onRiskSaved={handleRiskSaved}
                    onAuditUpdated={onAuditUpdated}
                    operatorLabel={formatOperatorLabel(mission.assigned_operator_id)}
                    pickupPoint={mission.pickup_point}
                    risk={risk}
                    routeLegs={mission.route_legs}
                    startTime={mission.start_time}
                    userEmail={userEmail}
                    userId={userId}
                  />
                )}
              </div>
            )
          })
        ) : (
          <div className="py-8 text-center text-sm text-neutral-400 border border-dashed border-neutral-800 rounded-xl">
            {filter === 'registro'
              ? 'Nessuna missione chiusa presente nel Registro.'
              : 'Nessuna missione presente per il filtro selezionato.'}
          </div>
        )}
      </div>
    </div>
  )
}
