 'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insErr } = await supabase.from('executive_contacts').insert([
        {
          full_name: contactName.trim(),
          organization: contactOrg.trim() || null,
          role_title: contactRole.trim() || null,
          category: contactCategory,
          access_tier: contactTier,
          nda_status: contactNda,
          phone: contactPhone.trim() || null,
          email: contactEmail.trim() || null,
          relationship_notes: contactNotes.trim() || null,
        },
      ])

      if (insErr) throw insErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `CONTACT_ADD: ${contactName.trim()} [${contactTier}]`,
          status: 'SUCCESS',
        },
      ])

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

  const handleAddPreference = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insErr } = await supabase.from('vip_preferences').insert([
        {
          category: prefCategory,
          title: prefTitle.trim(),
          details: prefDetails.trim(),
        },
      ])

      if (insErr) throw insErr

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: `VIP_PREF_ADD: ${prefTitle.trim()} (${prefCategory})`,
          status: 'SUCCESS',
        },
      ])

      setPrefTitle('')
      setPrefDetails('')
      setShowPrefForm(false)
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
    return 'bg-neutral-900 text-neutral-400 border-neutral-700'
  }

  return (
    <div className="bg-neutral-900 border-2 border-orange-500/80 rounded-lg p-6 shadow-xl space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-orange-500/30 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 text-[10px] font-bold uppercase">
              AREA DIREZIONE
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-100">
              Gatekeeping, Rubrica Strategica &amp; Preferenze VIP
            </h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Regole di filtro chiamate/accessi, stato NDA e standard operativi permanenti della Direzione
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            className={
              'px-3 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
              (activeTab === 'contacts'
                ? 'bg-amber-400 text-neutral-950 border-amber-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:border-neutral-500')
            }
          >
            Gatekeeping &amp; Contatti ({contacts.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={
              'px-3 py-1.5 rounded text-xs uppercase tracking-wider font-semibold border transition ' +
              (activeTab === 'preferences'
                ? 'bg-amber-400 text-neutral-950 border-amber-400'
                : 'bg-neutral-950 text-neutral-300 border-neutral-700 hover:border-neutral-500')
            }
          >
            Preferenze Direzione ({preferences.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
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
                placeholder="Cerca nominativo, societa, telefono..."
                className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 w-60 focus:outline-none focus:border-neutral-600"
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
                    'px-2 py-1 rounded text-[10px] uppercase border transition ' +
                    (tierFilter === tier
                      ? 'bg-neutral-200 text-neutral-950 border-neutral-200 font-bold'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600')
                  }
                >
                  {tier}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowContactForm(!showContactForm)}
              className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition self-start md:self-auto shrink-0"
            >
              {showContactForm ? 'Chiudi Modulo' : '+ Nuovo Contatto'}
            </button>
          </div>

          {showContactForm && (
            <form
              onSubmit={handleAddContact}
              className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3 text-xs"
            >
              <div className="text-xs uppercase tracking-wider text-amber-300 font-semibold">
                Nuovo Profilo Rubrica Strategica &amp; Gatekeeping
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Nome e Cognome *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Es. Avv. Marco Rossi"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Societa / Studio / Istituzione
                  </label>
                  <input
                    type="text"
                    value={contactOrg}
                    onChange={(e) => setContactOrg(e.target.value)}
                    placeholder="Denominazione organizzazione"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Ruolo / Qualifica
                  </label>
                  <input
                    type="text"
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="Es. Managing Partner / Advisor"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
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
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  >
                    <option value="ACCESSO DIRETTO">ACCESSO DIRETTO (Passare subito)</option>
                    <option value="FILTRO SEGRETERIA">FILTRO SEGRETERIA (Verificare oggetto)</option>
                    <option value="RISERVATO / BLOCCO">RISERVATO / BLOCCO (Non trasferire)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Categoria
                  </label>
                  <select
                    value={contactCategory}
                    onChange={(e) => setContactCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  >
                    <option value="Cliente / Partner">Cliente / Partner</option>
                    <option value="Legale / Fiscale">Legale / Fiscale</option>
                    <option value="Istituzionale">Istituzionale</option>
                    <option value="Famiglia / Privato">Famiglia / Privato</option>
                    <option value="Altro">Altro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Stato NDA
                  </label>
                  <select
                    value={contactNda}
                    onChange={(e) =>
                      setContactNda(
                        e.target.value as 'ATTIVO' | 'IN CORSO' | 'NON RICHIESTO'
                      )
                    }
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  >
                    <option value="NON RICHIESTO">NON RICHIESTO</option>
                    <option value="IN CORSO">IN CORSO</option>
                    <option value="ATTIVO">ATTIVO (Firmato)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Telefono Diretto / Segreteria
                  </label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+39 ..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="nome@dominio.it"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Note Relazionali / Nome Assistente
                  </label>
                  <input
                    type="text"
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="Es. Assistente: Laura - Preferisce contatto mattutino"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs uppercase px-5 py-2 rounded transition disabled:opacity-50"
                >
                  {loading ? 'Salvataggio...' : 'Salva in Rubrica'}
                </button>
              </div>
            </form>
          )}

          {filteredContacts.length > 0 ? (
            <div className="space-y-2.5 text-xs">
              {filteredContacts.map((c) => (
                <div
                  key={c.id}
                  className="bg-neutral-950 border border-neutral-800/90 rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${tierBadge(
                          c.access_tier
                        )}`}
                      >
                        {c.access_tier}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${ndaBadge(
                          c.nda_status
                        )}`}
                      >
                        NDA: {c.nda_status}
                      </span>
                      <span className="text-[11px] text-neutral-400">{c.category}</span>
                    </div>

                    <div className="text-sm font-bold text-neutral-100">
                      {c.full_name}
                      {c.organization && (
                        <span className="text-amber-300 font-normal"> — {c.organization}</span>
                      )}
                      {c.role_title && (
                        <span className="text-neutral-400 font-normal"> ({c.role_title})</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-neutral-300">
                      {c.phone && (
                        <span>
                          <span className="text-neutral-500">Tel:</span> {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span>
                          <span className="text-neutral-500">Email:</span> {c.email}
                        </span>
                      )}
                    </div>

                    {c.relationship_notes && (
                      <div className="text-neutral-400 italic">{c.relationship_notes}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                    <select
                      aria-label="Livello gatekeeping"
                      value={c.access_tier}
                      onChange={(e) =>
                        handleUpdateContactTier(
                          c,
                          e.target.value as ExecutiveContact['access_tier']
                        )
                      }
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded px-2.5 py-1.5"
                    >
                      <option value="ACCESSO DIRETTO">Accesso Diretto</option>
                      <option value="FILTRO SEGRETERIA">Filtro Segreteria</option>
                      <option value="RISERVATO / BLOCCO">Riservato / Blocco</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleDeleteContact(c)}
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
              Nessun contatto trovato in rubrica per il filtro selezionato.
            </div>
          )}
        </div>
      )}

      {activeTab === 'preferences' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
                    'px-2.5 py-1 rounded text-[11px] uppercase border transition ' +
                    (prefCategoryFilter === cat
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
              onClick={() => setShowPrefForm(!showPrefForm)}
              className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded transition"
            >
              {showPrefForm ? 'Chiudi Modulo' : '+ Nuova Preferenza'}
            </button>
          </div>

          {showPrefForm && (
            <form
              onSubmit={handleAddPreference}
              className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3 text-xs"
            >
              <div className="text-xs uppercase tracking-wider text-amber-300 font-semibold">
                Nuovo Standard / Preferenza Permanente Direzione
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Area Operativa
                  </label>
                  <select
                    value={prefCategory}
                    onChange={(e) => setPrefCategory(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  >
                    <option value="Viaggi & Voli">Viaggi &amp; Voli</option>
                    <option value="Hotel & Ospitalita">Hotel &amp; Ospitalita</option>
                    <option value="Food & Allergie">Food &amp; Allergie</option>
                    <option value="Protocollo & Sicurezza">Protocollo &amp; Sicurezza</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                    Titolo / Voce *
                  </label>
                  <input
                    type="text"
                    required
                    value={prefTitle}
                    onChange={(e) => setPrefTitle(e.target.value)}
                    placeholder="Es. Posto Aereo / Intolleranze / Tipologia Suite"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase text-neutral-400 mb-1">
                  Dettagli &amp; Standard Richiesti *
                </label>
                <textarea
                  rows={2}
                  required
                  value={prefDetails}
                  onChange={(e) => setPrefDetails(e.target.value)}
                  placeholder="Specifiche esatte da applicare automaticamente a ogni prenotazione"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs uppercase px-5 py-2 rounded transition disabled:opacity-50"
                >
                  {loading ? 'Salvataggio...' : 'Registra Preferenza'}
                </button>
              </div>
            </form>
          )}

          {filteredPreferences.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {filteredPreferences.map((p) => (
                <div
                  key={p.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-lg p-3.5 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <span className="inline-block px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800 text-[10px] font-bold uppercase">
                      {p.category}
                    </span>
                    <div className="text-sm font-bold text-neutral-100">{p.title}</div>
                    <div className="text-neutral-300 whitespace-pre-line">{p.details}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeletePreference(p)}
                    className="text-neutral-500 hover:text-red-400 text-[11px] uppercase shrink-0"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
              Nessuna preferenza registrata per questa categoria.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
