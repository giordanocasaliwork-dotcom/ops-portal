 'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '../utils/supabase/client'

export interface ExecutiveAppointment {
  id: string
  created_at: string
  updated_at: string
  title: string
  start_time: string
  end_time: string
  location_type: string
  location_details: string | null
  participants: string | null
  meeting_agenda: string | null
  prep_notes: string | null
  status: 'CONFERMATO' | 'DA CONFERMARE' | 'RINVIATO' | 'COMPLETATO'
}

interface ExecutiveAppointmentsProps {
  userEmail: string
  userId: string
  onAuditUpdated?: () => void
}

export default function ExecutiveAppointments({
  userEmail,
  userId,
  onAuditUpdated,
}: ExecutiveAppointmentsProps) {
  const supabase = useMemo(() => createClient(), [])

  const [appointments, setAppointments] = useState<ExecutiveAppointment[]>([])
  const [filter, setFilter] = useState<'PROSSIMI' | 'OGGI' | 'TUTTI' | 'COMPLETATI'>('PROSSIMI')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [locationType, setLocationType] = useState('Ufficio / Sede Centrale')
  const [locationDetails, setLocationDetails] = useState('')
  const [participants, setParticipants] = useState('')
  const [meetingAgenda, setMeetingAgenda] = useState('')
  const [prepNotes, setPrepNotes] = useState('')
  const [status, setStatus] = useState<'CONFERMATO' | 'DA CONFERMARE' | 'RINVIATO' | 'COMPLETATO'>(
    'CONFERMATO'
  )

  const loadAppointments = useCallback(async () => {
    const { data, error: fetchErr } = await supabase
      .from('executive_appointments')
      .select('*')
      .order('start_time', { ascending: true })

    if (fetchErr) {
      setError('Errore caricamento agenda appuntamenti Direzione.')
      return
    }
    if (data) {
      setAppointments(data as ExecutiveAppointment[])
    }
  }, [supabase])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setStartTime('')
    setEndTime('')
    setLocationType('Ufficio / Sede Centrale')
    setLocationDetails('')
    setParticipants('')
    setMeetingAgenda('')
    setPrepNotes('')
    setStatus('CONFERMATO')
    setShowForm(false)
  }

  const toLocalInputFormat = (isoString: string) => {
    const d = new Date(isoString)
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

  const handleDownloadIcs = (appt: ExecutiveAppointment) => {
    const locationStr = `${appt.location_type}${
      appt.location_details ? ' - ' + appt.location_details : ''
    }`
    const descParts = [
      appt.participants ? `Partecipanti: ${appt.participants}` : null,
      appt.meeting_agenda ? `Ordine del Giorno: ${appt.meeting_agenda}` : null,
      appt.prep_notes ? `Note Preparatorie: ${appt.prep_notes}` : null,
    ].filter(Boolean)

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Ops Portal//Executive Control Room//IT',
      'BEGIN:VEVENT',
      `UID:appt-${appt.id}@ops-portal`,
      `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
      `DTSTART:${formatIcsDate(appt.start_time)}`,
      `DTEND:${formatIcsDate(appt.end_time)}`,
      `SUMMARY:${escapeIcsText(appt.title)}`,
      `LOCATION:${escapeIcsText(locationStr)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `incontro-${appt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handlePrintAppointment = (appt: ExecutiveAppointment) => {
    const printWin = window.open('', '_blank', 'width=850,height=950')
    if (!printWin) {
      setError('Abilita i pop-up del browser per generare la scheda PDF/stampa.')
      return
    }

    const escapeHtml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="utf-8" />
        <title>Scheda Incontro - ${escapeHtml(appt.title)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; padding: 40px; line-height: 1.5; }
          .header { border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
          .tag { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #555; }
          h1 { font-size: 22px; margin: 4px 0 0 0; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f7f7f7; border: 1px solid #ddd; padding: 16px; border-radius: 6px; margin-bottom: 24px; font-size: 13px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }
          .box { font-size: 14px; padding: 10px 12px; border-left: 3px solid #111; background: #fafafa; }
          .footer { margin-top: 40px; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="tag">RISERVATO DIREZIONE • SCHEDA BRIEFING INCONTRO</div>
            <h1>${escapeHtml(appt.title)}</h1>
          </div>
          <div class="tag">STATO: ${escapeHtml(appt.status)}</div>
        </div>
        <div class="meta-grid">
          <div><strong>Data e Orario:</strong><br/>${escapeHtml(formatDateTime(appt.start_time))} &rarr; ${escapeHtml(formatTimeOnly(appt.end_time))}</div>
          <div><strong>Sede / Location:</strong><br/>${escapeHtml(appt.location_type)}${appt.location_details ? ' — ' + escapeHtml(appt.location_details) : ''}</div>
          <div style="grid-column: span 2;"><strong>Partecipanti / Interlocutori:</strong><br/>${appt.participants ? escapeHtml(appt.participants) : 'Non specificati'}</div>
        </div>
        <div class="section">
          <div class="section-title">Ordine del Giorno &amp; Dettagli Specifici</div>
          <div class="box">${appt.meeting_agenda ? escapeHtml(appt.meeting_agenda) : 'Nessun dettaglio specifico inserito.'}</div>
        </div>
        <div class="section">
          <div class="section-title">Materiali Preparatori &amp; Note Riservate</div>
          <div class="box">${appt.prep_notes ? escapeHtml(appt.prep_notes) : 'Nessuna nota preparatoria.'}</div>
        </div>
        <div class="footer">Documento generato da Ops Portal • Executive Control Room il ${new Date().toLocaleString('it-IT')}</div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `)
    printWin.document.close()
  }

  const handleEditClick = (appt: ExecutiveAppointment) => {
    setEditingId(appt.id)
    setTitle(appt.title)
    setStartTime(toLocalInputFormat(appt.start_time))
    setEndTime(toLocalInputFormat(appt.end_time))
    setLocationType(appt.location_type || 'Ufficio / Sede Centrale')
    setLocationDetails(appt.location_details || '')
    setParticipants(appt.participants || '')
    setMeetingAgenda(appt.meeting_agenda || '')
    setPrepNotes(appt.prep_notes || '')
    setStatus(appt.status)
    setShowForm(true)
  }

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload = {
        title: title.trim(),
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        location_type: locationType,
        location_details: locationDetails.trim() || null,
        participants: participants.trim() || null,
        meeting_agenda: meetingAgenda.trim() || null,
        prep_notes: prepNotes.trim() || null,
        status,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        const { error: updErr } = await supabase
          .from('executive_appointments')
          .update(payload)
          .eq('id', editingId)

        if (updErr) throw updErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `EXEC_APPT_UPDATE: ${title.trim()}`,
            status: 'SUCCESS',
          },
        ])
      } else {
        const { error: insErr } = await supabase.from('executive_appointments').insert([
          {
            ...payload,
            created_by: userId,
          },
        ])

        if (insErr) throw insErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `EXEC_APPT_CREATE: ${title.trim()}`,
            status: 'SUCCESS',
          },
        ])
      }

      resetForm()
      await loadAppointments()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore salvataggio appuntamento.')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (
    appt: ExecutiveAppointment,
    newStatus: ExecutiveAppointment['status']
  ) => {
    const { error: updErr } = await supabase
      .from('executive_appointments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', appt.id)

    if (updErr) {
      setError('Impossibile aggiornare lo stato dell appuntamento.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `EXEC_APPT_STATUS: ${appt.title} -> ${newStatus}`,
        status: 'SUCCESS',
      },
    ])

    await loadAppointments()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleDeleteAppointment = async (appt: ExecutiveAppointment) => {
    const { error: delErr } = await supabase
      .from('executive_appointments')
      .delete()
      .eq('id', appt.id)

    if (delErr) {
      setError('Errore eliminazione appuntamento.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `EXEC_APPT_DELETE: ${appt.title}`,
        status: 'SUCCESS',
      },
    ])

    await loadAppointments()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleCopySummary = async (appt: ExecutiveAppointment) => {
    const lines = [
      `SCHEDA INCONTRO DIREZIONE - ${appt.title.toUpperCase()}`,
      `Stato: ${appt.status}`,
      `Data e Ora: ${formatDateTime(appt.start_time)} -> ${formatTimeOnly(appt.end_time)}`,
      `Sede: ${appt.location_type}${appt.location_details ? ' - ' + appt.location_details : ''}`,
      appt.participants ? `Partecipanti: ${appt.participants}` : null,
      appt.meeting_agenda ? `Dettagli / Ordine del Giorno:\n${appt.meeting_agenda}` : null,
      appt.prep_notes ? `Note Preparatorie & Materiali:\n${appt.prep_notes}` : null,
    ].filter(Boolean)

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedId(appt.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setError('Impossibile copiare la scheda incontro.')
    }
  }

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString('it-IT', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatTimeOnly = (iso: string) => {
    return new Date(iso).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusBadge = (s: ExecutiveAppointment['status']) => {
    if (s === 'CONFERMATO') return 'bg-emerald-950/90 text-emerald-300 border-emerald-500'
    if (s === 'DA CONFERMARE') return 'bg-yellow-950/90 text-yellow-300 border-yellow-500'
    if (s === 'RINVIATO') return 'bg-red-950/80 text-red-300 border-red-600'
    return 'bg-neutral-800 text-neutral-400 border-neutral-700'
  }

  const todayKey = new Date().toDateString()
  const todayCount = appointments.filter(
    (a) => new Date(a.start_time).toDateString() === todayKey && a.status !== 'COMPLETATO'
  ).length

  const filteredAppointments = appointments.filter((a) => {
    if (filter === 'OGGI') {
      return new Date(a.start_time).toDateString() === todayKey
    }
    if (filter === 'PROSSIMI') {
      return a.status !== 'COMPLETATO'
    }
    if (filter === 'COMPLETATI') {
      return a.status === 'COMPLETATO'
    }
    return true
  })

  return (
    <div className="bg-neutral-900 border-2 border-green-500/80 rounded-lg p-6 shadow-xl space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-green-500/30 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-yellow-400 text-neutral-950 text-[10px] font-bold uppercase">
              RISERVATO DIREZIONE
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-yellow-300">
              Agenda Appuntamenti &amp; Meeting (Ufficio / Sedi Esterne)
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Calendario incontri direzionali, partecipanti, ordine del giorno e dossier preparatori
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['PROSSIMI', 'OGGI', 'TUTTI', 'COMPLETATI'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={
                'px-2.5 py-1 rounded text-[11px] uppercase border transition ' +
                (filter === tab
                  ? 'bg-yellow-400 text-neutral-950 border-yellow-400 font-bold'
                  : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:border-yellow-500/60')
              }
            >
              {tab === 'OGGI' ? `Oggi (${todayCount})` : tab}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              if (showForm) {
                resetForm()
              } else {
                setShowForm(true)
              }
            }}
            className="ml-1 bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
          >
            {showForm ? 'Chiudi Modulo' : '+ Nuovo Appuntamento'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSaveAppointment}
          className="p-4 bg-neutral-950 border-2 border-emerald-400/80 rounded-lg space-y-4 text-xs"
        >
          <div className="text-xs uppercase tracking-wider text-emerald-300 font-bold">
            {editingId ? 'Modifica Appuntamento Direzione' : 'Pianifica Nuovo Incontro / Meeting'}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Oggetto / Titolo Incontro *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Riunione Strategica / Incontro Avv. Rossi / Board"
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                  Inizio *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                  Fine *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Tipologia Sede
              </label>
              <select
                value={locationType}
                onChange={(e) => setLocationType(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
              >
                <option value="Ufficio / Sede Centrale">Ufficio / Sede Centrale</option>
                <option value="Sede Esterna / Trasferta">Sede Esterna / Trasferta</option>
                <option value="Pranzo / Cena di Lavoro">Pranzo / Cena di Lavoro</option>
                <option value="Video / Call Riservata">Video / Call Riservata</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Indirizzo Esatto / Sala / Piattaforma
              </label>
              <input
                type="text"
                value={locationDetails}
                onChange={(e) => setLocationDetails(e.target.value)}
                placeholder="Es. Sala Riunioni Direzione / P.le Luigi Sturzo 15 / Link Zoom"
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Partecipanti / Interlocutori
              </label>
              <input
                type="text"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="Nomi, qualifiche e societa presenti"
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Stato Conferma
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(
                    e.target.value as 'CONFERMATO' | 'DA CONFERMARE' | 'RINVIATO' | 'COMPLETATO'
                  )
                }
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
              >
                <option value="CONFERMATO">CONFERMATO</option>
                <option value="DA CONFERMARE">DA CONFERMARE</option>
                <option value="RINVIATO">RINVIATO</option>
                <option value="COMPLETATO">COMPLETATO</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Dettagli Specifici Incontro / Ordine del Giorno
              </label>
              <textarea
                rows={3}
                value={meetingAgenda}
                onChange={(e) => setMeetingAgenda(e.target.value)}
                placeholder="Punti da trattare, obiettivi, decisioni attese, contesto relazionale"
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Materiali Preparatori &amp; Note Riservate
              </label>
              <textarea
                rows={3}
                value={prepNotes}
                onChange={(e) => setPrepNotes(e.target.value)}
                placeholder="Documenti da portare, contratti in revisione, punti sensibili da evitare"
                className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-400 focus:outline-none rounded p-2 text-xs text-neutral-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="bg-neutral-900 text-neutral-400 border border-neutral-700 text-xs uppercase px-4 py-2 rounded"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs uppercase px-5 py-2 rounded transition disabled:opacity-50"
            >
              {loading
                ? 'Salvataggio...'
                : editingId
                ? 'Aggiorna Appuntamento'
                : 'Salva Appuntamento'}
            </button>
          </div>
        </form>
      )}

      {filteredAppointments.length > 0 ? (
        <div className="space-y-4">
          {filteredAppointments.map((appt) => {
            const isExpanded = expandedId === appt.id
            const isPhysicalLocation =
              appt.location_details &&
              appt.location_type !== 'Video / Call Riservata' &&
              !appt.location_details.toLowerCase().startsWith('http')

            return (
              <div
                key={appt.id}
                className="bg-neutral-950 border-2 border-emerald-500/80 border-l-4 border-l-emerald-400 rounded-lg p-4 space-y-3 text-xs shadow-md"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded bg-emerald-400 text-neutral-950 font-bold text-[11px]">
                        {formatDateTime(appt.start_time)} &rarr; {formatTimeOnly(appt.end_time)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${statusBadge(
                          appt.status
                        )}`}
                      >
                        {appt.status}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/50 text-[10px] text-emerald-300 font-semibold uppercase">
                        {appt.location_type}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-neutral-100 pt-0.5">{appt.title}</div>

                    {appt.location_details && (
                      <div className="flex flex-wrap items-center gap-2 text-neutral-300">
                        <span className="text-neutral-500">Luogo:</span>
                        <span>{appt.location_details}</span>
                        {isPhysicalLocation && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              appt.location_details
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border border-emerald-500/60 transition"
                          >
                            Maps &nearr;
                          </a>
                        )}
                      </div>
                    )}

                    {appt.participants && (
                      <div className="text-neutral-400">
                        <span className="text-neutral-500">Partecipanti:</span>{' '}
                        <span className="text-neutral-200">{appt.participants}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadIcs(appt)}
                      title="Scarica evento per Google Calendar / Apple Calendar"
                      className="bg-neutral-900 hover:bg-neutral-800 text-sky-300 border border-sky-800/80 text-xs px-2.5 py-1.5 rounded transition"
                    >
                      .ICS
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePrintAppointment(appt)}
                      title="Apri versione stampabile / Salva PDF"
                      className="bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs px-2.5 py-1.5 rounded transition"
                    >
                      PDF / Stampa
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : appt.id)}
                      className={
                        'px-2.5 py-1.5 rounded text-xs uppercase tracking-wider font-bold border transition ' +
                        (isExpanded
                          ? 'bg-emerald-400 text-neutral-950 border-emerald-400'
                          : 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 border-emerald-500/80')
                      }
                    >
                      {isExpanded ? 'Chiudi Dettagli' : 'Dettagli Incontro'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEditClick(appt)}
                      className="bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs px-2.5 py-1.5 rounded transition"
                    >
                      Modifica
                    </button>

                    <select
                      aria-label="Stato appuntamento"
                      value={appt.status}
                      onChange={(e) =>
                        handleStatusChange(
                          appt,
                          e.target.value as ExecutiveAppointment['status']
                        )
                      }
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs uppercase rounded px-2.5 py-1.5"
                    >
                      <option value="CONFERMATO">Confermato</option>
                      <option value="DA CONFERMARE">Da Confermare</option>
                      <option value="RINVIATO">Rinviato</option>
                      <option value="COMPLETATO">Completato</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleDeleteAppointment(appt)}
                      className="bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs px-2.5 py-1.5 rounded transition"
                    >
                      Elimina
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-emerald-500/30 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-neutral-900/80 border border-emerald-500/40 rounded p-3">
                      <div className="text-[10px] uppercase text-emerald-300 font-bold mb-1">
                        Ordine del Giorno &amp; Dettagli Specifici
                      </div>
                      <div className="text-neutral-200 whitespace-pre-line leading-relaxed">
                        {appt.meeting_agenda || 'Nessun dettaglio specifico inserito.'}
                      </div>
                    </div>

                    <div className="bg-neutral-900/80 border border-neutral-800 rounded p-3 flex flex-col justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase text-yellow-300 font-bold mb-1">
                          Materiali &amp; Note Preparatorie
                        </div>
                        <div className="text-neutral-200 whitespace-pre-line leading-relaxed">
                          {appt.prep_notes || 'Nessuna nota preparatoria allegata.'}
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => handleCopySummary(appt)}
                          className="bg-neutral-950 hover:bg-neutral-800 text-emerald-300 border border-emerald-500/70 text-[11px] uppercase px-3 py-1 rounded transition"
                        >
                          {copiedId === appt.id ? 'Scheda Copiata' : 'Copia Scheda Incontro'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
          Nessun appuntamento in agenda per questo filtro.
        </div>
      )}
    </div>
  )
}
