 'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '../utils/supabase/client'

export interface ActionItem {
  id: string
  created_at: string
  title: string
  owner_name: string
  due_date: string | null
  priority: 'ALTA' | 'MEDIA' | 'BASSA'
  status: 'DA FARE' | 'IN CORSO' | 'COMPLETATO'
  notes: string | null
}

export interface VendorItem {
  id: string
  created_at: string
  name: string
  category: string
  city_area: string | null
  contact_info: string | null
  reliability_notes: string | null
}

export interface ExpenseLogItem {
  id: string
  created_at: string
  expense_date: string
  description: string
  category: string
  amount: number
  mission_ref: string | null
  reimbursement_status: 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
}

interface OperationsControlProps {
  userEmail: string
  onAuditUpdated?: () => void
}

export default function OperationsControl({
  userEmail,
  onAuditUpdated,
}: OperationsControlProps) {
  const supabase = useMemo(() => createClient(), [])

  const [activeTab, setActiveTab] = useState<'actions' | 'vendors' | 'expenses'>('actions')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [actions, setActions] = useState<ActionItem[]>([])
  const [vendors, setVendors] = useState<VendorItem[]>([])
  const [expenses, setExpenses] = useState<ExpenseLogItem[]>([])

  const [actionFilter, setActionFilter] = useState<'ATTIVI' | 'TUTTI' | 'COMPLETATO'>('ATTIVI')
  const [showActionForm, setShowActionForm] = useState(false)
  const [copiedActions, setCopiedActions] = useState(false)
  const [actionTitle, setActionTitle] = useState('')
  const [actionOwner, setActionOwner] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [actionPriority, setActionPriority] = useState<'ALTA' | 'MEDIA' | 'BASSA'>('MEDIA')
  const [actionNotes, setActionNotes] = useState('')

  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState('TUTTE')
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [vendorName, setVendorName] = useState('')
  const [vendorCategory, setVendorCategory] = useState('NCC / Transfer')
  const [vendorCity, setVendorCity] = useState('')
  const [vendorContact, setVendorContact] = useState('')
  const [vendorNotes, setVendorNotes] = useState('')

  const [expenseFilter, setExpenseFilter] = useState<
    'TUTTE' | 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
  >('TUTTE')
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [copiedExpenses, setCopiedExpenses] = useState(false)
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('Trasporti / NCC')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseMissionRef, setExpenseMissionRef] = useState('')

  const loadAllOperations = useCallback(async () => {
    const [actionsRes, vendorsRes, expensesRes] = await Promise.all([
      supabase
        .from('action_items')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('vendors')
        .select('*')
        .order('name', { ascending: true }),
      supabase
        .from('expense_logs')
        .select('*')
        .order('expense_date', { ascending: false }),
    ])

    if (actionsRes.data) setActions(actionsRes.data)
    if (vendorsRes.data) setVendors(vendorsRes.data)
    if (expensesRes.data) setExpenses(expensesRes.data)
  }, [supabase])

  useEffect(() => {
    loadAllOperations()
  }, [loadAllOperations])

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insErr } = await supabase.from('action_items').insert([
        {
          title: actionTitle.trim(),
          owner_name: actionOwner.trim(),
          due_date: actionDueDate ? new Date(actionDueDate).toISOString() : null,
          priority: actionPriority,
          status: 'DA FARE',
          notes: actionNotes.trim() || null,
        },
      ])

      if (insErr) throw insErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `DELEGA_ADD: ${actionTitle.trim()} -> ${actionOwner.trim()} [${actionPriority}]`,
          status: 'SUCCESS',
        },
      ])

      setActionTitle('')
      setActionOwner('')
      setActionDueDate('')
      setActionPriority('MEDIA')
      setActionNotes('')
      setShowActionForm(false)
      await loadAllOperations()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore registrazione delega/task.')
    } finally {
      setLoading(false)
    }
  }

  const handleActionStatusChange = async (
    item: ActionItem,
    newStatus: 'DA FARE' | 'IN CORSO' | 'COMPLETATO'
  ) => {
    const { error: updErr } = await supabase
      .from('action_items')
      .update({ status: newStatus })
      .eq('id', item.id)

    if (updErr) {
      setError('Impossibile aggiornare lo stato della delega.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `DELEGA_STATUS: ${item.title} -> ${newStatus}`,
        status: 'SUCCESS',
      },
    ])

    await loadAllOperations()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleDeleteAction = async (item: ActionItem) => {
    const { error: delErr } = await supabase.from('action_items').delete().eq('id', item.id)
    if (delErr) {
      setError('Errore eliminazione delega.')
      return
    }
    await loadAllOperations()
  }

  const handleCopyActionsReport = async () => {
    const activeList = actions.filter((a) => a.status !== 'COMPLETATO')
    const lines = [
      'REPORT DELEGHE & FOLLOW-UP DIREZIONE',
      '--------------------------------------------------',
      ...(activeList.length === 0
        ? ['Nessuna delega aperta in sospeso.']
        : activeList.map((a, i) => {
            const dueStr = a.due_date
              ? new Date(a.due_date).toLocaleString('it-IT', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Nessuna scadenza'
            return `${i + 1}. [${a.priority}] ${a.title} | Ref: ${a.owner_name} | Scad: ${dueStr} (${a.status})`
          })),
    ]

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedActions(true)
      setTimeout(() => setCopiedActions(false), 2500)
    } catch {
      setError('Impossibile copiare il report deleghe.')
    }
  }

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insErr } = await supabase.from('vendors').insert([
        {
          name: vendorName.trim(),
          category: vendorCategory,
          city_area: vendorCity.trim() || null,
          contact_info: vendorContact.trim() || null,
          reliability_notes: vendorNotes.trim() || null,
        },
      ])

      if (insErr) throw insErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `VENDOR_ADD: ${vendorName.trim()} (${vendorCategory})`,
          status: 'SUCCESS',
        },
      ])

      setVendorName('')
      setVendorCategory('NCC / Transfer')
      setVendorCity('')
      setVendorContact('')
      setVendorNotes('')
      setShowVendorForm(false)
      await loadAllOperations()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore salvataggio fornitore.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVendor = async (vendor: VendorItem) => {
    const { error: delErr } = await supabase.from('vendors').delete().eq('id', vendor.id)
    if (delErr) {
      setError('Errore rimozione fornitore.')
      return
    }
    await loadAllOperations()
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const parsedAmount = parseFloat(expenseAmount.replace(',', '.'))
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new Error('Inserisci un importo numerico valido.')
      }

      const { error: insErr } = await supabase.from('expense_logs').insert([
        {
          expense_date: expenseDate,
          description: expenseDesc.trim(),
          category: expenseCategory,
          amount: parsedAmount,
          mission_ref: expenseMissionRef.trim() || null,
          reimbursement_status: 'DA RENDICONTARE',
        },
      ])

      if (insErr) throw insErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `EXPENSE_ADD: ${expenseDesc.trim()} (EUR ${parsedAmount.toFixed(2)})`,
          status: 'SUCCESS',
        },
      ])

      setExpenseDesc('')
      setExpenseAmount('')
      setExpenseMissionRef('')
      setShowExpenseForm(false)
      await loadAllOperations()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore registrazione spesa.')
    } finally {
      setLoading(false)
    }
  }

  const handleExpenseStatusChange = async (
    exp: ExpenseLogItem,
    newStatus: 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
  ) => {
    const { error: updErr } = await supabase
      .from('expense_logs')
      .update({ reimbursement_status: newStatus })
      .eq('id', exp.id)

    if (updErr) {
      setError('Impossibile aggiornare stato rimborso.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `EXPENSE_STATUS: ${exp.description} -> ${newStatus}`,
        status: 'SUCCESS',
      },
    ])

    await loadAllOperations()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleDeleteExpense = async (exp: ExpenseLogItem) => {
    const { error: delErr } = await supabase.from('expense_logs').delete().eq('id', exp.id)
    if (delErr) {
      setError('Errore eliminazione voce spesa.')
      return
    }
    await loadAllOperations()
  }

  const handleCopyExpenseReport = async () => {
    const targetList = filteredExpenses
    const totalSum = targetList.reduce((acc, item) => acc + Number(item.amount || 0), 0)

    const lines = [
      `NOTA SPESE DIREZIONE (${expenseFilter})`,
      '--------------------------------------------------',
      ...targetList.map((e) => {
        const d = new Date(e.expense_date).toLocaleDateString('it-IT')
        const ref = e.mission_ref ? ` [Rif: ${e.mission_ref}]` : ''
        return `${d} | ${e.category} | ${e.description}${ref} -> EUR ${Number(e.amount).toFixed(2)} (${e.reimbursement_status})`
      }),
      '--------------------------------------------------',
      `TOTALE SELEZIONE: EUR ${totalSum.toFixed(2)}`,
    ]

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedExpenses(true)
      setTimeout(() => setCopiedExpenses(false), 2500)
    } catch {
      setError('Impossibile copiare la nota spese.')
    }
  }

  const openActionsCount = actions.filter((a) => a.status !== 'COMPLETATO').length

  const filteredActions = actions.filter((a) => {
    if (actionFilter === 'ATTIVI') return a.status !== 'COMPLETATO'
    if (actionFilter === 'COMPLETATO') return a.status === 'COMPLETATO'
    return true
  })

  const filteredVendors = vendors.filter((v) => {
    if (vendorCategoryFilter !== 'TUTTE' && v.category !== vendorCategoryFilter) return false
    if (!vendorSearch.trim()) return true
    const q = vendorSearch.toLowerCase()
    const hay = `${v.name} ${v.category} ${v.city_area || ''} ${v.contact_info || ''} ${v.reliability_notes || ''}`.toLowerCase()
    return hay.includes(q)
  })

  const filteredExpenses = expenses.filter((e) =>
    expenseFilter === 'TUTTE' ? true : e.reimbursement_status === expenseFilter
  )

  const totalPendingExpense = expenses
    .filter((e) => e.reimbursement_status === 'DA RENDICONTARE')
    .reduce((acc, e) => acc + Number(e.amount || 0), 0)

  const totalSubmittedExpense = expenses
    .filter((e) => e.reimbursement_status === 'INVIATO')
    .reduce((acc, e) => acc + Number(e.amount || 0), 0)

  const priorityBadge = (p: ActionItem['priority']) => {
    if (p === 'ALTA') return 'bg-red-950 text-red-300 border-red-700'
    if (p === 'BASSA') return 'bg-neutral-900 text-neutral-300 border-neutral-700'
    return 'bg-amber-950/70 text-amber-300 border-amber-700'
  }

  const expenseBadge = (s: ExpenseLogItem['reimbursement_status']) => {
    if (s === 'RIMBORSATO') return 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
    if (s === 'INVIATO') return 'bg-sky-950/70 text-sky-300 border-sky-700'
    return 'bg-amber-950/70 text-amber-300 border-amber-700'
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 border-t-2 border-t-indigo-400 rounded-xl p-4 sm:p-6 shadow-xl space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 text-xs font-bold uppercase">
              Chief of Staff
            </span>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-white">
              Action Tracker, Fornitori Fidati &amp; Spese Rapide
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Controllo deleghe e scadenze, rubrica fornitori selezionati e rendicontazione spese
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            className={
              'min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-sm uppercase tracking-wider font-bold border transition ' +
              (activeTab === 'actions'
                ? 'bg-indigo-400 text-neutral-950 border-indigo-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
            }
          >
            Deleghe &amp; Task ({openActionsCount})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vendors')}
            className={
              'min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-sm uppercase tracking-wider font-bold border transition ' +
              (activeTab === 'vendors'
                ? 'bg-indigo-400 text-neutral-950 border-indigo-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
            }
          >
            Fornitori ({vendors.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={
              'min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-sm uppercase tracking-wider font-bold border transition ' +
              (activeTab === 'expenses'
                ? 'bg-indigo-400 text-neutral-950 border-indigo-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
            }
          >
            Spese ({expenses.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-lg">
          {error}
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {(['ATTIVI', 'TUTTI', 'COMPLETATO'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActionFilter(tab)}
                  className={
                    'min-h-[36px] px-3 py-1.5 rounded-lg text-xs uppercase border transition ' +
                    (actionFilter === tab
                      ? 'bg-neutral-100 text-neutral-950 border-neutral-100 font-bold'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyActionsReport}
                className="min-h-[38px] bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs font-semibold uppercase px-3.5 py-1.5 rounded-lg transition"
              >
                {copiedActions ? 'Report Copiato' : 'Copia Report'}
              </button>
              <button
                type="button"
                onClick={() => setShowActionForm(!showActionForm)}
                className="min-h-[38px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-1.5 rounded-lg transition"
              >
                {showActionForm ? 'Chiudi Modulo' : '+ Nuova Delega'}
              </button>
            </div>
          </div>

          {showActionForm && (
            <form
              onSubmit={handleAddAction}
              className="p-4 sm:p-5 bg-neutral-950 border border-neutral-800 rounded-xl space-y-4 text-sm"
            >
              <div className="text-sm uppercase tracking-wider text-indigo-300 font-bold">
                Nuovo Incarico / Follow-up Direzione
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                <div className="md:col-span-2">
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Oggetto Incarico / Azione Richiesta *
                  </label>
                  <input
                    type="text"
                    required
                    value={actionTitle}
                    onChange={(e) => setActionTitle(e.target.value)}
                    placeholder="Es. Invio bozza contratto NDA / Conferma slot eliporto"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Responsabile / Delegato *
                  </label>
                  <input
                    type="text"
                    required
                    value={actionOwner}
                    onChange={(e) => setActionOwner(e.target.value)}
                    placeholder="Nome collaboratore o studio"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Priorita
                  </label>
                  <select
                    value={actionPriority}
                    onChange={(e) =>
                      setActionPriority(e.target.value as 'ALTA' | 'MEDIA' | 'BASSA')
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  >
                    <option value="ALTA">ALTA (Urgente)</option>
                    <option value="MEDIA">MEDIA (Ordinaria)</option>
                    <option value="BASSA">BASSA (Monitoraggio)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Scadenza (Deadline)
                  </label>
                  <input
                    type="datetime-local"
                    value={actionDueDate}
                    onChange={(e) => setActionDueDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Note Operative / Solleciti
                  </label>
                  <input
                    type="text"
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Dettagli aggiuntivi o stato avanzamento"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[40px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase px-5 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {loading ? 'Salvataggio...' : 'Registra Delega'}
                </button>
              </div>
            </form>
          )}

          {filteredActions.length > 0 ? (
            <div className="space-y-3 text-sm">
              {filteredActions.map((item) => {
                const isOverdue =
                  item.due_date &&
                  item.status !== 'COMPLETATO' &&
                  new Date(item.due_date).getTime() < Date.now()

                return (
                  <div
                    key={item.id}
                    className={
                      'bg-neutral-950 border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 ' +
                      (isOverdue ? 'border-red-700/90' : 'border-neutral-800')
                    }
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-md border text-xs font-bold uppercase ${priorityBadge(
                            item.priority
                          )}`}
                        >
                          {item.priority}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-xs text-indigo-300 font-semibold">
                          Ref: {item.owner_name}
                        </span>
                        {item.due_date && (
                          <span
                            className={
                              'text-xs font-mono ' +
                              (isOverdue ? 'text-red-400 font-bold' : 'text-neutral-300')
                            }
                          >
                            Scad:{' '}
                            {new Date(item.due_date).toLocaleString('it-IT', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {isOverdue ? ' (SCADUTA)' : ''}
                          </span>
                        )}
                      </div>

                      <div
                        className={
                          'text-base font-bold ' +
                          (item.status === 'COMPLETATO'
                            ? 'line-through text-neutral-500'
                            : 'text-white')
                        }
                      >
                        {item.title}
                      </div>

                      {item.notes && (
                        <div className="text-neutral-300 italic text-sm">{item.notes}</div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
                      <select
                        aria-label="Stato delega"
                        value={item.status}
                        onChange={(e) =>
                          handleActionStatusChange(
                            item,
                            e.target.value as 'DA FARE' | 'IN CORSO' | 'COMPLETATO'
                          )
                        }
                        className="min-h-[38px] bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs font-semibold uppercase rounded-lg px-3 py-1.5"
                      >
                        <option value="DA FARE">Da Fare</option>
                        <option value="IN CORSO">In Corso</option>
                        <option value="COMPLETATO">Completato</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleDeleteAction(item)}
                        className="min-h-[38px] bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-neutral-400 border border-dashed border-neutral-800 rounded-xl">
              Nessuna delega o task presente per questo filtro.
            </div>
          )}
        </div>
      )}

      {activeTab === 'vendors' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                placeholder="Cerca fornitore, citta, contatto..."
                className="bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2 text-base sm:text-sm text-white w-full sm:w-64 focus:outline-none focus:border-indigo-400"
              />

              <select
                value={vendorCategoryFilter}
                onChange={(e) => setVendorCategoryFilter(e.target.value)}
                className="min-h-[38px] bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-base sm:text-sm text-neutral-100"
              >
                <option value="TUTTE">Tutte le categorie</option>
                <option value="NCC / Transfer">NCC / Transfer</option>
                <option value="Aviazione / Charter">Aviazione / Charter</option>
                <option value="Hotel & Hospitality">Hotel &amp; Hospitality</option>
                <option value="Ristorazione Riservata">Ristorazione Riservata</option>
                <option value="Sicurezza / Supporto">Sicurezza / Supporto</option>
                <option value="Corrieri / Logistica">Corrieri / Logistica</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowVendorForm(!showVendorForm)}
              className="min-h-[40px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition self-start md:self-auto"
            >
              {showVendorForm ? 'Chiudi Modulo' : '+ Nuovo Fornitore'}
            </button>
          </div>

          {showVendorForm && (
            <form
              onSubmit={handleAddVendor}
              className="p-4 sm:p-5 bg-neutral-950 border border-neutral-800 rounded-xl space-y-4 text-sm"
            >
              <div className="text-sm uppercase tracking-wider text-indigo-300 font-bold">
                Registrazione Fornitore Selezionato
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Denominazione Fornitore *
                  </label>
                  <input
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="Es. Executive Limousine Roma"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Categoria Servizio
                  </label>
                  <select
                    value={vendorCategory}
                    onChange={(e) => setVendorCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  >
                    <option value="NCC / Transfer">NCC / Transfer</option>
                    <option value="Aviazione / Charter">Aviazione / Charter</option>
                    <option value="Hotel & Hospitality">Hotel &amp; Hospitality</option>
                    <option value="Ristorazione Riservata">Ristorazione Riservata</option>
                    <option value="Sicurezza / Supporto">Sicurezza / Supporto</option>
                    <option value="Corrieri / Logistica">Corrieri / Logistica</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Citta / Area Operativa
                  </label>
                  <input
                    type="text"
                    value={vendorCity}
                    onChange={(e) => setVendorCity(e.target.value)}
                    placeholder="Es. Roma EUR / FCO / Milano"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Referente Diretto &amp; Recapito H24
                  </label>
                  <input
                    type="text"
                    value={vendorContact}
                    onChange={(e) => setVendorContact(e.target.value)}
                    placeholder="Nome referente, telefono diretto, email"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Note Affidabilita, Tariffe &amp; Standard
                  </label>
                  <input
                    type="text"
                    value={vendorNotes}
                    onChange={(e) => setVendorNotes(e.target.value)}
                    placeholder="Es. Disponibilita H24, sala privata sul retro, fatturazione diretta"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[40px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase px-5 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {loading ? 'Salvataggio...' : 'Salva Fornitore'}
                </button>
              </div>
            </form>
          )}

          {filteredVendors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-sm">
              {filteredVendors.map((v) => (
                <div
                  key={v.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 text-xs font-bold uppercase">
                        {v.category}
                      </span>
                      {v.city_area && (
                        <span className="text-xs text-neutral-400 font-medium">{v.city_area}</span>
                      )}
                    </div>
                    <div className="text-base font-bold text-white">{v.name}</div>
                    {v.contact_info && (
                      <div className="text-neutral-200">
                        <span className="text-neutral-400">Contatto:</span> {v.contact_info}
                      </div>
                    )}
                    {v.reliability_notes && (
                      <div className="text-neutral-300 italic">{v.reliability_notes}</div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteVendor(v)}
                    className="text-neutral-400 hover:text-red-400 text-xs font-semibold uppercase shrink-0 py-1"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-neutral-400 border border-dashed border-neutral-800 rounded-xl">
              Nessun fornitore trovato per i criteri selezionati.
            </div>
          )}
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
              <span className="text-xs sm:text-sm uppercase text-neutral-400 font-semibold">
                Da Rendicontare
              </span>
              <span className="text-lg font-bold font-mono text-amber-400">
                &euro; {totalPendingExpense.toFixed(2)}
              </span>
            </div>
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
              <span className="text-xs sm:text-sm uppercase text-neutral-400 font-semibold">
                Inviate in Amministrazione
              </span>
              <span className="text-lg font-bold font-mono text-sky-400">
                &euro; {totalSubmittedExpense.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {(['TUTTE', 'DA RENDICONTARE', 'INVIATO', 'RIMBORSATO'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setExpenseFilter(st)}
                  className={
                    'min-h-[36px] px-3 py-1.5 rounded-lg text-xs uppercase border transition ' +
                    (expenseFilter === st
                      ? 'bg-neutral-100 text-neutral-950 border-neutral-100 font-bold'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {filteredExpenses.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyExpenseReport}
                  className="min-h-[38px] bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs font-semibold uppercase px-3.5 py-1.5 rounded-lg transition"
                >
                  {copiedExpenses ? 'Nota Spese Copiata' : 'Esporta Nota Spese'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="min-h-[38px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font
