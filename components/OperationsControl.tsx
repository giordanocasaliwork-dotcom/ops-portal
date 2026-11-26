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
    if (p === 'BASSA') return 'bg-neutral-900 text-neutral-400 border-neutral-700'
    return 'bg-amber-950/70 text-amber-300 border-amber-700'
  }

  const expenseBadge = (s: ExpenseLogItem['reimbursement_status']) => {
    if (s === 'RIMBORSATO') return 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
    if (s === 'INVIATO') return 'bg-sky-950/70 text-sky-300 border-sky-700'
    return 'bg-amber-950/70 text-amber-300 border-amber-700'
  }

  return (
    <div className="bg-neutral-900 border-2 border-blue-500/80 rounded-lg p-6 shadow-xl space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-yellow-500/30 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-bold uppercase">
              CHIEF OF STAFF
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-100">
              Action Tracker, Fornitori Fidati &amp; Spese Rapide
            </h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Controllo deleghe e scadenze, rubrica fornitori selezionati e rendicontazione spese
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            className={
              'px-3 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
              (activeTab === 'actions'
                ? 'bg-emerald-400 text-neutral-950 border-emerald-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:border-neutral-500')
            }
          >
            Deleghe &amp; Task ({openActionsCount})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vendors')}
            className={
              'px-3 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
              (activeTab === 'vendors'
                ? 'bg-emerald-400 text-neutral-950 border-emerald-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:border-neutral-500')
            }
          >
            Fornitori ({vendors.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={
              'px-3 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
              (activeTab === 'expenses'
                ? 'bg-emerald-400 text-neutral-950 border-emerald-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:border-neutral-500')
            }
          >
            Spese ({expenses.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
          {error}
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {(['ATTIVI', 'TUTTI', 'COMPLETATO'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActionFilter(tab)}
                  className={
                    'px-2.5 py-1 rounded text-[11px] uppercase border transition ' +
                    (actionFilter === tab
                      ? 'bg-neutral-200 text-neutral-950 border-neutral-200 font-bold'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyActionsReport}
                className="bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs uppercase px-3 py-1.5 rounded transition"
              >
                {copiedActions ? 'Report Copiato' : 'Copia Report Deleghe'}
              </button>
              <button
                type="button"
                onClick={() => setShowActionForm(!showActionForm)}
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
              >
                {showActionForm ? 'Chiudi Modulo' : '+ Nuova Delega / Task'}
              </button>
            </div>
          </div>

          {showActionForm && (
            <form
              onSubmit={handleAddAction}
              className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3 text-xs"
            >
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                Nuovo Incarico / Follow-up Direzione
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Oggetto Incarico / Azione Richiesta *
                  </label>
                  <input
                    type="text"
                    required
                    value={actionTitle}
                    onChange={(e) => setActionTitle(e.target.value)}
                    placeholder="Es. Invio bozza contratto NDA / Conferma slot eliporto"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Responsabile / Delegato *
                  </label>
                  <input
                    type="text"
                    required
                    value={actionOwner}
                    onChange={(e) => setActionOwner(e.target.value)}
                    placeholder="Nome collaboratore o studio"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Priorita
                  </label>
                  <select
                    value={actionPriority}
                    onChange={(e) =>
                      setActionPriority(e.target.value as 'ALTA' | 'MEDIA' | 'BASSA')
                    }
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  >
                    <option value="ALTA">ALTA (Urgente)</option>
                    <option value="MEDIA">MEDIA (Ordinaria)</option>
                    <option value="BASSA">BASSA (Monitoraggio)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Scadenza (Deadline)
                  </label>
                  <input
                    type="datetime-local"
                    value={actionDueDate}
                    onChange={(e) => setActionDueDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Note Operative / Solleciti
                  </label>
                  <input
                    type="text"
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Dettagli aggiuntivi o stato avanzamento"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase px-5 py-2 rounded transition disabled:opacity-50"
                >
                  {loading ? 'Salvataggio...' : 'Registra Delega'}
                </button>
              </div>
            </form>
          )}

          {filteredActions.length > 0 ? (
            <div className="space-y-2.5">
              {filteredActions.map((item) => {
                const isOverdue =
                  item.due_date &&
                  item.status !== 'COMPLETATO' &&
                  new Date(item.due_date).getTime() < Date.now()

                return (
                  <div
                    key={item.id}
                    className={
                      'bg-neutral-950 border rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs ' +
                      (isOverdue ? 'border-red-800/90' : 'border-neutral-800/90')
                    }
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${priorityBadge(
                            item.priority
                          )}`}
                        >
                          {item.priority}
                        </span>
                        <span
                          className={
                            'text-sm font-bold ' +
                            (item.status === 'COMPLETATO'
                              ? 'line-through text-neutral-500'
                              : 'text-neutral-100')
                          }
                        >
                          {item.title}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[11px] text-emerald-300 font-semibold">
                          Ref: {item.owner_name}
                        </span>
                        {item.due_date && (
                          <span
                            className={
                              'text-[11px] ' +
                              (isOverdue ? 'text-red-400 font-bold' : 'text-neutral-400')
                            }
                          >
                            • Scad:{' '}
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

                      {item.notes && (
                        <div className="text-neutral-400 italic">{item.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                      <select
                        aria-label="Stato delega"
                        value={item.status}
                        onChange={(e) =>
                          handleActionStatusChange(
                            item,
                            e.target.value as 'DA FARE' | 'IN CORSO' | 'COMPLETATO'
                          )
                        }
                        className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs uppercase rounded px-2.5 py-1.5"
                      >
                        <option value="DA FARE">Da Fare</option>
                        <option value="IN CORSO">In Corso</option>
                        <option value="COMPLETATO">Completato</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleDeleteAction(item)}
                        className="bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs px-2.5 py-1.5 rounded transition"
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
              Nessuna delega o task presente per questo filtro.
            </div>
          )}
        </div>
      )}

      {activeTab === 'vendors' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                placeholder="Cerca fornitore, citta, contatto..."
                className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 w-60 focus:outline-none focus:border-neutral-600"
              />

              <select
                value={vendorCategoryFilter}
                onChange={(e) => setVendorCategoryFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-300"
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
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition self-start md:self-auto"
            >
              {showVendorForm ? 'Chiudi Modulo' : '+ Nuovo Fornitore'}
            </button>
          </div>

          {showVendorForm && (
            <form
              onSubmit={handleAddVendor}
              className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3 text-xs"
            >
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                Registrazione Fornitore Selezionato
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Denominazione Fornitore *
                  </label>
                  <input
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="Es. Executive Limousine Roma"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Categoria Servizio
                  </label>
                  <select
                    value={vendorCategory}
                    onChange={(e) => setVendorCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
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
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Citta / Area Operativa
                  </label>
                  <input
                    type="text"
                    value={vendorCity}
                    onChange={(e) => setVendorCity(e.target.value)}
                    placeholder="Es. Roma EUR / FCO / Viterbo / Milano"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Referente Diretto &amp; Recapito H24
                  </label>
                  <input
                    type="text"
                    value={vendorContact}
                    onChange={(e) => setVendorContact(e.target.value)}
                    placeholder="Nome referente, telefono diretto, email"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Note Affidabilita, Tariffe &amp; Standard
                  </label>
                  <input
                    type="text"
                    value={vendorNotes}
                    onChange={(e) => setVendorNotes(e.target.value)}
                    placeholder="Es. Disponibilita H24, sala privata sul retro, fatturazione diretta"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase px-5 py-2 rounded transition disabled:opacity-50"
                >
                  {loading ? 'Salvataggio...' : 'Salva Fornitore'}
                </button>
              </div>
            </form>
          )}

          {filteredVendors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {filteredVendors.map((v) => (
                <div
                  key={v.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-lg p-3.5 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 text-[10px] font-bold uppercase">
                        {v.category}
                      </span>
                      {v.city_area && (
                        <span className="text-[11px] text-neutral-400">{v.city_area}</span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-neutral-100">{v.name}</div>
                    {v.contact_info && (
                      <div className="text-neutral-200">
                        <span className="text-neutral-500">Contatto:</span> {v.contact_info}
                      </div>
                    )}
                    {v.reliability_notes && (
                      <div className="text-neutral-400 italic">{v.reliability_notes}</div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteVendor(v)}
                    className="text-neutral-500 hover:text-red-400 text-[11px] uppercase shrink-0"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
              Nessun fornitore trovato per i criteri selezionati.
            </div>
          )}
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-neutral-950 border border-amber-800/70 rounded-lg p-3 flex items-center justify-between">
              <span className="uppercase text-neutral-400 font-semibold">Da Rendicontare</span>
              <span className="text-base font-bold text-amber-300">
                EUR {totalPendingExpense.toFixed(2)}
              </span>
            </div>
            <div className="bg-neutral-950 border border-sky-800/70 rounded-lg p-3 flex items-center justify-between">
              <span className="uppercase text-neutral-400 font-semibold">
                Inviate in Amministrazione
              </span>
              <span className="text-base font-bold text-sky-300">
                EUR {totalSubmittedExpense.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(['TUTTE', 'DA RENDICONTARE', 'INVIATO', 'RIMBORSATO'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setExpenseFilter(st)}
                  className={
                    'px-2.5 py-1 rounded text-[11px] uppercase border transition ' +
                    (expenseFilter === st
                      ? 'bg-neutral-200 text-neutral-950 border-neutral-200 font-bold'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {filteredExpenses.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyExpenseReport}
                  className="bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs uppercase px-3 py-1.5 rounded transition"
                >
                  {copiedExpenses ? 'Nota Spese Copiata' : 'Esporta Nota Spese'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
              >
                {showExpenseForm ? 'Chiudi Modulo' : '+ Registra Spesa'}
              </button>
            </div>
          </div>

          {showExpenseForm && (
            <form
              onSubmit={handleAddExpense}
              className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3 text-xs"
            >
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                Nuova Voce di Spesa Operativa / Rappresentanza
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Data *
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Categoria
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  >
                    <option value="Trasporti / NCC">Trasporti / NCC</option>
                    <option value="Voli / Treni">Voli / Treni</option>
                    <option value="Hotel / Ospitalita">Hotel / Ospitalita</option>
                    <option value="Rappresentanza / Ristoranti">Rappresentanza / Ristoranti</option>
                    <option value="Sicurezza / Scorta">Sicurezza / Scorta</option>
                    <option value="Varie / Emergenze">Varie / Emergenze</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Descrizione Spesa *
                  </label>
                  <input
                    type="text"
                    required
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    placeholder="Es. Transfer FCO-EUR / Pranzo lavoro con delegazione"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Importo (EUR) *
                  </label>
                  <input
                    type="text"
                    required
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="Es. 145.50"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Riferimento Missione / Centro di Costo (Opzionale)
                  </label>
                  <input
                    type="text"
                    value={expenseMissionRef}
                    onChange={(e) => setExpenseMissionRef(e.target.value)}
                    placeholder="Es. Missione VIP Roma / Progetto Viterbo"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase px-5 py-2 rounded transition disabled:opacity-50 shrink-0"
                >
                  {loading ? 'Salvataggio...' : 'Registra Spesa'}
                </button>
              </div>
            </form>
          )}

          {filteredExpenses.length > 0 ? (
            <div className="space-y-2.5">
              {filteredExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="bg-neutral-950 border border-neutral-800/90 rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${expenseBadge(
                          exp.reimbursement_status
                        )}`}
                      >
                        {exp.reimbursement_status}
                      </span>
                      <span className="text-neutral-400">
                        {new Date(exp.expense_date).toLocaleDateString('it-IT')}
                      </span>
                      <span className="text-neutral-600">|</span>
                      <span className="text-neutral-300 font-semibold">{exp.category}</span>
                      <span className="text-neutral-600">|</span>
                      <span className="text-sm font-bold text-neutral-100">
                        EUR {Number(exp.amount).toFixed(2)}
                      </span>
                    </div>

                    <div className="text-neutral-200">{exp.description}</div>
                    {exp.mission_ref && (
                      <div className="text-[11px] text-neutral-400">
                        Riferimento: {exp.mission_ref}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                    <select
                      aria-label="Stato rimborso"
                      value={exp.reimbursement_status}
                      onChange={(e) =>
                        handleExpenseStatusChange(
                          exp,
                          e.target.value as 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
                        )
                      }
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs uppercase rounded px-2.5 py-1.5"
                    >
                      <option value="DA RENDICONTARE">Da Rendicontare</option>
                      <option value="INVIATO">Inviato</option>
                      <option value="RIMBORSATO">Rimborsato</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp)}
                      className="bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs px-2.5 py-1.5 rounded transition"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
              Nessuna voce di spesa registrata per questo filtro.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
