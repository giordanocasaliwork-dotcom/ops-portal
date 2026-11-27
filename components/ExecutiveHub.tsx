 'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '../utils/supabase/client'

export interface ExecutiveContact {
  id: string
  created_at: string
  full_name: string
  organization: string | null
  role_title: string | null
  category: string
  access_tier: 'ACCESSO DIRETTO' | 'FILTRO SEGRETERIA' | 'RISERVATO / BLOCCO'
  nda_status: 'ATTIVO' | 'IN CORSO' | 'NON RICHIESTO'
  phone: string | null
  email: string | null
  relationship_notes: string | null
}

export interface VipPreference {
  id: string
  created_at: string
  category: string
  title: string
  details: string
}

interface ExecutiveHubProps {
  userEmail: string
  onAuditUpdated?: () => void
}

export default function ExecutiveHub({ userEmail, onAuditUpdated }: ExecutiveHubProps) {
  const supabase = useMemo(() => createClient(), [])
  const contactFormRef = useRef<HTMLFormElement | null>(null)
  const prefFormRef = useRef<HTMLFormElement | null>(null)

  const [activeTab, setActiveTab] = useState<'contacts' | 'preferences'>('contacts')
  const [contacts, setContacts] = useState<ExecutiveContact[]>([])
  const [preferences, setPreferences] = useState<VipPreference[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [contactSearch, setContactSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<
    'TUTTI' | 'ACCESSO DIRETTO' | 'FILTRO SEGRETERIA' | 'RISERVATO / BLOCCO'
  >('TUTTI')
  const [showContactForm, setShowContactForm] = useState(false)
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [contactName, setContactName] = useState('')
  const [contactOrg, setContactOrg] = useState('')
  const [contactRole, setContactRole] = useState('')
  const [contactCategory, setContactCategory] = useState('Cliente / Partner')
  const [contactTier, setContactTier] = useState<
    'ACCESSO DIRETTO' | 'FILTRO SEGRETERIA' | 'RISERVATO / BLOCCO'
  >('FILTRO SEGRETERIA')
  const [contactNda, setContactNda] = useState<'ATTIVO' | 'IN CORSO' | 'NON RICHIESTO'>(
    'NON RICHIESTO'
  )
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactNotes, setContactNotes] = useState('')

  const [prefCategoryFilter, setPrefCategoryFilter] = useState('TUTTE')
  const [showPrefForm, setShowPrefForm] = useState(false)
  const [editingPrefId, setEditingPrefId] = useState<string | null>(null)
  const [prefCategory, setPrefCategory] = useState('Viaggi & Voli')
  const [prefTitle, setPrefTitle] = useState('')
  const [prefDetails, setPrefDetails] = useState('')

  const loadExecutiveData = useCallback(async () => {
    const [contactsRes, prefsRes] = await Promise.all([
      supabase.from('executive_contacts').select('*').order('full_name', { ascending: true }),
      supabase.from('vip_preferences').select('*').order('category', { ascending: true }),
    ])

    if (contactsRes.data) setContacts(contactsRes.data as ExecutiveContact[])
    if (prefsRes.data) setPreferences(prefsRes.data as VipPreference[])
  }, [supabase])

  useEffect(() => {
    loadExecutiveData()
  }, [loadExecutiveData])

  const resetContactForm = () => {
    setEditingContactId(null)
    setContactName('')
    setContactOrg('')
    setContactRole('')
    setContactCategory('Cliente / Partner')
    setContactTier('FILTRO SEGRETERIA')
    setContactNda('NON RICHIESTO')
    setContactPhone('')
    setContactEmail('')
    setContactNotes('')
    setShowContactForm(false)
  }

  const handleEditContactClick = (c: ExecutiveContact) => {
    setEditingContactId(c.id)
    setContactName(c.full_name)
    setContactOrg(c.organization || '')
    setContactRole(c.role_title || '')
    setContactCategory(c.category || 'Cliente / Partner')
    setContactTier(c.access_tier)
    setContactNda(c.nda_status)
    setContactPhone(c.phone || '')
    setContactEmail(c.email || '')
    setContactNotes(c.relationship_notes || '')
    setShowContactForm(true)
    setError(null)
    setTimeout(() => {
      contactFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload = {
        full_name: contactName.trim(),
        organization: contactOrg.trim() || null,
        role_title: contactRole.trim() || null,
        category: contactCategory,
        access_tier: contactTier,
        nda_status: contactNda,
        phone: contactPhone.trim() || null,
        email: contactEmail.trim() || null,
        relationship_notes: contactNotes.trim() || null,
      }

      if (editingContactId) {
        const { error: updErr } = await supabase
          .from('executive_contacts')
          .update(payload)
          .eq('id', editingContactId)

        if (updErr) throw updErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `CONTACT_UPDATE: ${contactName.trim()} [${contactTier}]`,
            status: 'SUCCESS',
          },
        ])
      } else {
        const { error: insErr } = await supabase.from('executive_contacts').insert([payload])

        if (insErr) throw insErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `CONTACT_ADD: ${contactName.trim()} [${contactTier}]`,
            status: 'SUCCESS',
          },
        ])
      }

      resetContactForm()
      await loadExecutiveData()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore salvataggio contatto in rubrica.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateContactTier = async (
    contact: ExecutiveContact,
    newTier: ExecutiveContact['access_tier']
  ) => {
    const { error: updErr } = await supabase
      .from('executive_contacts')
      .update({ access_tier: newTier })
      .eq('id', contact.id)

    if (updErr) {
      setError('Impossibile aggiornare livello gatekeeping.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `CONTACT_TIER_UPDATE: ${contact.full_name} -> ${newTier}`,
        status: 'SUCCESS',
      },
    ])

    await loadExecutiveData()
    if (onAuditUpdated) onAuditUpdated()
  }

  const handleDeleteContact = async (contact: ExecutiveContact) => {
    const { error: delErr } = await supabase
      .from('executive_contacts')
      .delete()
      .eq('id', contact.id)

    if (delErr) {
      setError('Errore eliminazione contatto.')
      return
    }

    if (editingContactId === contact.id) {
      resetContactForm()
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `CONTACT_DELETE: ${contact.full_name}`,
        status: 'SUCCESS',
      },
    ])

    await loadExecutiveData()
    if (onAuditUpdated) onAuditUpdated()
  }

  const resetPrefForm = () => {
    setEditingPrefId(null)
    setPrefCategory('Viaggi & Voli')
    setPrefTitle('')
    setPrefDetails('')
    setShowPrefForm(false)
  }

  const handleEditPrefClick = (p: VipPreference) => {
    setEditingPrefId(p.id)
    setPrefCategory(p.category)
    setPrefTitle(p.title)
    setPrefDetails(p.details)
    setShowPrefForm(true)
    setError(null)
    setTimeout(() => {
      prefFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleSavePreference = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload = {
        category: prefCategory,
        title: prefTitle.trim(),
        details: prefDetails.trim(),
      }

      if (editingPrefId) {
        const { error: updErr } = await supabase
          .from('vip_preferences')
          .update(payload)
          .eq('id', editingPrefId)

        if (updErr) throw updErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `VIP_PREF_UPDATE: ${prefTitle.trim()} (${prefCategory})`,
            status: 'SUCCESS',
          },
        ])
      } else {
        const { error: insErr } = await supabase.from('vip_preferences').insert([payload])

        if (insErr) throw insErr

        await supabase.from('audit_logs').insert([
          {
            user_email: userEmail,
            action: `VIP_PREF_ADD: ${prefTitle.trim()} (${prefCategory})`,
            status: 'SUCCESS',
          },
        ])
      }

      resetPrefForm()
      await loadExecutiveData()
      if (onAuditUpdated) onAuditUpdated()
    } catch (err: any) {
      setError(err.message || 'Errore salvataggio preferenza Direzione.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePreference = async (pref: VipPreference) => {
    const { error: delErr } = await supabase
      .from('vip_preferences')
      .delete()
      .eq('id', pref.id)

    if (delErr) {
      setError('Errore rimozione preferenza.')
      return
    }

    if (editingPrefId === pref.id) {
      resetPrefForm()
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: `VIP_PREF_DELETE: ${pref.title}`,
        status: 'SUCCESS',
      },
    ])

    await loadExecutiveData()
    if (onAuditUpdated) onAuditUpdated()
  }

  const filteredContacts = contacts.filter((c) => {
    if (tierFilter !== 'TUTTI' && c.access_tier !== tierFilter) return false
    if (!contactSearch.trim()) return true
    const q = contactSearch.toLowerCase()
    const hay = `${c.full_name} ${c.organization || ''} ${c.role_title || ''} ${c.category} ${
      c.phone || ''
    } ${c.email || ''} ${c.relationship_notes || ''}`.toLowerCase()
    return hay.includes(q)
  })

  const filteredPreferences = preferences.filter((p) =>
    prefCategoryFilter === 'TUTTE' ? true : p.category === prefCategoryFilter
  )

  const tierBadge = (tier: ExecutiveContact['access_tier']) => {
    if (tier === 'ACCESSO DIRETTO') {
      return 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
    }
    if (tier === 'RISERVATO / BLOCCO') {
      return 'bg-red-950/80 text-red-300 border-red-600'
    }
    return 'bg-amber-950/80 text-amber-300 border-amber-600'
  }

  const ndaBadge = (nda: ExecutiveContact['nda_status']) => {
    if (nda === 'ATTIVO') return 'bg-sky-950/80 text-sky-300 border-sky-700'
    if (nda === 'IN CORSO') return 'bg-amber-950/60 text-amber-300 border-amber-700'
    return 'bg-neutral-900 text-neutral-300 border-neutral-700'
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 border-t-2 border-t-amber-500 rounded-xl p-4 sm:p-6 shadow-xl space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase">
              Direzione
            </span>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-white">
              Gatekeeping, Rubrica Strategica &amp; Preferenze VIP
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Regole filtro chiamate/accessi, stato NDA e standard operativi della Direzione
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            className={
              'min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-sm uppercase tracking-wider font-bold border transition ' +
              (activeTab === 'contacts'
                ? 'bg-amber-400 text-neutral-950 border-amber-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
            }
          >
            Rubrica &amp; Filtri ({contacts.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={
              'min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-sm uppercase tracking-wider font-bold border transition ' +
              (activeTab === 'preferences'
                ? 'bg-amber-400 text-neutral-950 border-amber-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
            }
          >
            Preferenze VIP ({preferences.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-lg">
          {error}
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Cerca nome, societa, telefono..."
                className="bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2 text-base sm:text-sm text-white w-full sm:w-64 focus:outline-none focus:border-amber-400"
              />

              {(
                [
                  'TUTTI',
                  'ACCESSO DIRETTO',
                  'FILTRO SEGRETERIA',
                  'RISERVATO / BLOCCO',
                ] as const
              ).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setTierFilter(tier)}
                  className={
                    'min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs uppercase border transition ' +
                    (tierFilter === tier
                      ? 'bg-neutral-100 text-neutral-950 border-neutral-100 font-bold'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {tier}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                if (showContactForm) {
                  resetContactForm()
                } else {
                  setShowContactForm(true)
                }
              }}
              className="min-h-[40px] bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition self-start md:self-auto shrink-0"
            >
              {showContactForm ? 'Chiudi Modulo' : '+ Nuovo Contatto'}
            </button>
          </div>

          {showContactForm && (
            <form
              ref={contactFormRef}
              onSubmit={handleSaveContact}
              className="p-4 sm:p-5 bg-neutral-950 border border-amber-500/40 rounded-xl space-y-4 text-sm"
            >
              <div className="text-sm uppercase tracking-wider text-amber-400 font-bold">
                {editingContactId
                  ? 'Modifica Profilo Rubrica Strategica'
                  : 'Nuovo Profilo Rubrica Strategica & Gatekeeping'}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Nome e Cognome *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Es. Avv. Marco Rossi"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Societa / Studio / Istituzione
                  </label>
                  <input
                    type="text"
                    value={contactOrg}
                    onChange={(e) => setContactOrg(e.target.value)}
                    placeholder="Denominazione organizzazione"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Ruolo / Qualifica
                  </label>
                  <input
                    type="text"
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="Es. Managing Partner / Advisor"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Regola Gatekeeping *
                  </label>
                  <select
                    value={contactTier}
                    onChange={(e) =>
                      setContactTier(
                        e.target.value as
                          | 'ACCESSO DIRETTO'
                          | 'FILTRO SEGRETERIA'
                          | 'RISERVATO / BLOCCO'
                      )
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  >
                    <option value="ACCESSO DIRETTO">ACCESSO DIRETTO (Passare subito)</option>
                    <option value="FILTRO SEGRETERIA">FILTRO SEGRETERIA (Verificare oggetto)</option>
                    <option value="RISERVATO / BLOCCO">RISERVATO / BLOCCO (Non trasferire)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Categoria
                  </label>
                  <select
                    value={contactCategory}
                    onChange={(e) => setContactCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  >
                    <option value="Cliente / Partner">Cliente / Partner</option>
                    <option value="Legale / Fiscale">Legale / Fiscale</option>
                    <option value="Istituzionale">Istituzionale</option>
                    <option value="Famiglia / Privato">Famiglia / Privato</option>
                    <option value="Altro">Altro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Stato NDA
                  </label>
                  <select
                    value={contactNda}
                    onChange={(e) =>
                      setContactNda(
                        e.target.value as 'ATTIVO' | 'IN CORSO' | 'NON RICHIESTO'
                      )
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  >
                    <option value="NON RICHIESTO">NON RICHIESTO</option>
                    <option value="IN CORSO">IN CORSO</option>
                    <option value="ATTIVO">ATTIVO (Firmato)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Telefono Diretto / Segreteria
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+39 ..."
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Email
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="nome@dominio.it"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Note Relazionali / Nome Assistente
                  </label>
                  <input
                    type="text"
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="Es. Assistente: Laura - Preferisce contatto mattutino"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={resetContactForm}
                  className="min-h-[40px] bg-neutral-900 text-neutral-300 border border-neutral-700 text-xs sm:text-sm uppercase px-4 py-2 rounded-lg font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[40px] bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase px-5 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {loading
                    ? 'Salvataggio...'
                    : editingContactId
                    ? 'Aggiorna Contatto'
                    : 'Salva in Rubrica'}
                </button>
              </div>
            </form>
          )}

          {filteredContacts.length > 0 ? (
            <div className="space-y-3 text-sm">
              {filteredContacts.map((c) => (
                <div
                  key={c.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-md border text-xs font-bold uppercase ${tierBadge(
                          c.access_tier
                        )}`}
                      >
                        {c.access_tier}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md border text-xs font-bold uppercase ${ndaBadge(
                          c.nda_status
                        )}`}
                      >
                        NDA: {c.nda_status}
                      </span>
                      <span className="text-xs text-neutral-400 font-medium">{c.category}</span>
                    </div>

                    <div className="text-base sm:text-lg font-bold text-white">
                      {c.full_name}
                      {c.organization && (
                        <span className="text-amber-300 font-medium"> — {c.organization}</span>
                      )}
                      {c.role_title && (
                        <span className="text-neutral-400 font-normal text-sm">
                          {' '}
                          ({c.role_title})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-neutral-200 text-sm">
                      {c.phone && (
                        <a
                          href={`tel:${c.phone.replace(/\s+/g, '')}`}
                          className="inline-flex items-center gap-1.5 font-mono text-emerald-300 hover:text-emerald-200 underline decoration-emerald-700"
                        >
                          <span className="text-neutral-400 font-sans">Tel:</span> {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="text-neutral-200 hover:text-white underline decoration-neutral-600"
                        >
                          <span className="text-neutral-400">Email:</span> {c.email}
                        </a>
                      )}
                    </div>

                    {c.relationship_notes && (
                      <div className="text-neutral-300 italic text-sm">{c.relationship_notes}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditContactClick(c)}
                      className="min-h-[38px] bg-neutral-900 hover:bg-neutral-800 text-neutral-100 border border-neutral-700 text-xs font-semibold uppercase px-3 py-1.5 rounded-lg transition"
                    >
                      Modifica
                    </button>

                    <select
                      aria-label="Livello gatekeeping"
                      value={c.access_tier}
                      onChange={(e) =>
                        handleUpdateContactTier(
                          c,
                          e.target.value as ExecutiveContact['access_tier']
                        )
                      }
                      className="min-h-[38px] bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs font-semibold rounded-lg px-3 py-1.5"
                    >
                      <option value="ACCESSO DIRETTO">Accesso Diretto</option>
                      <option value="FILTRO SEGRETERIA">Filtro Segreteria</option>
                      <option value="RISERVATO / BLOCCO">Riservato / Blocco</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleDeleteContact(c)}
                      className="min-h-[38px] bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-neutral-400 border border-dashed border-neutral-800 rounded-xl">
              Nessun contatto trovato in rubrica per il filtro selezionato.
            </div>
          )}
        </div>
      )}

      {activeTab === 'preferences' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  'TUTTE',
                  'Viaggi & Voli',
                  'Hotel & Ospitalita',
                  'Food & Allergie',
                  'Protocollo & Sicurezza',
                ] as const
              ).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPrefCategoryFilter(cat)}
                  className={
                    'min-h-[36px] px-3 py-1.5 rounded-lg text-xs uppercase border transition ' +
                    (prefCategoryFilter === cat
                      ? 'bg-neutral-100 text-neutral-950 border-neutral-100 font-bold'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {cat}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                if (showPrefForm) {
                  resetPrefForm()
                } else {
                  setShowPrefForm(true)
                }
              }}
              className="min-h-[40px] bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase tracking-wider px-4 py-2 rounded-lg transition"
            >
              {showPrefForm ? 'Chiudi Modulo' : '+ Nuova Preferenza'}
            </button>
          </div>

          {showPrefForm && (
            <form
              ref={prefFormRef}
              onSubmit={handleSavePreference}
              className="p-4 sm:p-5 bg-neutral-950 border border-amber-500/40 rounded-xl space-y-4 text-sm"
            >
              <div className="text-sm uppercase tracking-wider text-amber-400 font-bold">
                {editingPrefId
                  ? 'Modifica Standard / Preferenza Direzione'
                  : 'Nuovo Standard / Preferenza Permanente Direzione'}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Area Operativa
                  </label>
                  <select
                    value={prefCategory}
                    onChange={(e) => setPrefCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  >
                    <option value="Viaggi & Voli">Viaggi &amp; Voli</option>
                    <option value="Hotel & Ospitalita">Hotel &amp; Ospitalita</option>
                    <option value="Food & Allergie">Food &amp; Allergie</option>
                    <option value="Protocollo & Sicurezza">Protocollo &amp; Sicurezza</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                    Titolo / Voce *
                  </label>
                  <input
                    type="text"
                    required
                    value={prefTitle}
                    onChange={(e) => setPrefTitle(e.target.value)}
                    placeholder="Es. Posto Aereo / Intolleranze / Tipologia Suite"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase text-neutral-400 mb-1.5 font-semibold">
                  Dettagli &amp; Standard Richiesti *
                </label>
                <textarea
                  rows={3}
                  required
                  value={prefDetails}
                  onChange={(e) => setPrefDetails(e.target.value)}
                  placeholder="Specifiche esatte da applicare automaticamente a ogni prenotazione"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-base sm:text-sm text-white"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2.5">
                <button
                  type="button"
                  onClick={resetPrefForm}
                  className="min-h-[40px] bg-neutral-900 text-neutral-300 border border-neutral-700 text-xs sm:text-sm uppercase px-4 py-2 rounded-lg font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[40px] bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs sm:text-sm uppercase px-5 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {loading
                    ? 'Salvataggio...'
                    : editingPrefId
                    ? 'Aggiorna Preferenza'
                    : 'Registra Preferenza'}
                </button>
              </div>
            </form>
          )}

          {filteredPreferences.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-sm">
              {filteredPreferences.map((p) => (
                <div
                  key={p.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase">
                      {p.category}
                    </span>
                    <div className="text-base font-bold text-white">{p.title}</div>
                    <div className="text-neutral-200 whitespace-pre-line leading-relaxed">
                      {p.details}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditPrefClick(p)}
                      className="text-amber-300 hover:text-amber-200 text-xs font-bold uppercase py-1"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePreference(p)}
                      className="text-neutral-400 hover:text-red-400 text-xs font-semibold uppercase py-1"
                    >
                      Rimuovi
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-neutral-400 border border-dashed border-neutral-800 rounded-xl">
              Nessuna preferenza registrata per questa categoria.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
