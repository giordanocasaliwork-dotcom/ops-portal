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
            Agenda Direzionale, Flotta &amp; Risk Assessment
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pianificazione movimenti, dossier incontri, travel PNR, check-in GPS e safe havens
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
                  setShowMorningBrief(!showMorningBrief)
                  if (!showMorningBrief) {
                    setShowFleet(false)
                    setShowForm(false)
                  }
                }}
                className="ml-1 bg-amber-950/70 hover:bg-amber-900/70 text-amber-300 border border-amber-700 text-xs uppercase tracking-wider px-3 py-1.5 rounded transition font-semibold"
              >
                {showMorningBrief ? 'Chiudi Briefing' : 'Morning Briefing'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFleet(!showFleet)
                  if (!showFleet) {
                    setShowForm(false)
                    setShowMorningBrief(false)
                  }
                }}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
              >
                {showFleet ? 'Chiudi Flotta' : `Flotta (${vehicles.length})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(!showForm)
                  if (!showForm) {
                    setShowFleet(false)
                    setShowMorningBrief(false)
                  }
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

      {isAdmin && showMorningBrief && (
        <div className="mt-5 p-4 bg-neutral-950 border border-amber-800/80 rounded-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-300 font-bold">
                Morning Briefing Direzione - Riepilogo Esecutivo
              </div>
              <p className="text-[11px] text-neutral-400">
                Invio automatico programmato ogni giorno alle 07:30 su Telegram (oppure invio manuale istantaneo)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={sendingTelegramBrief}
                onClick={handleSendMorningBriefingTelegram}
                className="bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold text-xs uppercase px-4 py-1.5 rounded transition disabled:opacity-50"
              >
                {sendingTelegramBrief ? 'Invio Telegram...' : 'Invia Ora su Telegram'}
              </button>
              <button
                type="button"
                onClick={handleCopyMorningBriefing}
                className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs uppercase px-4 py-1.5 rounded transition"
              >
                {copiedMorningBrief ? 'Morning Briefing Copiato' : 'Copia Briefing'}
              </button>
            </div>
          </div>

          {telegramBriefStatus && (
            <div className="p-2.5 bg-sky-950/60 border border-sky-700 text-sky-200 text-xs rounded">
              {telegramBriefStatus}
            </div>
          )}

          <pre className="p-3 bg-neutral-900 border border-neutral-800 rounded text-xs text-neutral-200 whitespace-pre-wrap font-mono overflow-x-auto">
            {generateMorningBriefingText()}
          </pre>
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
            Nuovo Ordine di Servizio / Appuntamento
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Cliente / VIP / Oggetto Agenda *
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
                Punto di Rilascio / Sede Incontro *
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
              Note Logistica (Visibili anche all&apos;operatore sul campo)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Accesso carraio, pass ZTL, tempi di attesa (per note riservate usa Dossier & Travel)"
              className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-600"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-neutral-200 hover:bg-white text-neutral-950 font-bold text-xs uppercase tracking-wider px-5 py-2 rounded transition disabled:opacity-50"
            >
              {loading ? 'Registrazione...' : 'Conferma e Registra'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-3">
        {filteredMissions.length > 0 ? (
          filteredMissions.map((mission) => {
            const isAssignedToMe = mission.assigned_operator_id === userId
            const risk = riskList.find((r) => r.mission_id === mission.id)
            const brief = isAdmin
              ? briefList.find((b) => b.mission_id === mission.id)
              : undefined
            const isRiskExpanded = expandedRiskId === mission.id
            const isBriefExpanded = isAdmin && expandedBriefId === mission.id
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
                      {isAdmin && brief && (
                        <span className="px-2 py-0.5 rounded border text-[10px] uppercase font-bold bg-amber-950/70 text-amber-300 border-amber-700">
                          Dossier OK
                        </span>
                      )}
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

                    {isAdmin && brief?.counterpart_name && (
                      <div className="text-[11px] text-amber-300/90">
                        <span className="text-neutral-500">Interlocutore:</span>{' '}
                        {brief.counterpart_name}
                        {brief.counterpart_role ? ` (${brief.counterpart_role})` : ''}
                        {brief.travel_booking_ref ? ` | Travel: ${brief.travel_booking_ref}` : ''}
                      </div>
                    )}

                    {mission.notes && (
                      <div className="text-neutral-400 italic pt-0.5">
                        Note Logistica: {mission.notes}
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

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedBriefId(isBriefExpanded ? null : mission.id)
                          if (!isBriefExpanded) setExpandedRiskId(null)
                        }}
                        className={
                          'px-2.5 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
                          (isBriefExpanded
                            ? 'bg-amber-300 text-neutral-950 border-amber-300'
                            : 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-700/80')
                        }
                      >
                        {isBriefExpanded ? 'Chiudi Dossier' : 'Dossier & Travel'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setExpandedRiskId(isRiskExpanded ? null : mission.id)
                        if (!isRiskExpanded) setExpandedBriefId(null)
                      }}
                      className={
                        'px-2.5 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
                        (isRiskExpanded
                          ? 'bg-neutral-200 text-neutral-950 border-neutral-200'
                          : 'bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border-emerald-800/80')
                      }
                    >
                      {isRiskExpanded ? 'Chiudi Risk' : 'Risk & Safe Havens'}
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

                {isBriefExpanded && (
                  <ExecutiveBriefPanel
                    mission={mission}
                    operatorLabel={formatOperatorLabel(mission.assigned_operator_id)}
                    risk={risk}
                    brief={brief}
                    userEmail={userEmail}
                    userId={userId}
                    onBriefSaved={handleBriefSaved}
                    onAuditUpdated={onAuditUpdated}
                  />
                )}

                {isRiskExpanded && (
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
                    onAuditUpdated={onAuditUpdated}
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
