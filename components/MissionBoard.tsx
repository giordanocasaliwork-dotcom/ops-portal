'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../utils/supabase/client'

export interface Mission {
  id: string
  created_at: string
  client_vip: string
  start_time: string
  end_time: string
  pickup_point: string
  dropoff_point: string
  assigned_vehicle: string
  status: 'pianificata' | 'in corso' | 'chiusa'
  notes?: string | null
}

interface MissionsBoardProps {
  initialMissions: Mission[]
  isAdmin: boolean
  userEmail: string
  userId: string
}

export default function MissionsBoard({
  initialMissions,
  isAdmin,
  userEmail,
  userId,
}: MissionsBoardProps) {
  const supabase = createClient()
  const router = useRouter()

  const [missions, setMissions] = useState<Mission[]>(initialMissions)
  const [filter, setFilter] = useState<'tutte' | 'pianificata' | 'in corso' | 'chiusa'>('tutte')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Campi form nuova missione
  const [clientVip, setClientVip] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [pickupPoint, setPickupPoint] = useState('')
  const [dropoffPoint, setDropoffPoint] = useState('')
  const [assignedVehicle, setAssignedVehicle] = useState('')
  const [notes, setNotes] = useState('')

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error: insertError } = await supabase
        .from('missions')
        .insert([
          {
            client_vip: clientVip,
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            pickup_point: pickupPoint,
            dropoff_point: dropoffPoint,
            assigned_vehicle: assignedVehicle,
            status: 'pianificata',
            notes: notes.trim() || null,
            created_by: userId,
          },
        ])
        .select()
        .single()

      if (insertError) throw insertError

      await supabase.from('audit_logs').insert([
        {
          user_email: userEmail,
          action: ⁠ MISSION_CREATE (${clientVip}) ⁠,
          status: 'SUCCESS',
        },
      ])

      if (data) {
        setMissions((prev) => [data as Mission, ...prev])
      }

      setClientVip('')
      setStartTime('')
      setEndTime('')
      setPickupPoint('')
      setDropoffPoint('')
      setAssignedVehicle('')
      setNotes('')
      setShowForm(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Errore durante la creazione della missione.')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (
    missionId: string,
    clientName: string,
    newStatus: 'pianificata' | 'in corso' | 'chiusa'
  ) => {
    const previous = [...missions]
    setMissions((prev) =>
      prev.map((m) => (m.id === missionId ? { ...m, status: newStatus } : m))
    )

    const { error: updateError } = await supabase
      .from('missions')
      .update({ status: newStatus })
      .eq('id', missionId)

    if (updateError) {
      setMissions(previous)
      setError('Impossibile aggiornare lo stato operativo.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
        user_email: userEmail,
        action: ⁠ MISSION_STATUS -> ${newStatus.toUpperCase()} (${clientName}) ⁠,
        status: 'SUCCESS',
      },
    ])

    router.refresh()
  }

  const handleDeleteMission = async (missionId: string, clientName: string) => {
    const previous = [...missions]
    setMissions((prev) => prev.filter((m) => m.id !== missionId))

    const { error: deleteError } = await supabase
      .from('missions')
      .delete()
      .eq('id', missionId)

    if (deleteError) {
      setMissions(previous)
      setError('Errore nella rimozione della missione.')
      return
    }

    await supabase.from('audit_logs').insert([
      {
