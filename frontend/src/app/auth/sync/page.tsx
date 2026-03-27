'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import '../../welcome/page.css'
import './page.css'

export default function AuthSync() {
  const router = useRouter()

  useEffect(() => {
    let isActive = true

    const finishLogin = async () => {
      const { data } = await supabase.auth.getSession()
      if (!isActive || !data.session) return false

      const username = data.session.user.user_metadata?.full_name
        || data.session.user.user_metadata?.name
        || data.session.user.email?.split('@')[0]
        || 'User'
      const email = data.session.user.email || ''

      localStorage.setItem('auth', 'true')
      localStorage.setItem('username', username)
      localStorage.setItem('email', email)
      sessionStorage.setItem('auth', 'true')

      router.replace('/dashboard/upload')
      return true
    }

    const handleAuth = async () => {
      // OAuth callback can take a moment before session becomes available.
      for (let i = 0; i < 8; i += 1) {
        const ok = await finishLogin()
        if (ok || !isActive) return
        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      console.error('Supabase OAuth session missing after callback sync')
      router.replace('/welcome')
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN') {
        await finishLogin()
      }
    })

    handleAuth()

    return () => {
      isActive = false
      authListener.subscription.unsubscribe()
    }
  }, [router])

  return (
    <div className="ax-wrapper">
      {/* Left panel – keep branding light here */}
      <div className="ax-panel-left">
        <div className="ax-panel-body">
          <div className="ax-static-line">
            Meteora Analytics
          </div>
          <p className="ax-panel-sub">
            Signing you in with Google&hellip;
          </p>
        </div>
      </div>

      {/* Right panel – mirror the welcome login success feel */}
      <div className="ax-panel-right">
        <div className="ax-form-container">
          <div className="ax-success-screen">
            <div className="ax-success-ring">
              {/* Simple inner dot so it doesn’t depend on welcome icons */}
              <span className="ax-success-ring-dot" />
            </div>
            <div className="ax-success-title">
              Signing you in&hellip;
            </div>
            <p className="ax-success-msg">
              Verifying your Google account and preparing your dashboard.
            </p>
            <div className="ax-redir-bar">
              <div
                className="ax-redir-fill"
                style={{ width: "60%", transition: "width 2s ease-in-out" }}
              />
            </div>
            <div className="ax-redir-hint">
              This will only take a moment.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}