 'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '../utils/supabase/client'

export interface ChecklistStep {
  id: string
  text: string
  done: boolean
}

export interface SopChecklist {
  id: string
  created_at: string
  updated_at: string
  title: string
  category: string
  items: ChecklistStep[]
  notes: string | null
}

interface SopChecklistsProps {
  userEmail: string
  onAuditUpdated?: () => void
}

export default function SopChecklists({ userEmail, onAuditUpdated }: SopChecklistsProps) {
  const supabase = useMemo(() => createClient(), [])

  const [checklists, setChecklists] = useState<SopChecklist[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string>('TUTTE')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Viaggi & Trasferte')
  const [rawSteps, setRawSteps] = useState('')
  const [notes, setNotes] = useState('')

  const loadChecklists = useCallback(async () => {
    const { data, error: fetchErr } = await supabase
      .from('sop_checklists')
      .select('*')
      .order('created_at', { ascending: true })

    if (fetchErr) {
      setError('Errore caricamento archivio SOP e Checklist.')
      return
    }

    if (data) {
      const normalized = data.map((row: any) => ({
        ...row,
        items: Array.isArray(row.items) ? row.items : [],
      }))
      setChecklists(normalized)
    }
  }, [supabase])

  useEffect(() => {
    loadChecklists()
  }, [loadChecklists])

  const handleCreateSop = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const parsedSteps: ChecklistStep[] = rawSteps
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line, idx) => ({
          id: `${Date.now()}-${idx}`,
          text: line,
          done: false,
        }))

      if (parsedSteps.length === 0) {
        throw new Error('Inserisci almeno un punto operativo per la checklist.')
      }

      const { error: insErr } = await supabase.from('sop_checklists').insert([
        {
          title: title.trim(),
          category,
          items: parsedSteps,
          notes: notes.trim() || null,
        },
      ])

      if (insErr) throw insErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `SOP_CREATE: ${title.trim()} (${category})`,
          status: 'SUCCESS',
        },
      ])

      setTitle('')
      setCategory('Viaggi & Trasferte')
      setRawSteps('')
      setNotes('')
      setShowForm(false)
      await loadChecklists()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore creazione procedura SOP.')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStep = async (sop: SopChecklist, stepId: string) => {
    const updatedItems = sop.items.map((item) =>
      item.id === stepId ? { ...item, done: !item.done } : item
    )

    setChecklists((prev) =>
      prev.map((c) => (c.id === sop.id ? { ...c, items: updatedItems } : c))
    )

    const { error: updErr } = await supabase
      .from('sop_checklists')
      .update({
        items: updatedItems,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sop.id)

    if (updErr) {
      setError('Impossibile salvare lo stato della checklist.')
      await loadChecklists()
    }
  }

  const handleResetChecklist = async (sop: SopChecklist) => {
    const resetItems = sop.items.map((item) => ({ ...item, done: false }))

    setChecklists((prev) =>
      prev.map((c) => (c.id === sop.id ? { ...c, items: resetItems } : c))
    )

    const { error: updErr } = await supabase
      .from('sop_checklists')
      .update({
        items: resetItems,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sop.id)

    if (updErr) {
      setError('Impossibile azzerare le spunte.')
      await loadChecklists()
    }
  }

  const handleDeleteSop = async (sop: SopChecklist) => {
    const { error: delErr } = await supabase
      .from('sop_checklists')
      .delete()
      .eq('id', sop.id)

    if (delErr) {
      setError('Errore eliminazione SOP.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `SOP_DELETE: ${sop.title}`,
        status: 'SUCCESS',
      },
    ])

    await loadChecklists()
    if (onAuditUpdated) onAuditUpdated()
  }

  const filteredChecklists = checklists.filter((c) =>
    categoryFilter === 'TUTTE' ? true : c.category === categoryFilter
  )

  return (
    <div className="bg-neutral-900 border-2 border-yellow-500/70 rounded-lg p-6 shadow-xl space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-yellow-500/30 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-bold uppercase">
              PROTOCOL &amp; SOP
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-100">
              Archivio SOP &amp; Checklist Operative
            </h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Procedure standard interattive per trasferte, accoglienza ospiti VIP e contingenza
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              'TUTTE',
              'Viaggi & Trasferte',
              'Accoglienza & Sede',
              'Sicurezza & Emergenze',
              'Amministrazione',
            ] as const
          ).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={
                'px-2.5 py-1 rounded text-[11px] uppercase border transition ' +
                (categoryFilter === cat
                  ? 'bg-neutral-200 text-neutral-950 border-neutral-200 font-bold'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600')
              }
            >
              {cat}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="ml-1 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
          >
            {showForm ? 'Chiudi Modulo' : '+ Nuova SOP'}
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
          onSubmit={handleCreateSop}
          className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3 text-xs"
        >
          <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
            Nuova Procedura Standard / Checklist Ricorrente
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Titolo Procedura *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Checklist Chiusura Mese / Preparazione CDA"
                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                Area Operativa
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
              >
                <option value="Viaggi & Trasferte">Viaggi &amp; Trasferte</option>
                <option value="Accoglienza & Sede">Accoglienza &amp; Sede</option>
                <option value="Sicurezza & Emergenze">Sicurezza &amp; Emergenze</option>
                <option value="Amministrazione">Amministrazione</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase text-neutral-400 mb-1">
              Passaggi della Checklist (scrivi un punto per riga) *
            </label>
            <textarea
              rows={4}
              required
              value={rawSteps}
              onChange={(e) => setRawSteps(e.target.value)}
              placeholder={'Verifica documenti\nConferma prenotazione\nInvio riepilogo al Direttore'}
              className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase text-neutral-400 mb-1">
              Note o Tempistiche Standard (Opzionale)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Da eseguire ogni venerdi entro le 16:00"
              className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase px-5 py-2 rounded transition disabled:opacity-50"
            >
              {loading ? 'Salvataggio...' : 'Salva Procedura'}
            </button>
          </div>
        </form>
      )}

      {filteredChecklists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {filteredChecklists.map((sop) => {
            const total = sop.items.length
            const completed = sop.items.filter((i) => i.done).length
            const isAllDone = total > 0 && completed === total

            return (
              <div
                key={sop.id}
                className={
                  'bg-neutral-950 border rounded-lg p-4 flex flex-col justify-between gap-3 ' +
                  (isAllDone ? 'border-emerald-700/80' : 'border-neutral-800/90')
                }
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="inline-block px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10px] text-amber-300 font-semibold uppercase">
                        {sop.category}
                      </span>
                      <h3 className="text-sm font-bold text-neutral-100">{sop.title}</h3>
                    </div>

                    <span
                      className={
                        'shrink-0 px-2 py-0.5 rounded border text-[10px] font-bold ' +
                        (isAllDone
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : 'bg-neutral-900 text-neutral-300 border-neutral-700')
                      }
                    >
                      {completed}/{total}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {sop.items.map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => handleToggleStep(sop, step.id)}
                        className="w-full text-left flex items-start gap-2.5 p-1.5 rounded hover:bg-neutral-900/90 transition"
                      >
                        <span
                          className={
                            'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px] font-bold ' +
                            (step.done
                              ? 'bg-emerald-500 border-emerald-400 text-neutral-950'
                              : 'bg-neutral-900 border-neutral-600 text-transparent')
                          }
                        >
                          &#10003;
                        </span>
                        <span
                          className={
                            step.done ? 'line-through text-neutral-500' : 'text-neutral-200'
                          }
                        >
                          {step.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-neutral-800/80 pt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-500 italic truncate">
                    {sop.notes || 'Procedura operativa attiva'}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {completed > 0 && (
                      <button
                        type="button"
                        onClick={() => handleResetChecklist(sop)}
                        className="text-[11px] uppercase text-amber-300 hover:text-amber-200"
                      >
                        Azzera
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteSop(sop)}
                      className="text-[11px] uppercase text-neutral-500 hover:text-red-400"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
          Nessuna procedura SOP presente in questa categoria.
        </div>
      )}
    </div>
  )
}
