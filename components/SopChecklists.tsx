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
    <div className="bg-neutral-900 border border-neutral-800 border-t-2 border-t-emerald-500 rounded-xl p-4 sm:p-6 shadow-xl space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-xs font-bold uppercase">
              Protocol &amp; SOP
            </span>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-white">
              Archivio SOP &amp; Checklist Operative
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
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
                'min-h-[36px] px-3 py-1.5 rounded-lg text-xs uppercase border transition ' +
                (categoryFilter === cat
                  ? 'bg-neutral-100 text-neutral-950 border-neutral-100 font-bold'
                  : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
              }
            >
              {cat}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="min-h-[38px] bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-1.5 rounded-lg transition"
          >
            {showForm ? 'Chiudi Modulo' : '+ Nuova SOP'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-lg">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreateSop}
          className="p-4 sm:p-5 bg-neutral-950 border border-neutral-800 rounded-xl space-y-4 text-sm"
        >
          <div className="text-sm uppercase tracking-wider text-emerald-400 font-bold">
            Nuova Procedura Standard / Checklist Ricorrente
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Titolo Procedura *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Checklist Preparazione Trasferta / Controllo Mezzo"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                Area Operativa
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
              >
                <option value="Viaggi & Trasferte">Viaggi &amp; Trasferte</option>
                <option value="Accoglienza & Sede">Accoglienza &amp; Sede</option>
                <option value="Sicurezza & Emergenze">Sicurezza &amp; Emergenze</option>
                <option value="Amministrazione">Amministrazione</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
              Passaggi della Checklist (scrivi un punto per riga) *
            </label>
            <textarea
              rows={4}
              required
              value={rawSteps}
              onChange={(e) => setRawSteps(e.target.value)}
              placeholder={'Verifica documenti\nConferma prenotazione\nInvio riepilogo al Direttore'}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
              Note o Tempistiche Standard (Opzionale)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Da eseguire almeno 24 ore prima della partenza"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="min-h-[40px] bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase px-5 py-2 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Salvataggio...' : 'Salva Procedura'}
            </button>
          </div>
        </form>
      )}

      {filteredChecklists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {filteredChecklists.map((sop) => {
            const total = sop.items.length
            const completed = sop.items.filter((i) => i.done).length
            const isAllDone = total > 0 && completed === total

            return (
              <div
                key={sop.id}
                className={
                  'bg-neutral-950 border rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 ' +
                  (isAllDone ? 'border-emerald-600/80' : 'border-neutral-800')
                }
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="space-y-1.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-xs text-amber-300 font-semibold uppercase">
                        {sop.category}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-white">{sop.title}</h3>
                    </div>

                    <span
                      className={
                        'shrink-0 px-2.5 py-1 rounded-md border text-xs font-mono font-bold ' +
                        (isAllDone
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : 'bg-neutral-900 text-neutral-200 border-neutral-700')
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
                        className="w-full min-h-[40px] text-left flex items-start gap-3 p-2 rounded-lg hover:bg-neutral-900 transition"
                      >
                        <span
                          className={
                            'mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 text-xs font-bold ' +
                            (step.done
                              ? 'bg-emerald-400 border-emerald-300 text-neutral-950'
                              : 'bg-neutral-900 border-neutral-600 text-transparent')
                          }
                        >
                          &#10003;
                        </span>
                        <span
                          className={
                            'leading-snug ' +
                            (step.done ? 'line-through text-neutral-500' : 'text-neutral-100')
                          }
                        >
                          {step.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-neutral-800 pt-3 flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-neutral-400 italic truncate">
                    {sop.notes || 'Procedura operativa attiva'}
                  </span>

                  <div className="flex items-center gap-3 shrink-0">
                    {completed > 0 && (
                      <button
                        type="button"
                        onClick={() => handleResetChecklist(sop)}
                        className="text-xs font-bold uppercase text-amber-300 hover:text-amber-200 py-1"
                      >
                        Azzera
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteSop(sop)}
                      className="text-xs font-semibold uppercase text-neutral-400 hover:text-red-400 py-1"
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
        <div className="py-8 text-center text-sm text-neutral-400 border border-dashed border-neutral-800 rounded-xl">
          Nessuna procedura SOP presente in questa categoria.
        </div>
      )}
    </div>
  )
}
