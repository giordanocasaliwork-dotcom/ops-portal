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
              {brief.counterpart_name || 'Non specificato'}
            </div>
            {brief.counterpart_role && (
              <div className="text-neutral-400 mt-0.5">{brief.counterpart_role}</div>
            )}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-amber-400 font-bold mb-1">
              Obiettivo Strategico
            </div>
            <div className="text-neutral-200 whitespace-pre-line">
              {brief.meeting_objective || 'Nessun obiettivo registrato.'}
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-400 font-bold mb-1">
              Travel Booking (Voli / Treni / PNR)
            </div>
            <div className="text-neutral-200 whitespace-pre-line">
              {brief.travel_booking_ref || 'Nessun titolo di viaggio collegato.'}
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-neutral-400 font-bold mb-1">
              Ospitalita &amp; Hotel
            </div>
            <div className="text-neutral-200 whitespace-pre-line">
              {brief.hospitality_details || 'Nessuna prenotazione alberghiera.'}
            </div>
          </div>

          <div className="md:col-span-2 bg-neutral-950 border border-neutral-800 rounded p-3">
            <div className="text-[10px] uppercase text-amber-400 font-bold mb-1">
              Talking Points &amp; Punti Sensibili
            </div>
            <div className="text-neutral-200 whitespace-pre-line">
              {brief.talking_points || 'Nessun talking point inserito.'}
            </div>
          </div>

          {brief.confidential_notes && (
            <div className="md:col-span-2 bg-amber-950/30 border border-amber-800/70 rounded p-3">
              <div className="text-[10px] uppercase text-amber-300 font-bold mb-1">
                Note Riservate Direzione
              </div>
              <div className="text-amber-100">{brief.confidential_notes}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-neutral-500 py-2">
          Dossier Direzionale non ancora compilato per questa missione.
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
  const [briefList, setBriefList] = useState<ExecutiveBrief[]>([])

  const [filter, setFilter] = useState<'tutte' | 'pianificata' | 'in corso' | 'chiusa'>('tutte')
  const [onlyMine, setOnlyMine] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showFleet, setShowFleet] = useState(false)
  const [showMorningBrief, setShowMorningBrief] = useState(false)
  const [copiedMorningBrief, setCopiedMorningBrief] = useState(false)
  const [sendingTelegramBrief, setSendingTelegramBrief] = useState(false)
  const [telegramBriefStatus, setTelegramBriefStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [lastCheckIns, setLastCheckIns] = useState<{ [id: string]: GpsCheckInRecord }>({})

  const [sosConfirmId, setSosConfirmId] = useState<string | null>(null)
  const [sendingSosId, setSendingSosId] = useState<string | null>(null)
  const [sentSosAlerts, setSentSosAlerts] = useState<{ [id: string]: SosAlertRecord }>({})

  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null)
  const [expandedBriefId, setExpandedBriefId] = useState<string | null>(null)

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

  const formatIcsDate = (isoString: string) => {
    return new Date(isoString).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }

  const escapeIcsText = (raw: string) => {
    return raw.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  }

  const handleDownloadMissionIcs = (mission: Mission) => {
    const descParts = [
      `Tratta: ${mission.pickup_point} -> ${mission.dropoff_point}`,
      `Assetto: ${mission.assigned_vehicle}`,
      `Operatore: ${formatOperatorLabel(mission.assigned_operator_id)}`,
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
      `DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`,
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

  const handleBriefSaved = (missionId: string, updated: ExecutiveBrief) => {
    setBriefList((prev) => {
      const exists = prev.some((b) => b.mission_id === missionId)
      if (exists) {
        return prev.map((b) => (b.mission_id === missionId ? updated : b))
      }
      return [...prev, updated]
    })
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
      '----------------------------------------',
    ]

    if (targetMissions.length === 0) {
      lines.push('Nessuna movimentazione o appuntamento attivo in agenda.')
    } else {
      targetMissions.forEach((m, index) => {
        const risk = riskList.find((r) => r.mission_id === m.id)
        const brief = briefList.find((b) => b.mission_id === m.id)
        const startHour = new Date(m.start_time).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
        })
        const endHour = new Date(m.end_time).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
        })

        lines.push(`${index + 1}. [${startHour} - ${endHour}] ${m.client_vip.toUpperCase()}`)
        lines.push(`   Tratta: ${m.pickup_point} -> ${m.dropoff_point}`)
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
        lines.push('')
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
    const printWin = window.open('', '_blank', 'width=850,height=950')
    if (!printWin) {
      setError('Abilita i pop-up del browser per generare il PDF/stampa.')
      return
    }

    const escaped = generateMorningBriefingText()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="utf-8" />
        <title>Morning Briefing Direzione</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; padding: 40px; }
          .top { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 20px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; color: #444; }
          pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="top">RISERVATO DIREZIONE • MORNING BRIEFING ESECUTIVO</div>
        <pre>${escaped}</pre>
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
    } catch (err: any) {
      setError(err.message || 'Errore invio Morning Briefing su Telegram.')
    } finally {
      setSendingTelegramBrief(false)
    }
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
