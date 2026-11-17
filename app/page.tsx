'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard')
  }, [router])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-400 p-8 font-mono text-xs">
      Reindirizzamento all&apos;area operativa...
    </div>
  )
}
