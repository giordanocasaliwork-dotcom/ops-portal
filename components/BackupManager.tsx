 'use client'

import { useMemo, useState } from 'react'
import { createClient } from '../utils/supabase/client'

interface BackupManagerProps {
  userEmail: string
  onAuditUpdated?: () => void
}

interface BackupDataset {
  exported_at: string
  exported_by: string
  tables: {
    executive_appointments: Record<string, unknown>[]
    missions: Record<string, unknown>[]
    mission_executive_briefs: Record<string, unknown>[]
    mission_risk_assessments: Record<string, unknown>[]
    executive_contacts: Record<string, unknown>[]
    vip_preferences: Record<string, unknown>[]
    action_items: Record<string, unknown>[]
    vendors: Record<string, unknown>[]
    expense_logs: Record<string, unknown>[]
    vehicles: Record<string, unknown>[]
    sop_checklists: Record<string, unknown>[]
    profiles: Record<string, unknown>[]
    audit_logs: Record<string, unknown>[]
  }
}

export default function BackupManager({ userEmail, onAuditUpdated }: BackupManagerProps) {
  const supabase = useMemo(() => createClient(), [])

  const [exportingFormat, setExportingFormat] = useState<'HTML' | 'JSON' | null>(null)
  const [lastBackupInfo, setLastBackupInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const getTimestampSlug = () => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
      now.getHours()
    )}-${pad(now.getMinutes())}`
  }

  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const collectAllData = async (): Promise<BackupDataset> => {
    const [
      apptsRes,
      missionsRes,
      briefsRes,
      risksRes,
      contactsRes,
      prefsRes,
      actionsRes,
      vendorsRes,
      expensesRes,
      vehiclesRes,
      sopRes,
      profilesRes,
      logsRes,
    ] = await Promise.all([
      supabase.from('executive_appointments').select('*').order('start_time', { ascending: false }),
      supabase.from('missions').select('*').order('start_time', { ascending: false }),
      supabase.from('mission_executive_briefs').select('*'),
      supabase.from('mission_risk_assessments').select('*'),
      supabase.from('executive_contacts').select('*').order('full_name', { ascending: true }),
      supabase.from('vip_preferences').select('*').order('category', { ascending: true }),
      supabase.from('action_items').select('*').order('created_at', { ascending: false }),
      supabase.from('vendors').select('*').order('name', { ascending: true }),
      supabase.from('expense_logs').select('*').order('expense_date', { ascending: false }),
      supabase.from('vehicles').select('*').order('callsign', { ascending: true }),
      supabase.from('sop_checklists').select('*').order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, email, full_name, callsign, role, is_active, created_at'),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
    ])

    return {
      exported_at: new Date().toISOString(),
      exported_by: userEmail,
      tables: {
        executive_appointments: (apptsRes.data as Record<string, unknown>[]) || [],
        missions: (missionsRes.data as Record<string, unknown>[]) || [],
        mission_executive_briefs: (briefsRes.data as Record<string, unknown>[]) || [],
        mission_risk_assessments: (risksRes.data as Record<string, unknown>[]) || [],
        executive_contacts: (contactsRes.data as Record<string, unknown>[]) || [],
        vip_preferences: (prefsRes.data as Record<string, unknown>[]) || [],
        action_items: (actionsRes.data as Record<string, unknown>[]) || [],
        vendors: (vendorsRes.data as Record<string, unknown>[]) || [],
        expense_logs: (expensesRes.data as Record<string, unknown>[]) || [],
        vehicles: (vehiclesRes.data as Record<string, unknown>[]) || [],
        sop_checklists: (sopRes.data as Record<string, unknown>[]) || [],
        profiles: (profilesRes.data as Record<string, unknown>[]) || [],
        audit_logs: (logsRes.data as Record<string, unknown>[]) || [],
      },
    }
  }

  const escapeHtml = (value: unknown): string => {
    if (value === null || value === undefined) return '-'
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  const buildHtmlSection = (
    sectionTitle: string,
    rows: Record<string, unknown>[],
    columns: { key: string; label: string }[]
  ): string => {
    if (rows.length === 0) {
      return `
        <section>
          <h2>${escapeHtml(sectionTitle)} (0)</h2>
          <p class="empty">Nessun record presente in questa sezione al momento del backup.</p>
        </section>
      `
    }

    const thead = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')
    const tbody = rows
      .map((row) => {
        const cells = columns.map((c) => `<td>${escapeHtml(row[c.key])}</td>`).join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    return `
      <section>
        <h2>${escapeHtml(sectionTitle)} (${rows.length})</h2>
        <div class="table-wrap">
          <table>
            <thead><tr>${thead}</tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </section>
    `
  }

  const buildStandaloneHtml = (dataset: BackupDataset): string => {
    const t = dataset.tables
    const dateReadable = new Date(dataset.exported_at).toLocaleString('it-IT')

    const sections = [
      buildHtmlSection('1. Agenda Appuntamenti & Meeting Direzione', t.executive_appointments, [
        { key: 'start_time', label: 'Inizio (ISO)' },
        { key: 'end_time', label: 'Fine (ISO)' },
        { key: 'status', label: 'Stato' },
        { key: 'title', label: 'Oggetto' },
        { key: 'location_type', label: 'Tipologia Sede' },
        { key: 'location_details', label: 'Indirizzo / Sala' },
        { key: 'participants', label: 'Partecipanti' },
        { key: 'meeting_agenda', label: 'Ordine del Giorno' },
        { key: 'prep_notes', label: 'Note Preparatorie' },
      ]),
      buildHtmlSection('2. Movimentazioni & Trasferte', t.missions, [
        { key: 'start_time', label: 'Inizio (ISO)' },
        { key: 'end_time', label: 'Fine (ISO)' },
        { key: 'status', label: 'Stato' },
        { key: 'client_vip', label: 'Cliente / VIP' },
        { key: 'pickup_point', label: 'Pick-up' },
        { key: 'dropoff_point', label: 'Drop-off' },
        { key: 'assigned_vehicle', label: 'Mezzo' },
        { key: 'notes', label: 'Note Logistica' },
      ]),
      buildHtmlSection('3. Dossier Direzionali & Travel PNR', t.mission_executive_briefs, [
        { key: 'mission_id', label: 'ID Missione' },
        { key: 'counterpart_name', label: 'Controparte' },
        { key: 'counterpart_role', label: 'Ruolo' },
        { key: 'meeting_objective', label: 'Obiettivo' },
        { key: 'talking_points', label: 'Talking Points' },
        { key: 'travel_booking_ref', label: 'Travel / PNR' },
        { key: 'hospitality_details', label: 'Ospitalita / Hotel' },
        { key: 'confidential_notes', label: 'Note Riservate' },
      ]),
      buildHtmlSection('4. Risk Assessment & Safe Havens', t.mission_risk_assessments, [
        { key: 'mission_id', label: 'ID Missione' },
        { key: 'threat_level', label: 'Livello Rischio' },
        { key: 'choke_points', label: 'Choke Points' },
        { key: 'safe_havens', label: 'Safe Havens / FFOO' },
        { key: 'medical_facilities', label: 'Strutture Sanitarie / DEA' },
        { key: 'evacuation_route', label: 'Esfiltrazione' },
        { key: 'emergency_contacts', label: 'Contatti Emergenza' },
      ]),
      buildHtmlSection('5. Gatekeeping & Rubrica Strategica VIP', t.executive_contacts, [
        { key: 'full_name', label: 'Nominativo' },
        { key: 'organization', label: 'Societa / Ente' },
        { key: 'role_title', label: 'Ruolo' },
        { key: 'category', label: 'Categoria' },
        { key: 'access_tier', label: 'Gatekeeping' },
        { key: 'nda_status', label: 'NDA' },
        { key: 'phone', label: 'Telefono' },
        { key: 'email', label: 'Email' },
        { key: 'relationship_notes', label: 'Note Relazionali' },
      ]),
      buildHtmlSection('6. Profilo & Preferenze Direzione', t.vip_preferences, [
        { key: 'category', label: 'Area' },
        { key: 'title', label: 'Voce' },
        { key: 'details', label: 'Dettagli Standard' },
      ]),
      buildHtmlSection('7. Action Tracker & Deleghe', t.action_items, [
        { key: 'priority', label: 'Priorita' },
        { key: 'status', label: 'Stato' },
        { key: 'title', label: 'Incarico' },
        { key: 'owner_name', label: 'Responsabile' },
        { key: 'due_date', label: 'Scadenza' },
        { key: 'notes', label: 'Note' },
      ]),
      buildHtmlSection('8. Fornitori Fidati', t.vendors, [
        { key: 'name', label: 'Fornitore' },
        { key: 'category', label: 'Categoria' },
        { key: 'city_area', label: 'Area' },
        { key: 'contact_info', label: 'Contatto H24' },
        { key: 'reliability_notes', label: 'Note Affidabilita' },
      ]),
      buildHtmlSection('9. Registro Spese Rapide', t.expense_logs, [
        { key: 'expense_date', label: 'Data' },
        { key: 'category', label: 'Categoria' },
        { key: 'description', label: 'Descrizione' },
        { key: 'amount', label: 'Importo (EUR)' },
        { key: 'mission_ref', label: 'Riferimento' },
        { key: 'reimbursement_status', label: 'Stato Rimborso' },
      ]),
      buildHtmlSection('10. Flotta & Assetti Mobili', t.vehicles, [
        { key: 'callsign', label: 'Callsign' },
        { key: 'model', label: 'Modello' },
        { key: 'plate', label: 'Targa' },
        { key: 'category', label: 'Categoria' },
        { key: 'status', label: 'Stato' },
      ]),
      buildHtmlSection('11. Archivio SOP & Checklist', t.sop_checklists, [
        { key: 'category', label: 'Categoria' },
        { key: 'title', label: 'Procedura' },
        { key: 'items', label: 'Passaggi (JSON)' },
        { key: 'notes', label: 'Note' },
      ]),
      buildHtmlSection('12. Personale & Clearance Team', t.profiles, [
        { key: 'callsign', label: 'Callsign' },
        { key: 'full_name', label: 'Nominativo' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Ruolo' },
        { key: 'is_active', label: 'Attivo' },
      ]),
      buildHtmlSection('13. Audit Log (Ultimi 200 Eventi)', t.audit_logs, [
        { key: 'created_at', label: 'Data / Ora' },
        { key: 'user_email', label: 'Utente' },
        { key: 'action', label: 'Azione' },
        { key: 'status', label: 'Esito' },
      ]),
    ].join('\n')

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Ops Portal - Archivio Cold Storage (${escapeHtml(dateReadable)})</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f4f5; color: #18181b; margin: 0; padding: 28px; font-size: 13px; }
    .container { max-width: 1200px; margin: 0 auto; background: #ffffff; border: 1px solid #d4d4d8; border-radius: 8px; padding: 28px; }
    header { border-bottom: 2px solid #18181b; padding-bottom: 14px; margin-bottom: 24px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
    h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px; }
    .meta { font-size: 12px; color: #52525b; }
    section { margin-bottom: 28px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.8px; color: #065f46; border-bottom: 1px solid #e4e4e7; padding-bottom: 6px; margin-bottom: 10px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e4e4e7; padding: 7px 9px; text-align: left; vertical-align: top; }
    th { background: #f4f4f5; font-weight: 700; text-transform: uppercase; font-size: 11px; color: #3f3f46; }
    tr:nth-child(even) td { background: #fafafa; }
    .empty { color: #71717a; font-style: italic; font-size: 12px; }
    @media print { body { background: #fff; padding: 0; } .container { border: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Ops Portal • Archivio Riservato Cold Storage (USB)</h1>
        <div class="meta">Estrazione completa dati operativi, agenda, rubriche e rendicontazione</div>
      </div>
      <div class="meta">
        <strong>Data estrazione:</strong> ${escapeHtml(dateReadable)}<br/>
        <strong>Amministratore:</strong> ${escapeHtml(dataset.exported_by)}
      </div>
    </header>
    ${sections}
  </div>
</body>
</html>`
  }

  const handleExport = async (format: 'HTML' | 'JSON') => {
    setExportingFormat(format)
    setError(null)

    try {
      const dataset = await collectAllData()
      const slug = getTimestampSlug()

      if (format === 'JSON') {
        const filename = `ops-portal-backup-${slug}.json`
        triggerDownload(
          JSON.stringify(dataset, null, 2),
          filename,
          'application/json;charset=utf-8'
        )
        setLastBackupInfo(`File ${filename} scaricato. Pronto per salvataggio su drive esterno USB.`)
      } else {
        const filename = `ops-portal-archivio-${slug}.html`
        const htmlContent = buildStandaloneHtml(dataset)
        triggerDownload(htmlContent, filename, 'text/html;charset=utf-8')
        setLastBackupInfo(
          `Archivio offline ${filename} scaricato. Apribile da USB su qualsiasi dispositivo senza internet.`
        )
      }

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `COLD_STORAGE_BACKUP_EXPORT (${format})`,
          status: 'SUCCESS',
        },
      ])

      if (onAuditUpdated) onAuditUpdated()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Errore durante la generazione del backup.'
      setError(message)
    } finally {
      setExportingFormat(null)
    }
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 border-t-2 border-t-red-500 rounded-xl p-4 sm:p-6 shadow-xl space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/40 text-xs font-bold uppercase">
              Cold Storage • Solo Admin
            </span>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-white">
              Backup Completo &amp; Esportazione Dati su USB
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Scarica l&apos;intero archivio operativo in formato HTML consultabile offline da chiavetta USB oppure in JSON grezzo
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={exportingFormat !== null}
            onClick={() => handleExport('HTML')}
            className="min-h-[42px] bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {exportingFormat === 'HTML'
              ? 'Generazione Archivio...'
              : 'Scarica Archivio Offline (.HTML)'}
          </button>

          <button
            type="button"
            disabled={exportingFormat !== null}
            onClick={() => handleExport('JSON')}
            className="min-h-[42px] bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 font-semibold text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {exportingFormat === 'JSON'
              ? 'Esportazione JSON...'
              : 'Scarica Dati Grezzi (.JSON)'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-xl">
          {error}
        </div>
      )}

      {lastBackupInfo && (
        <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/80 text-emerald-200 text-sm rounded-xl flex items-center justify-between gap-3">
          <span>{lastBackupInfo}</span>
          <button
            type="button"
            onClick={() => setLastBackupInfo(null)}
            className="text-xs font-bold uppercase text-emerald-300 hover:text-white shrink-0"
          >
            Chiudi
          </button>
        </div>
      )}
    </div>
  )
}
