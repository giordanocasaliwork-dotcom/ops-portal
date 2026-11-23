 'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../utils/supabase/client'

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
  risk?: RiskAssessment
  isAdmin: boolean
  userEmail: string
  userId: string
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
  risk,
  isAdmin,
  userEmail,
  userId,
  onRiskSaved,
  onAuditUpdated,
}: MissionRiskPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  const [editing, setEditing] = useState(!risk && isAdmin)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)

  const [threatLevel, setThreatLevel] = useState<ThreatLevel>(risk?.threat_level || 'LOW')
  const [chokePoints, setChokePoints] = useState(risk?.choke_points || '')
  const [safeHavens, setSafeHavens] = useState(risk?.safe_havens || '')
  const [medicalFacilities, setMedicalFacilities] = useState(risk?.medical_facilities || '')
  const [evacuationRoute, setEvacuationRoute] = useState(risk?.evacuation_route || '')
  const [emergencyContacts, setEmergencyContacts] = useState(risk?.emergency_contacts || '')

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
      .map((line) => line.trim())
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
    } catch (err: any) {
      setPanelError(err.message || 'Errore salvataggio scheda Risk Assessment.')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyBriefing = async () => {
    const lines = [
      `BRIEFING LOGISTICO & SICUREZZA - ${clientVip.toUpperCase()}`,
      `Finestra: ${formatDate(startTime)} -> ${formatDate(endTime)}`,
      `Tratta: ${pickupPoint} -> ${dropoffPoint}`,
      `Rotta Maps: ${buildMapsRouteUrl(pickupPoint, dropoffPoint)}`,
      `Assetto: ${assignedVehicle} | Op: ${operatorLabel}`,
      `Livello Rischio: ${risk?.threat_level || 'NON VALUTATO'}`,
      risk?.choke_points ? `Choke Points: ${risk.choke_points}` : null,
      risk?.safe_havens ? `Safe Havens: ${risk.safe_havens}` : null,
      risk?.medical_facilities ? `Strutture Sanitarie / DEA: ${risk.medical_facilities}` : null,
      risk?.evacuation_route ? `Esfiltrazione / Alt. Route: ${risk.evacuation_route}` : null,
      risk?.emergency_contacts ? `Contatti Emergenza: ${risk.emergency_contacts}` : null,
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
    <div className="border-t border-neutral-800 pt-4 bg-neutral-900/60 rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider font-bold text-emerald-400">
          Scheda Intelligence - Risk Assessment &amp; Safe Havens
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyBriefing}
            className="bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-[11px] uppercase px-3 py-1 rounded transition"
          >
            {copied ? 'Briefing Copiato' : 'Copia Briefing Operativo'}
          </button>
          {isAdmin && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700 text-[11px] uppercase px-3 py-1 rounded transition font-semibold"
            >
              {risk ? 'Modifica Scheda' : 'Compila Scheda'}
            </button>
          )}
        </div>
      </div>

      {panelError && (
        <div className="p-2.5 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
          {panelError}
        </div>
      )}

      {isAdmin && editing ? (
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Livello Minaccia Stimato *
              </label>
              <select
                value={threatLevel}
                onChange={(e) => setThreatLevel(e.target.value as ThreatLevel)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-100"
              >
                <option value="LOW">LOW (Basso - Ordinario)</option>
                <option value="MODERATE">MODERATE (Moderato - Attenzione)</option>
                <option value="HIGH">HIGH (Alto - Protocolli Rafforzati)</option>
                <option value="CRITICAL">CRITICAL (Critico - Massima Allerta)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Contatti Emergenza / Sala Operativa
              </label>
              <input
                type="text"
                value={emergencyContacts}
                onChange={(e) => setEmergencyContacts(e.target.value)}
                placeholder="Es. NUE 112 - Centrale Operativa - Referente Location"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-200"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Choke Points &amp; Criticita Tratta
              </label>
              <textarea
                rows={2}
                value={chokePoints}
                onChange={(e) => setChokePoints(e.target.value)}
                placeholder="Svincoli congestionati, ZTL, cantieri, aree esposte"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-200"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Safe Havens &amp; Presidi FFOO (uno per riga per link Maps)
              </label>
              <textarea
                rows={2}
                value={safeHavens}
                onChange={(e) => setSafeHavens(e.target.value)}
                placeholder="Es. Stazione Carabinieri Valentano"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-200"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Strutture Sanitarie / DEA (uno per riga per link Maps)
              </label>
              <textarea
                rows={2}
                value={medicalFacilities}
                onChange={(e) => setMedicalFacilities(e.target.value)}
                placeholder="Es. Ospedale Belcolle Viterbo DEA I Livello"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-200"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Itinerario Alternativo / Esfiltrazione
              </label>
              <textarea
                rows={2}
                value={evacuationRoute}
                onChange={(e) => setEvacuationRoute(e.target.value)}
                placeholder="Percorso secondario in caso di blocco asse principale"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-200"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {risk && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="bg-neutral-950 text-neutral-400 border border-neutral-700 text-xs uppercase px-3 py-1.5 rounded"
              >
                Annulla
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase px-4 py-1.5 rounded transition disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva Scheda Risk Assessment'}
            </button>
          </div>
        </form>
      ) : risk ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold mb-1">
              Choke Points &amp; Criticita Tratta
            </div>
            <div className="text-neutral-200 whitespace-pre-line">
              {risk.choke_points || 'Nessuna criticita segnalata.'}
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-emerald-500 font-bold mb-1.5">
              Safe Havens &amp; Presidi FFOO
            </div>
            {safeHavenList.length > 0 ? (
              <div className="space-y-1.5">
                {safeHavenList.map((entry, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2">
                    <span className="text-neutral-200">{entry}</span>
                    <a
                      href={buildMapsSearchUrl(entry)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-emerald-400 border border-emerald-800/70 transition"
                    >
                      Maps &nearr;
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-neutral-400">Nessun safe haven censito.</div>
            )}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold mb-1.5">
              Strutture Sanitarie / DEA
            </div>
            {medicalList.length > 0 ? (
              <div className="space-y-1.5">
                {medicalList.map((entry, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2">
                    <span className="text-neutral-200">{entry}</span>
                    <a
                      href={buildMapsSearchUrl(entry)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-emerald-400 border border-emerald-800/70 transition"
                    >
                      Maps &nearr;
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-neutral-400">Nessuna struttura sanitaria indicata.</div>
            )}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-500 font-bold mb-1">
              Itinerario Alternativo / Esfiltrazione
            </div>
            <div className="text-neutral-200 whitespace-pre-line">
              {risk.evacuation_route || 'Nessun itinerario secondario inserito.'}
            </div>
          </div>

          <div className="md:col-span-2 bg-neutral-950 border border-neutral-800 rounded p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase text-neutral-500 font-bold mr-2">
                Contatti Emergenza:
              </span>
              <span className="text-neutral-200">
                {risk.emergency_contacts || 'NUE 112 - Sala Operativa'}
              </span>
            </div>
            {risk.updated_at && (
              <span className="text-[10px] text-neutral-500">
                Aggiornato: {formatDate(risk.updated_at)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs text-neutral-500 py-2">
          Scheda Risk Assessment non ancora compilata per questa missione.
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
  userEmail,
  userId,
  onBriefSaved,
  onAuditUpdated,
}: ExecutiveBriefPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  const [editing, setEditing] = useState(!brief)
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
    } catch (err: any) {
      setBriefError(err.message || 'Errore salvataggio Dossier Direzionale.')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyExecutiveBrief = async () => {
    const lines = [
      `EXECUTIVE BRIEFING - ${mission.client_vip.toUpperCase()}`,
      `Orario: ${formatDate(mission.start_time)} -> ${formatDate(mission.end_time)}`,
      `Spostamento: ${mission.pickup_point} -> ${mission.dropoff_point}`,
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
    <div className="border-t border-amber-800/70 pt-4 bg-amber-950/15 rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 text-[10px] font-bold uppercase">
            SOLO DIREZIONE
          </span>
          <span className="text-xs uppercase tracking-wider font-bold text-amber-300">
            Dossier Incontro &amp; Travel Management
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyExecutiveBrief}
            className="bg-neutral-950 hover:bg-neutral-800 text-amber-200 border border-amber-800/80 text-[11px] uppercase px-3 py-1 rounded transition"
          >
            {copiedExec ? 'Dossier Copiato' : 'Copia per Direzione'}
          </button>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-700 text-[11px] uppercase px-3 py-1 rounded transition font-semibold"
            >
              {brief ? 'Modifica Dossier' : 'Compila Dossier'}
            </button>
          )}
        </div>
      </div>

      {briefError && (
        <div className="p-2.5 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
          {briefError}
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSaveBrief} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Controparte / Interlocutore Principale
              </label>
              <input
                type="text"
                value={counterpartName}
                onChange={(e) => setCounterpartName(e.target.value)}
                placeholder="Nome e Cognome interlocutore"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Ruolo / Societa / Istituzione
              </label>
              <input
                type="text"
                value={counterpartRole}
                onChange={(e) => setCounterpartRole(e.target.value)}
                placeholder="Es. CEO / Partner / Funzionario"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Travel Booking (Voli / Treni / PNR / Gate)
              </label>
              <textarea
                rows={2}
                value={travelBookingRef}
                onChange={(e) => setTravelBookingRef(e.target.value)}
                placeholder="Es. Volo AZ610 PNR X8Y9Z2 - Fast Track / Lounge"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Ospitalita (Hotel / Check-in / Ristorante Riservato)
              </label>
              <textarea
                rows={2}
                value={hospitalityDetails}
                onChange={(e) => setHospitalityDetails(e.target.value)}
                placeholder="Struttura, codice prenotazione, tavolo riservato, preferenze"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Obiettivo Strategico dell&apos;Incontro
              </label>
              <textarea
                rows={2}
                value={meetingObjective}
                onChange={(e) => setMeetingObjective(e.target.value)}
                placeholder="Esito atteso, firma accordo, negoziazione"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Talking Points &amp; Punti Sensibili
              </label>
              <textarea
                rows={2}
                value={talkingPoints}
                onChange={(e) => setTalkingPoints(e.target.value)}
                placeholder="Temi chiave da trattare e argomenti da evitare"
                className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-neutral-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase text-amber-400/90 mb-1">
              Note Riservate Assistente di Direzione (Invisibili agli operatori logistici)
            </label>
            <input
              type="text"
              value={confidentialNotes}
              onChange={(e) => setConfidentialNotes(e.target.value)}
              placeholder="Dettagli sensibili, omaggi protocollo, accorgimenti relazionali"
              className="w-full bg-neutral-950 border border-amber-900/70 rounded p-2 text-xs text-neutral-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {brief && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="bg-neutral-950 text-neutral-400 border border-neutral-700 text-xs uppercase px-3 py-1.5 rounded"
              >
                Annulla
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs uppercase px-4 py-1.5 rounded transition disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva Dossier Direzionale'}
            </button>
          </div>
        </form>
      ) : brief ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-amber-400 font-bold mb-1">
              Interlocutore &amp; Ruolo
            </div>
            <div className="text-neutral-100 font-semibold">
              {brief.counterpart
