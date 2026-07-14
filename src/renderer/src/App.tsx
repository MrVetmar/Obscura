import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import AuthScreen from './AuthScreen'
import Dashboard from './Dashboard'

function App() {
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [locked, setLocked] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let timeout: NodeJS.Timeout

    const resetTimer = () => {
      clearTimeout(timeout)
      // 5 minutes = 300000 ms
      timeout = setTimeout(async () => {
        if (!locked) {
          await window.api.lock()
          setLocked(true)
          navigate('/auth', { replace: true })
        }
      }, 300000)
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()

    return () => {
      clearTimeout(timeout)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [locked, navigate])

  useEffect(() => {
    const checkStatus = async () => {
      const isInit = await window.api.checkInitialized()
      const isLock = await window.api.checkLocked()
      setInitialized(isInit)
      setLocked(isLock)
      setLoading(false)

      if (isLock || !isInit) {
        navigate('/auth', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    }
    checkStatus()
  }, [navigate])

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-900 text-white">Loading...</div>
  }

  return (
    <Routes>
      <Route 
        path="/auth" 
        element={<AuthScreen initialized={initialized} onUnlock={() => {
          setLocked(false)
          navigate('/', { replace: true })
        }} />} 
      />
      <Route 
        path="/" 
        element={!locked ? <Dashboard /> : <Navigate to="/auth" replace />} 
      />
    </Routes>
  )
}

export default App
