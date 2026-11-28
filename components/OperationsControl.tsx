 'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

interface TeamMemberOption {
  id: string
  email: string
  full_name: string | null
  callsign: string | null
  role: string | null
}

interface OperationsControlProps {
  userEmail: string
  isAdmin?: boolean
  onAuditUpdated?: () => void
}

export default function OperationsControl({
  userEmail,
  isAdmin = true,
  onAuditUpdated,
}: OperationsControlProps) {
  const supabase = useMemo(() => createClient(), [])

  const actionFormRef = useRef<HTMLFormElement | null>(null)
  const vendorFormRef = useRef<HTMLFormElement | null>(null)
  const expenseFormRef = useRef<HTMLFormElement | null>(null)

  const [activeTab, setActiveTab] = useState<'actions' | 'vendors' | 'expenses'>('actions')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [vendors, setVendors] = useState<VendorItem[]>([])
  const [expenses, setExpenses] = useState<ExpenseLogItem[]>([])

  const [actionFilter, setActionFilter] = useState<'ATTIVI' | 'TUTTI' | 'COMPLETATO'>('ATTIVI')
  const [showActionForm, setShowActionForm] = useState(false)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [copiedActions, setCopiedActions] = useState(false)
  const [actionTitle, setActionTitle] = useState('')
  const [actionOwner, setActionOwner] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [actionPriority, setActionPriority] = useState<'ALTA' | 'MEDIA' | 'BASSA'>('MEDIA')
  const [actionNotes, setActionNotes] = useState('')

  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState('TUTTE')
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null)
  const [vendorName, setVendorName] = useState('')
  const [vendorCategory, setVendorCategory] = useState('NCC / Transfer')
  const [vendorCity, setVendorCity] = useState('')
  const [vendorContact, setVendorContact] = useState('')
  const [vendorNotes, setVendorNotes] = useState('')

  const [expenseFilter, setExpenseFilter] = useState<
    'TUTTE' | 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
  >('TUTTE')
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [copiedExpenses, setCopiedExpenses] = useState(false)
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('Trasporti / NCC')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseMissionRef, setExpenseMissionRef] = useState('')

  const toLocalInputFormat = (isoString: string) => {
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`
  }

  const formatMemberLabel = (m: TeamMemberOption) => {
    const baseName = m.full_name || m.email
    return m.callsign ? `[${m.callsign}] ${baseName}` : baseName
  }

  const loadAllOperations = useCallback(async () => {
    const [actionsRes, profilesRes] = await Promise.all([
      supabase
        .from('action_items')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('profiles')
        .select('id, email, full_name, callsign, role')
        .eq('is_active', true)
        .order('callsign', { ascending: true }),
    ])

    if (actionsRes.data) setActions(actionsRes.data)
    if (profilesRes.data) {
      const assignable = (profilesRes.data as TeamMemberOption[]).filter(
        (p) => String(p.role || '').trim().toLowerCase() !== 'executive'
      )
      setTeamMembers(assignable)
    }

    if (isAdmin) {
      const [vendorsRes, expensesRes] = await Promise.all([
        supabase.from('vendors').select('*').order('name', { ascending: true }),
        supabase.from('expense_logs').select('*').order('expense_date', { ascending: false }),
      ])
      if (vendorsRes.data) setVendors(vendorsRes.data)
      if (expensesRes.data) setExpenses(expensesRes.data)
    }
  }, [supabase, isAdmin])

  useEffect(() => {
    loadAllOperations()
  }, [loadAllOperations])

  useEffect(() => {
    if (!isAdmin && activeTab !== 'actions') {
      setActiveTab('actions')
    }
  }, [isAdmin, activeTab])

  const resetActionForm = () => {
    setEditingActionId(null)
    setActionTitle('')
    setActionOwner('')
    setActionDueDate('')
    setActionPriority('MEDIA')
    setActionNotes('')
    setShowActionForm(false)
  }

  const handleEditAction = (item: ActionItem) => {
    setError(null)
    setEditingActionId(item.id)
    setActionTitle(item.title)
    setActionOwner(item.owner_name)
    setActionDueDate(item.due_date ? toLocalInputFormat(item.due_date) : '')
    setActionPriority(item.priority)
    setActionNotes(item.notes || '')
    setShowActionForm(true)
    setTimeout(() => {
      actionFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload = {
        title: actionTitle.trim(),
        owner_name: actionOwner.trim(),
        due_date: actionDueDate ? new Date(actionDueDate).toISOString() : null,
        priority: actionPriority,
        notes: actionNotes.trim() || null,
      }

      if (editingActionId) {
        const { error: updErr } = await supabase
          .from('action_items')
          .update(payload)
          .eq('id', editingActionId)

        if (updErr) throw updErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `DELEGA_UPDATE: ${actionTitle.trim()} -> ${actionOwner.trim()} [${actionPriority}]`,
            status: 'SUCCESS',
          },
        ])
      } else {
        const { error: insErr } = await supabase.from('action_items').insert([
          {
            ...payload,
            status: 'DA FARE',
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
      }

      resetActionForm()
      await loadAllOperations()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore salvataggio delega/task.')
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
    if (editingActionId === item.id) {
      resetActionForm()
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

  const resetVendorForm = () => {
    setEditingVendorId(null)
    setVendorName('')
    setVendorCategory('NCC / Transfer')
    setVendorCity('')
    setVendorContact('')
    setVendorNotes('')
    setShowVendorForm(false)
  }

  const handleEditVendor = (vendor: VendorItem) => {
    setError(null)
    setEditingVendorId(vendor.id)
    setVendorName(vendor.name)
    setVendorCategory(vendor.category || 'NCC / Transfer')
    setVendorCity(vendor.city_area || '')
    setVendorContact(vendor.contact_info || '')
    setVendorNotes(vendor.reliability_notes || '')
    setShowVendorForm(true)
    setTimeout(() => {
      vendorFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    setLoading(true)
    setError(null)

    try {
      const payload = {
        name: vendorName.trim(),
        category: vendorCategory,
        city_area: vendorCity.trim() || null,
        contact_info: vendorContact.trim() || null,
        reliability_notes: vendorNotes.trim() || null,
      }

      if (editingVendorId) {
        const { error: updErr } = await supabase
          .from('vendors')
          .update(payload)
          .eq('id', editingVendorId)

        if (updErr) throw updErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `VENDOR_UPDATE: ${vendorName.trim()} (${vendorCategory})`,
            status: 'SUCCESS',
          },
        ])
      } else {
        const { error: insErr } = await supabase.from('vendors').insert([payload])

        if (insErr) throw insErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `VENDOR_ADD: ${vendorName.trim()} (${vendorCategory})`,
            status: 'SUCCESS',
          },
        ])
      }

      resetVendorForm()
      await loadAllOperations()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore salvataggio fornitore.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVendor = async (vendor: VendorItem) => {
    if (!isAdmin) return
    const { error: delErr } = await supabase.from('vendors').delete().eq('id', vendor.id)
    if (delErr) {
      setError('Errore rimozione fornitore.')
      return
    }
    if (editingVendorId === vendor.id) {
      resetVendorForm()
    }
    await loadAllOperations()
  }

  const resetExpenseForm = () => {
    setEditingExpenseId(null)
    setExpenseDate(new Date().toISOString().slice(0, 10))
    setExpenseDesc('')
    setExpenseCategory('Trasporti / NCC')
    setExpenseAmount('')
    setExpenseMissionRef('')
    setShowExpenseForm(false)
  }

  const handleEditExpense = (exp: ExpenseLogItem) => {
    setError(null)
    setEditingExpenseId(exp.id)
    setExpenseDate(exp.expense_date ? exp.expense_date.slice(0, 10) : new Date().toISOString().slice(0, 10))
    setExpenseDesc(exp.description)
    setExpenseCategory(exp.category || 'Trasporti / NCC')
    setExpenseAmount(String(exp.amount))
    setExpenseMissionRef(exp.mission_ref || '')
    setShowExpenseForm(true)
    setTimeout(() => {
      expenseFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    setLoading(true)
    setError(null)

    try {
      const parsedAmount = parseFloat(expenseAmount.replace(',', '.'))
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new Error('Inserisci un importo numerico valido.')
      }

      const payload = {
        expense_date: expenseDate,
        description: expenseDesc.trim(),
        category: expenseCategory,
        amount: parsedAmount,
        mission_ref: expenseMissionRef.trim() || null,
      }

      if (editingExpenseId) {
        const { error: updErr } = await supabase
          .from('expense_logs')
          .update(payload)
          .eq('id', editingExpenseId)

        if (updErr) throw updErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `EXPENSE_UPDATE: ${expenseDesc.trim()} (EUR ${parsedAmount.toFixed(2)})`,
            status: 'SUCCESS',
          },
        ])
      } else {
        const { error: insErr } = await supabase.from('expense_logs').insert([
          {
            ...payload,
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
      }

      resetExpenseForm()
      await loadAllOperations()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore salvataggio spesa.')
    } finally {
      setLoading(false)
    }
  }

  const handleExpenseStatusChange = async (
    exp: ExpenseLogItem,
    newStatus: 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
  ) => {
    if (!isAdmin) return
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
    if (!isAdmin) return
    const { error: delErr } = await supabase.from('expense_logs').delete().eq('id', exp.id)
    if (delErr) {
      setError('Errore eliminazione voce spesa.')
      return
    }
    if (editingExpenseId === exp.id) {
      resetExpenseForm()
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
              {isAdmin ? 'Chief of Staff' : 'Deleghe Direzione'}
            </span>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-white">
              {isAdmin
                ? 'Action Tracker, Fornitori Fidati & Spese Rapide'
                : 'Deleghe & Assegnazione Compiti al Team'}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            {isAdmin
              ? 'Controllo deleghe e scadenze, rubrica fornitori selezionati e rendicontazione spese'
              : 'Assegnazione incarichi e task al personale operativo, scadenze e stato avanzamento'}
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

          {isAdmin && (
            <>
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
            </>
          )}
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
                onClick={() => {
                  if (showActionForm) {
                    resetActionForm()
                  } else {
                    setEditingActionId(null)
                    setShowActionForm(true)
                  }
                }}
                className="min-h-[38px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-1.5 rounded-lg transition"
              >
                {showActionForm ? 'Chiudi Modulo' : '+ Nuova Delega'}
              </button>
            </div>
          </div>

          {showActionForm && (
            <form
              ref={actionFormRef}
              onSubmit={handleSaveAction}
              className="p-4 sm:p-5 bg-neutral-950 border border-indigo-400/50 rounded-xl space-y-4 text-sm"
            >
              <div className="text-sm uppercase tracking-wider text-indigo-300 font-bold">
                {editingActionId
                  ? 'Modifica Incarico / Follow-up Direzione'
                  : 'Nuovo Incarico / Assegnazione Compito'}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                <div className="md:col-span-2">
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Oggetto Incarico / Compito Richiesto *
                  </label>
                  <input
                    type="text"
                    required
                    value={actionTitle}
                    onChange={(e) => setActionTitle(e.target.value)}
                    placeholder="Es. Verifica dotazioni residenza / Conferma slot eliporto"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Responsabile / Delegato *
                  </label>
                  {teamMembers.length > 0 && (
                    <select
                      aria-label="Seleziona membro del team"
                      value={
                        teamMembers.some((m) => formatMemberLabel(m) === actionOwner)
                          ? actionOwner
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) setActionOwner(e.target.value)
                      }}
                      className="w-full mb-2 bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-base sm:text-xs text-indigo-200"
                    >
                      <option value="">-- Seleziona membro team --</option>
                      {teamMembers.map((m) => {
                        const label = formatMemberLabel(m)
                        return (
                          <option key={m.id} value={label}>
                            {label}
                          </option>
                        )
                      })}
                    </select>
                  )}
                  <input
                    type="text"
                    required
                    value={actionOwner}
                    onChange={(e) => setActionOwner(e.target.value)}
                    placeholder="Operatore, Admin o collaboratore esterno"
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
                    Note Operative / Istruzioni
                  </label>
                  <input
                    type="text"
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Dettagli aggiuntivi, tempistiche o stato avanzamento"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2.5">
                <button
                  type="button"
                  onClick={resetActionForm}
                  className="min-h-[40px] bg-neutral-900 text-neutral-300 border border-neutral-700 text-xs sm:text-sm uppercase px-4 py-2 rounded-lg font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[40px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase px-5 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {loading
                    ? 'Salvataggio...'
                    : editingActionId
                    ? 'Aggiorna Delega'
                    : 'Assegna Delega'}
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
                      <button
                        type="button"
                        onClick={() => handleEditAction(item)}
                        className="min-h-[38px] bg-neutral-900 hover:bg-neutral-800 text-neutral-100 border border-neutral-700 text-xs font-semibold uppercase px-3 py-1.5 rounded-lg transition"
                      >
                        Modifica
                      </button>

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
                        className="min-h-[38px] bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs font-semibold uppercase px-3 py-1.5 rounded-lg transition"
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

      {isAdmin && activeTab === 'vendors' && (
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
              onClick={() => {
                if (showVendorForm) {
                  resetVendorForm()
                } else {
                  setEditingVendorId(null)
                  setShowVendorForm(true)
                }
              }}
              className="min-h-[40px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition self-start md:self-auto"
            >
              {showVendorForm ? 'Chiudi Modulo' : '+ Nuovo Fornitore'}
            </button>
          </div>

          {showVendorForm && (
            <form
              ref={vendorFormRef}
              onSubmit={handleSaveVendor}
              className="p-4 sm:p-5 bg-neutral-950 border border-indigo-400/50 rounded-xl space-y-4 text-sm"
            >
              <div className="text-sm uppercase tracking-wider text-indigo-300 font-bold">
                {editingVendorId
                  ? 'Modifica Fornitore Selezionato'
                  : 'Registrazione Fornitore Selezionato'}
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

              <div className="flex flex-wrap justify-end gap-2.5">
                <button
                  type="button"
                  onClick={resetVendorForm}
                  className="min-h-[40px] bg-neutral-900 text-neutral-300 border border-neutral-700 text-xs sm:text-sm uppercase px-4 py-2 rounded-lg font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[40px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase px-5 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {loading
                    ? 'Salvataggio...'
                    : editingVendorId
                    ? 'Aggiorna Fornitore'
                    : 'Salva Fornitore'}
                </button>
              </div>
            </form>
          )}

          {filteredVendors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-sm">
              {filteredVendors.map((v) => (
                <div
                  key={v.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between gap-3"
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

                  <div className="flex items-center justify-end gap-2 border-t border-neutral-800/80 pt-2.5">
                    <button
                      type="button"
                      onClick={() => handleEditVendor(v)}
                      className="min-h-[34px] px-3 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-100 text-xs font-semibold uppercase"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVendor(v)}
                      className="min-h-[34px] px-3 py-1 rounded-md bg-neutral-900 hover:bg-red-950/70 border border-neutral-800 hover:border-red-800 text-neutral-400 hover:text-red-300 text-xs font-semibold uppercase"
                    >
                      Rimuovi
                    </button>
                  </div>
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

      {isAdmin && activeTab === 'expenses' && (
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
                onClick={() => {
                  if (showExpenseForm) {
                    resetExpenseForm()
                  } else {
                    setEditingExpenseId(null)
                    setShowExpenseForm(true)
                  }
                }}
                className="min-h-[38px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-1.5 rounded-lg transition"
              >
                {showExpenseForm ? 'Chiudi Modulo' : '+ Registra Spesa'}
              </button>
            </div>
          </div>

          {showExpenseForm && (
            <form
              ref={expenseFormRef}
              onSubmit={handleSaveExpense}
              className="p-4 sm:p-5 bg-neutral-950 border border-indigo-400/50 rounded-xl space-y-4 text-sm"
            >
              <div className="text-sm uppercase tracking-wider text-indigo-300 font-bold">
                {editingExpenseId
                  ? 'Modifica Voce di Spesa'
                  : 'Nuova Voce di Spesa Operativa / Rappresentanza'}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Data *
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Categoria
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
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
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Descrizione Spesa *
                  </label>
                  <input
                    type="text"
                    required
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    placeholder="Es. Transfer FCO-EUR / Pranzo lavoro"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Importo (EUR) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="Es. 145.50"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3.5">
                <div className="flex-1">
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Riferimento Missione / Centro di Costo (Opzionale)
                  </label>
                  <input
                    type="text"
                    value={expenseMissionRef}
                    onChange={(e) => setExpenseMissionRef(e.target.value)}
                    placeholder="Es. Missione VIP Roma / Trasferta Kenya"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={resetExpenseForm}
                    className="min-h-[40px] bg-neutral-900 text-neutral-300 border border-neutral-700 text-xs sm:text-sm uppercase px-4 py-2 rounded-lg font-semibold"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[40px] bg-indigo-400 hover:bg-indigo-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase px-5 py-2 rounded-lg transition disabled:opacity-50"
                  >
                    {loading
                      ? 'Salvataggio...'
                      : editingExpenseId
                      ? 'Aggiorna Spesa'
                      : 'Registra Spesa'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {filteredExpenses.length > 0 ? (
            <div className="space-y-3 text-sm">
              {filteredExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-md border text-xs font-bold uppercase ${expenseBadge(
                          exp.reimbursement_status
                        )}`}
                      >
                        {exp.reimbursement_status}
                      </span>
                      <span className="text-neutral-300 font-mono text-xs sm:text-sm">
                        {new Date(exp.expense_date).toLocaleDateString('it-IT')}
                      </span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-neutral-200 font-semibold">{exp.category}</span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-base font-bold font-mono text-white">
                        &euro; {Number(exp.amount).toFixed(2)}
                      </span>
                    </div>

                    <div className="text-neutral-100 text-base">{exp.description}</div>
                    {exp.mission_ref && (
                      <div className="text-xs sm:text-sm text-neutral-400">
                        Riferimento: {exp.mission_ref}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditExpense(exp)}
                      className="min-h-[38px] bg-neutral-900 hover:bg-neutral-800 text-neutral-100 border border-neutral-700 text-xs font-semibold uppercase px-3 py-1.5 rounded-lg transition"
                    >
                      Modifica
                    </button>

                    <select
                      aria-label="Stato rimborso"
                      value={exp.reimbursement_status}
                      onChange={(e) =>
                        handleExpenseStatusChange(
                          exp,
                          e.target.value as 'DA RENDICONTARE' | 'INVIATO' | 'RIMBORSATO'
                        )
                      }
                      className="min-h-[38px] bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs font-semibold uppercase rounded-lg px-3 py-1.5"
                    >
                      <option value="DA RENDICONTARE">Da Rendicontare</option>
                      <option value="INVIATO">Inviato</option>
                      <option value="RIMBORSATO">Rimborsato</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp)}
                      className="min-h-[38px] bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs font-semibold uppercase px-3 py-1.5 rounded-lg transition"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-neutral-400 border border-dashed border-neutral-800 rounded-xl">
              Nessuna voce di spesa registrata per questo filtro.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
