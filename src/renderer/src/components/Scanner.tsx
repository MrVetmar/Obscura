import React, { useEffect, useState } from 'react'
import * as faceapi from '@vladmandic/face-api'
import { Play, Loader2, CheckCircle2 } from 'lucide-react'

export default function Scanner() {
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [statusText, setStatusText] = useState('Hazır')
  const [stats, setStats] = useState<{newPeopleCount: number, updatedFacesCount: number} | null>(null)
  const [modelError, setModelError] = useState(false)

  useEffect(() => {
    // Load models
    const loadModels = async () => {
      try {
        const modelPath = './models'
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
          faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
        ])
        setModelsLoaded(true)
      } catch (err) {
        console.error('Failed to load models:', err)
        setStatusText('Modeller yüklenemedi!')
        setModelError(true)
      }
    }
    loadModels()
  }, [])

  const startScan = async () => {
    if (!modelsLoaded) return
    setIsScanning(true)
    setStats(null)
    setStatusText('Fotoğraflar aranıyor...')
    
    try {
      const photos = await window.api.getUnscannedPhotos()
      setTotal(photos.length)
      setProgress(0)
      
      if (photos.length === 0) {
        setStatusText('Taranacak yeni fotoğraf yok.')
        setIsScanning(false)
        return
      }

      setStatusText('Yüzler taranıyor...')
      
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i]
        
        try {
          // Decrypt photo visually into an image tag temporarily (Use the much smaller thumbnail for super-fast scanning and video support!)
          const imgUrl = `obscura://local/${encodeURIComponent(p.thumbPath)}`
          
          const img = new Image()
          img.crossOrigin = 'anonymous'
          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = imgUrl
          })
          
          const detectOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.8 })
          const detections = await faceapi.detectAllFaces(img, detectOptions).withFaceLandmarks().withFaceDescriptors()
          
          const facesData = detections
            .filter(d => d.detection.box.width >= 60 && d.detection.box.height >= 60)
            .map(d => ({
              descriptor: Array.from(d.descriptor),
              box: { x: d.detection.box.x, y: d.detection.box.y, width: d.detection.box.width, height: d.detection.box.height }
            }))
          
          await window.api.saveFaces(p.id, facesData)
        } catch (photoErr) {
          console.error(`Failed to scan photo ${p.id}:`, photoErr)
          // Still mark as scanned with 0 faces so it doesn't get stuck in an infinite loop
          await window.api.saveFaces(p.id, [])
        }
        
        setProgress(i + 1)
      }
      
      setStatusText('Yüzler gruplanıyor...')
      const result = await window.api.clusterFaces()
      setStats(result)
      setStatusText('Tarama tamamlandı!')
      
    } catch (err) {
      console.error(err)
      setStatusText('Tarama sırasında hata oluştu.')
    } finally {
      setIsScanning(false)
    }
  }

  const resetScan = async () => {
    if (window.confirm('Tüm yüz verilerini ve kişileri silip baştan taramak istediğinize emin misiniz?')) {
      try {
        await window.api.resetFaces()
        setStats(null)
        setStatusText('Hazır')
        setTotal(0)
        setProgress(0)
        alert('Yüz verileri sıfırlandı. Yeniden tarama yapabilirsiniz.')
      } catch (e: any) {
        alert('Sıfırlama başarısız: ' + e.message)
      }
    }
  }

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 shadow-xl w-full max-w-md">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-medium text-white">Kütüphane Taraması</h2>
        <button 
          onClick={resetScan}
          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 bg-red-400/10 hover:bg-red-400/20 rounded transition-colors"
          title="Tüm yüz eşleştirmelerini sıfırlar"
        >
          Sıfırla
        </button>
      </div>
      <p className="text-white/60 text-sm mb-6">
        Fotoğraflarınızdaki yüzleri cihazınızda, tamamen çevrimdışı ve güvenli bir şekilde analiz ederek kişileri otomatik gruplar.
      </p>
      
      {!isScanning && !stats && (
        <button
          onClick={startScan}
          disabled={!modelsLoaded}
          className={`w-full text-white font-medium py-3 rounded-lg flex items-center justify-center space-x-2 transition-colors ${modelError ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50'}`}
        >
          {modelsLoaded ? <Play size={18} /> : (modelError ? null : <Loader2 size={18} className="animate-spin" />)}
          <span>{modelsLoaded ? 'Taramayı Başlat' : (modelError ? 'Modeller Yüklenemedi!' : 'Modeller Yükleniyor...')}</span>
        </button>
      )}

      {isScanning && (
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-blue-400 font-medium">{statusText}</span>
            <span className="text-white/60">{progress} / {total}</span>
          </div>
          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300 ease-out"
              style={{ width: total > 0 ? `${(progress / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {stats && !isScanning && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-start space-x-3">
          <CheckCircle2 className="text-green-400 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-green-400 font-medium mb-1">Tarama Bitti</h4>
            <p className="text-white/70 text-sm mb-3">
              {stats.newPeopleCount} yeni kişi bulundu, {stats.updatedFacesCount} yüz eşleştirildi.
            </p>
            <button
              onClick={() => setStats(null)}
              className="text-sm text-green-400 hover:text-green-300 font-medium"
            >
              Yeni Tarama Yap
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
