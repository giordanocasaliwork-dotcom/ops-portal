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

export interface Vendor {
  id: string
  created_at: string
  name: string
  category: string
  city_area: string | null
  contact_info: string | null
  reliability_notes: string | null
}

export interface ExpenseLog {
  id: string
  created_at: string
  expense_date: string
  description: string
  category: string
  amount: number
  mission_ref: string | null
  reimbursement_status: 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
}

interface OperationsControlHubProps {
  userEmail: string
  onAuditUpdated?: () => void
}

export default function OperationsControlHub({
  userEmail,
  onAuditUpdated,
}: OperationsControlHubProps) {
  const supabase = useMemo(() => createClient(), [])

  const [activeTab, setActiveTab] = useState<'tasks' | 'vendors' | 'expenses'>('tasks')
  const [tasks, setTasks] = useState<ActionItem[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [expenses, setExpenses] = useState<ExpenseLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- STATE: ACTION TRACKER ---
  const [taskFilter, setTaskFilter] = useState<'ATTIVI' | 'TUTTI' | 'ALTA' | 'COMPLETATI'>('ATTIVI')
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskOwner, setTaskOwner] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPriority, setTaskPriority] = useState<'ALTA' | 'MEDIA' | 'BASSA'>('MEDIA')
  const [taskNotes, setTaskNotes] = useState('')

  // --- STATE: FORNITORI FIDATI ---
  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorCatFilter, setVendorCatFilter] = useState('TUTTI')
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [vendorName, setVendorName] = useState('')
  const [vendorCategory, setVendorCategory] = useState('NCC / Transfer')
  const [vendorCity, setVendorCity] = useState('')
  const [vendorContact, setVendorContact] = useState('')
  const [vendorNotes, setVendorNotes] = useState('')

  // --- STATE: SPESE RAPIDE ---
  const [expenseFilter, setExpenseFilter] = useState<
    'TUTTE' | 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
  >('TUTTE')
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [copiedExpenses, setCopiedExpenses] = useState(false)
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [expDescription, setExpDescription] = useState('')
  const [expCategory, setExpCategory] = useState('Trasporti / NCC')
  const [expAmount, setExpAmount] = useState('')
  const [expMissionRef, setExpMissionRef] = useState('')
  const [expStatus, setExpStatus] = useState<'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'>(
    'DA RENDICONTARE'
  )

  const loadOpsData = useCallback(async () => {
    const [tasksRes, vendorsRes, expensesRes] = await Promise.all([
      supabase
        .from('action_items')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('vendors').select('*').order('name', { ascending: true }),
      supabase
        .from('expense_logs')
        .select('*')
        .order('expense_date', { ascending: false }),
    ])

    if (tasksRes.data) setTasks(tasksRes.data as ActionItem[])
    if (vendorsRes.data) setVendors(vendorsRes.data as Vendor[])
    if (expensesRes.data) {
      const normalized = expensesRes.data.map((item: any) => ({
        ...item,
        amount: Number(item.amount || 0),
      }))
      setExpenses(normalized)
    }
  }, [supabase])

  useEffect(() => {
    loadOpsData()
  }, [loadOpsData])

  // --- HANDLERS: ACTION TRACKER ---
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insertErr } = await supabase.from('action_items').insert([
        {
          title: taskTitle.trim(),
          owner_name: taskOwner.trim(),
          due_date: taskDueDate ? new Date(taskDueDate).toISOString() : null,
          priority: taskPriority,
          status: 'DA FARE',
          notes: taskNotes.trim() || null,
        },
      ])

      if (insertErr) throw insertErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `TASK_CREATE: ${taskTitle.trim()} -> ${taskOwner.trim()} [${taskPriority}]`,
          status: 'SUCCESS',
        },
      ])

      setTaskTitle('')
      setTaskOwner('')
      setTaskDueDate('')
      setTaskPriority('MEDIA')
      setTaskNotes('')
      setShowTaskForm(false)
      await loadOpsData()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore creazione incarico.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateTaskStatus = async (
    task: ActionItem,
    newStatus: 'DA FARE' | 'IN CORSO' | 'COMPLETATO'
  ) => {
    const { error: updErr } = await supabase
      .from('action_items')
      .update({ status: newStatus })
      .eq('id', task.id)

    if (updErr) {
      setError('Impossibile aggiornare stato incarico.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `TASK_STATUS: ${task.title} -> ${newStatus}`,
        status: 'SUCCESS',
      },
    ])

    await loadOpsData()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleDeleteTask = async (task: ActionItem) => {
    const { error: delErr } = await supabase.from('action_items').delete().eq('id', task.id)
    if (delErr) {
      setError('Errore eliminazione incarico.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `TASK_DELETE: ${task.title}`,
        status: 'SUCCESS',
      },
    ])

    await loadOpsData()
    if (onAuditUpdated) onAuditUpdated()
  }

  // --- HANDLERS: FORNITORI ---
  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insertErr } = await supabase.from('vendors').insert([
        {
          name: vendorName.trim(),
          category: vendorCategory,
          city_area: vendorCity.trim() || null,
          contact_info: vendorContact.trim() || null,
          reliability_notes: vendorNotes.trim() || null,
        },
      ])

      if (insertErr) throw insertErr

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
      await loadOpsData()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore salvataggio fornitore.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVendor = async (vendor: Vendor) => {
    const { error: delErr } = await supabase.from('vendors').delete().eq('id', vendor.id)
    if (delErr) {
      setError('Errore eliminazione fornitore.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `VENDOR_DELETE: ${vendor.name}`,
        status: 'SUCCESS',
      },
    ])

    await loadOpsData()
    if (onAuditUpdated) onAuditUpdated()
  }

  // --- HANDLERS: SPESE ---
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const parsedAmount = parseFloat(expAmount.replace(',', '.'))
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new Error('Inserisci un importo numerico valido.')
      }

      const { error: insertErr } = await supabase.from('expense_logs').insert([
        {
          expense_date: expDate,
          description: expDescription.trim(),
          category: expCategory,
          amount: parsedAmount,
          mission_ref: expMissionRef.trim() || null,
          reimbursement_status: expStatus,
        },
      ])

      if (insertErr) throw insertErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `EXPENSE_ADD: ${expDescription.trim()} (EUR ${parsedAmount.toFixed(2)})`,
          status: 'SUCCESS',
        },
      ])

      setExpDescription('')
      setExpAmount('')
      setExpMissionRef('')
      setExpStatus('DA RENDICONTARE')
      setShowExpenseForm(false)
      await loadOpsData()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore registrazione spesa.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateExpenseStatus = async (
    exp: ExpenseLog,
    newStatus: 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
  ) => {
    const { error: updErr } = await supabase
      .from('expense_logs')
      .update({ reimbursement_status: newStatus })
      .eq('id', exp.id)

    if (updErr) {
      setError('Impossibile aggiornare lo stato rimborso.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `EXPENSE_STATUS: ${exp.description} -> ${newStatus}`,
        status: 'SUCCESS',
      },
    ])

    await loadOpsData()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleDeleteExpense = async (exp: ExpenseLog) => {
    const { error: delErr } = await supabase.from('expense_logs').delete().eq('id', exp.id)
    if (delErr) {
      setError('Errore eliminazione voce di spesa.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `EXPENSE_DELETE: ${exp.description}`,
        status: 'SUCCESS',
      },
    ])

    await loadOpsData()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleCopyExpenseReport = async () => {
    const target = filteredExpenses
    if (target.length === 0) return

    const sum = target.reduce((acc, item) => acc + Number(item.amount || 0), 0)
    const lines = [
      `NOTA SPESE DIREZIONE - RIEPILOGO (${expenseFilter})`,
      '------------------------------------------------------------',
      ...target.map(
        (e) =>
          `${e.expense_date} | ${e.category} | ${e.description}${
            e.mission_ref ? ' [Rif: ' + e.mission_ref + ']' : ''
          } | EUR ${Number(e.amount).toFixed(2)} (${e.reimbursement_status})`
      ),
      '------------------------------------------------------------',
      `TOTALE VOCI (${target.length}): EUR ${sum.toFixed(2)}`,
    ]

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedExpenses(true)
      setTimeout(() => setCopiedExpenses(false), 2500)
    } catch {
      setError('Impossibile copiare la nota spese negli appunti.')
    }
  }

  // --- COMPUTED & BADGES ---
  const activeTasksCount = tasks.filter((t) => t.status !== 'COMPLETATO').length
  const pendingExpenseTotal = expenses
    .filter((e) => e.reimbursement_status === 'DA RENDICONTARE')
    .reduce((acc, e) => acc + Number(e.amount || 0), 0)
  const submittedExpenseTotal = expenses
    .filter((e) => e.reimbursement_status === 'INVIATO')
    .reduce((acc, e) => acc + Number(e.amount || 0), 0)

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'ATTIVI') return t.status !== 'COMPLETATO'
    if (taskFilter === 'ALTA') return t.priority === 'ALTA' && t.status !== 'COMPLETATO'
    if (taskFilter === 'COMPLETATI') return t.status === 'COMPLETATO'
    return true
  })

  const filteredVendors = vendors.filter((v) => {
    if (vendorCatFilter !== 'TUTTI' && v.category !== vendorCatFilter) return false
    if (!vendorSearch.trim()) return true
    const q = vendorSearch.toLowerCase()
    const hay = `${v.name} ${v.category} ${v.city_area || ''} ${v.contact_info || ''} ${v.reliability_notes || ''}`.toLowerCase()
    return hay.includes(q)
  })

  const filteredExpenses = expenses.filter((e) =>
    expenseFilter === 'TUTTE' ? true : e.reimbursement_status === expenseFilter
  )

  const priorityBadge = (prio: ActionItem['priority']) => {
    if (prio === 'ALTA') return 'bg-red-950/80 text-red-300 border-red-700'
    if (prio === 'MEDIA') return 'bg-amber-950/70 text-amber-300 border-amber-700'
    return 'bg-neutral-900 text-neutral-400 border-neutral-700'
  }

  const taskStatusBadge = (st: ActionItem['status']) => {
    if (st === 'COMPLETATO') return 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
    if (st === 'IN CORSO') return 'bg-sky-950/70 text-sky-300 border-sky-700'
    return 'bg-neutral-900 text-neutral-300 border-neutral-700'
  }

  const expenseStatusBadge = (st: ExpenseLog['reimbursement_status']) => {
    if (st === 'RIMBORSATO') return 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
    if (st === 'INVIATO') return 'bg-sky-950/70 text-sky-300 border-sky-700'
    return 'bg-amber-950/70 text-amber-300 border-amber-700'
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-800 pb-4">
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
            Controllo deleghe con scadenze, albo fornitori qualificati e rendicontazione spese
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={
              'px-3 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
              (activeTab === 'tasks'
                ? 'bg-emerald-400 text-neutral-950 border-emerald-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:border-neutral-500')
            }
          >
            Action Tracker ({activeTasksCount})
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
            Spese (&euro; {pendingExpenseTotal.toFixed(2)})
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
          {error}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: ACTION TRACKER & DELEGHE                                       */}
      {/* ===================================================================== */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(['ATTIVI', 'ALTA', 'TUTTI', 'COMPLETATI'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTaskFilter(tab)}
                  className={
                    'px-2.5 py-1 rounded text-[11px] uppercase border transition ' +
                    (taskFilter === tab
                      ? 'bg-neutral-200 text-neutral-950 border-neutral-200 font-bold'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {tab === 'ALTA' ? 'Priorita Alta' : tab}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowTaskForm(!showTaskForm)}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
            >
              {showTaskForm ? 'Chiudi Modulo' : '+ Nuova Delega / Task'}
            </button>
          </div>

          {showTaskForm && (
            <form
              onSubmit={handleAddTask}
              className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3 text-xs"
            >
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                Nuovo Incarico / Follow-up Direzione
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Attivita / Deliverable Richiesto *
                  </label>
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Es. Invio bozza NDA / Conferma slot elicottero / Report trimestrale"
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
                    value={taskOwner}
                    onChange={(e) => setTaskOwner(e.target.value)}
                    placeholder="Nome collaboratore, ufficio o fornitore"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Scadenza (Deadline)
                  </label>
                  <input
                    type="datetime-local"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Priorita
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) =>
                      setTaskPriority(e.target.value as 'ALTA' | 'MEDIA' | 'BASSA')
                    }
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  >
                    <option value="ALTA">ALTA (Urgente / Direzione)</option>
                    <option value="MEDIA">MEDIA (Ordinaria)</option>
                    <option value="BASSA">BASSA (Monitoraggio)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                  Note &amp; Stato Avanzamento
                </label>
                <input
                  type="text"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Dettagli, solleciti effettuati o dipendenze"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase px-5 py-2 rounded transition disabled:opacity-50"
                >
                  {loading ? 'Salvataggio...' : 'Registra Incarico'}
                </button>
              </div>
            </form>
          )}

          {filteredTasks.length > 0 ? (
            <div className="space-y-2.5">
              {filteredTasks.map((task) => {
                const isOverdue =
                  task.due_date &&
                  task.status !== 'COMPLETATO' &&
                  new Date(task.due_date).getTime() < Date.now()

                return (
                  <div
                    key={task.id}
                    className={
                      'bg-neutral-950 border rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs ' +
                      (isOverdue ? 'border-red-700/80' : 'border-neutral-800/90')
                    }
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${priorityBadge(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${taskStatusBadge(
                            task.status
                          )}`}
                        >
                          {task.status}
                        </span>
                        {isOverdue && (
                          <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold uppercase">
                            SCADUTO
                          </span>
                        )}
                        <span
                          className={
                            'text-sm font-bold ' +
                            (task.status === 'COMPLETATO'
                              ? 'line-through text-neutral-500'
                              : 'text-neutral-100')
                          }
                        >
                          {task.title}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-neutral-400">
                        <span>
                          <span className="text-neutral-500">Delegato:</span>{' '}
                          <span className="text-emerald-300 font-semibold">{task.owner_name}</span>
                        </span>
                        {task.due_date && (
                          <span>
                            <span className="text-neutral-500">Scadenza:</span>{' '}
                            <span className={isOverdue ? 'text-red-300 font-semibold' : 'text-neutral-200'}>
                              {new Date(task.due_date).toLocaleString('it-IT', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </span>
                        )}
                      </div>

                      {task.notes && (
                        <div className="text-neutral-400 italic">Note: {task.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                      <select
                        aria-label="Stato incarico"
                        value={task.status}
                        onChange={(e) =>
                          handleUpdateTaskStatus(
                            task,
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
                        onClick={() => handleDeleteTask(task)}
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
              Nessun incarico presente per il filtro selezionato.
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: FORNITORI FIDATI                                               */}
      {/* ===================================================================== */}
      {activeTab === 'vendors' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                placeholder="Cerca fornitore, citta o note..."
                className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 w-56 focus:outline-none focus:border-neutral-600"
              />

              {(
                [
                  'TUTTI',
                  'NCC / Transfer',
                  'Charter / Aviazione',
                  'Ristoranti Riservati',
                  'Hotel & Ospitalita',
                  'Logistica / Corrieri',
                  'Sicurezza / Supporto',
                ] as const
              ).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setVendorCatFilter(cat)}
                  className={
                    'px-2 py-1 rounded text-[10px] uppercase border transition ' +
                    (vendorCatFilter === cat
                      ? 'bg-neutral-200 text-neutral-950 border-neutral-200 font-bold'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {cat}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowVendorForm(!showVendorForm)}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition self-start md:self-auto shrink-0"
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
                Censimento Nuovo Fornitore Qualificato
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Nome / Ragione Sociale *
                  </label>
                  <input
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="Es. Executive Limousine Roma / Ristorante La Pergola"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Categoria Servizio *
                  </label>
                  <select
                    value={vendorCategory}
                    onChange={(e) => setVendorCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  >
                    <option value="NCC / Transfer">NCC / Transfer</option>
                    <option value="Charter / Aviazione">Charter / Aviazione</option>
                    <option value="Ristoranti Riservati">Ristoranti Riservati</option>
                    <option value="Hotel & Ospitalita">Hotel &amp; Ospitalita</option>
                    <option value="Logistica / Corrieri">Logistica / Corrieri</option>
                    <option value="Sicurezza / Supporto">Sicurezza / Supporto</option>
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
                    placeholder="Es. Roma EUR / Milano Centro / Viterbo"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px
