import { useState, useEffect } from 'react'
import { Lock, Unlock, ShieldAlert } from 'lucide-react'

interface Props {
  initialized: boolean
  onUnlock: () => void
}

export default function AuthScreen({ initialized, onUnlock }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [lockoutTimer, setLockoutTimer] = useState<number | null>(null)

  // Handle countdown
  useEffect(() => {
    if (lockoutTimer !== null && lockoutTimer > 0) {
      const interval = setInterval(() => {
        setLockoutTimer(prev => prev !== null ? prev - 1 : null)
      }, 1000)
      return () => clearInterval(interval)
    } else if (lockoutTimer === 0) {
      setLockoutTimer(null)
      setError('')
    }
  }, [lockoutTimer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockoutTimer) return
    setError('')
    
    if (!password) {
      setError('Şifre boş olamaz')
      return
    }

    if (!initialized && password !== confirmPassword) {
      setError('Şifreler eşleşmiyor')
      return
    }

    setLoading(true)
    try {
      if (!initialized) {
        const res = await window.api.setupPassword(password)
        if (res.success) {
          onUnlock()
        } else {
          setError(res.error || 'Bilinmeyen bir hata oluştu')
        }
      } else {
        const res = await window.api.unlock(password)
        if (res.success) {
          onUnlock()
        } else {
          setError(res.error || 'Hatalı şifre veya bozuk veritabanı')
          if (res.lockoutRemaining) {
            setLockoutTimer(res.lockoutRemaining)
          }
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 p-8 shadow-2xl ring-1 ring-gray-800">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600/20 text-blue-500 mb-4">
            {initialized ? <Lock size={32} /> : <Unlock size={32} />}
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {initialized ? 'Obscura\'ya Giriş Yap' : 'Obscura Kurulumu'}
          </h1>
          <p className="mt-2 text-center text-sm text-gray-400">
            {initialized
              ? 'Şifrelenmiş kasanızı açmak için ana şifrenizi girin.'
              : 'Verilerinizi şifrelemek için güçlü bir ana şifre belirleyin.'}
          </p>
        </div>

        {!initialized && (
          <div className="mb-6 rounded-lg bg-red-950/50 p-4 ring-1 ring-red-900/50 flex gap-3">
            <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-red-200">
              <strong className="block font-semibold text-red-100 mb-1">DİKKAT: Kurtarılamaz Veri</strong>
              Ana şifrenizi unutursanız, şifrelenmiş fotoğraflarınıza ve verilerinize <strong>kesinlikle</strong> ulaşılamaz. Şifrenizi güvenli bir yere not edin.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Ana Şifre
            </label>
            <input
              type="password"
              className="w-full rounded-lg bg-gray-950 border border-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          {!initialized && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Şifreyi Onayla
              </label>
              <input
                type="password"
                className="w-full rounded-lg bg-gray-950 border border-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 font-medium">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || lockoutTimer !== null}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 transition-colors"
          >
            {lockoutTimer !== null 
              ? `Çok Fazla Deneme (${lockoutTimer} sn)` 
              : loading 
                ? 'İşleniyor...' 
                : initialized 
                  ? 'Kilidi Aç' 
                  : 'Şifreyi Belirle ve Başla'}
          </button>
        </form>
      </div>
    </div>
  )
}
