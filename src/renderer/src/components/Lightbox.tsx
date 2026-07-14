import React, { useEffect, useState } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { X, ChevronLeft, ChevronRight, Scissors, Loader2, Play, Pause } from 'lucide-react'

interface Photo {
  id: string
  path: string
  isVideo: number
}

interface LightboxProps {
  photos: Photo[]
  initialIndex: number
  onClose: () => void
}

export default function Lightbox({ photos, initialIndex, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [duration, setDuration] = useState(0)
  const [isClipping, setIsClipping] = useState(false)
  const [clipStart, setClipStart] = useState(0)
  const [clipEnd, setClipEnd] = useState(0)
  const [clipFormat, setClipFormat] = useState<'mp4'|'gif'>('mp4')
  const [isExporting, setIsExporting] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [showOverlay, setShowOverlay] = useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)

  const currentMedia = photos[currentIndex]

  // Update video playback rate when it changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, currentIndex])

  // Update video playback rate when it changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, currentIndex])

  useEffect(() => {
    setIsClipping(false)
    setDuration(0)
    setClipStart(0)
    setClipEnd(0)
  }, [currentIndex])

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const d = videoRef.current.duration || 0
      setDuration(d)
      setClipEnd(d)
    }
  }

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPlaying(true)
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }

  const handleExportClip = async () => {
    if (!currentMedia) return
    setIsExporting(true)
    try {
      const durationToExport = clipEnd - clipStart
      // @ts-ignore
      await window.api.exportVideoClip(currentMedia.id, clipStart, durationToExport, clipFormat)
    } catch (err) {
      console.error(err)
    } finally {
      setIsExporting(false)
      setIsClipping(false)
    }
  }

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && !isClipping) handleNext()
      if (e.key === 'ArrowLeft' && !isClipping) handlePrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, photos.length, isClipping])

  const handleNext = () => {
    if (currentIndex < photos.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const isVideo = currentMedia?.isVideo === 1
  const mediaSrc = currentMedia ? `obscura://local/${encodeURIComponent(currentMedia.path)}` : ''

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center select-none">
      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 p-4 flex justify-end z-10 bg-gradient-to-b from-black/60 to-transparent">
        <button 
          onClick={onClose}
          className="p-2 text-white hover:bg-white/20 rounded-full transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {/* Navigation Prev */}
      {currentIndex > 0 && (
        <button 
          onClick={handlePrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/20 rounded-full transition-colors z-10"
        >
          <ChevronLeft size={32} />
        </button>
      )}

      {/* Media Viewer */}
      <div className="w-full h-full flex items-center justify-center p-12">
        {isVideo ? (
          <div 
            className="relative max-w-full max-h-full flex flex-col items-center justify-center group"
            onMouseEnter={() => setShowOverlay(true)}
            onMouseLeave={() => setShowOverlay(false)}
          >
            <video 
              ref={videoRef}
              src={mediaSrc} 
              controls={!isClipping}
              autoPlay
              onClick={togglePlay}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={handleLoadedMetadata}
              className="max-w-full max-h-full rounded-lg shadow-2xl cursor-pointer"
            />
            
            {/* Play/Pause Overlay */}
            {!isClipping && (!isPlaying || showOverlay) && (
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300"
                style={{ opacity: !isPlaying ? 1 : (showOverlay ? 0.3 : 0) }}
              >
                <div className="bg-black/50 p-6 rounded-full backdrop-blur-sm">
                  {!isPlaying ? <Play size={48} className="text-white ml-2" /> : <Pause size={48} className="text-white" />}
                </div>
              </div>
            )}
            
            {/* Playback Speed Control - Hidden when clipping */}
            {!isClipping && (
              <div className="absolute top-4 right-4 flex flex-col items-end space-y-2">
                <div className="flex space-x-1 bg-black/60 rounded-lg p-1 backdrop-blur-md z-20">
                  {[0.5, 1, 1.5, 2].map(speed => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackRate(speed)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${playbackRate === speed ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => setIsClipping(true)}
                  className="flex items-center space-x-2 bg-black/60 text-white/80 hover:text-white hover:bg-black/80 px-3 py-2 rounded-lg backdrop-blur-md transition-colors text-sm z-20 shadow-lg border border-white/10"
                >
                  <Scissors size={16} />
                  <span>Klip / GIF Oluştur</span>
                </button>
              </div>
            )}

            {/* Clipping UI Overlay */}
            {isClipping && (
              <div className="absolute bottom-12 w-full max-w-md bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl z-30">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-medium flex items-center space-x-2">
                    <Scissors size={18} className="text-blue-400" />
                    <span>Dışa Aktar</span>
                  </h3>
                  <button onClick={() => setIsClipping(false)} className="text-white/50 hover:text-white transition-colors">
                    <X size={18} />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider mb-2 block">Başlangıç: {clipStart.toFixed(1)}s</label>
                    <input 
                      type="range" 
                      min={0} 
                      max={duration} 
                      step={0.1}
                      value={clipStart} 
                      onChange={e => {
                        const val = parseFloat(e.target.value)
                        setClipStart(val)
                        if (val > clipEnd) setClipEnd(val)
                        if (videoRef.current) videoRef.current.currentTime = val
                      }}
                      className="w-full accent-blue-500" 
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider mb-2 block">Bitiş: {clipEnd.toFixed(1)}s</label>
                    <input 
                      type="range" 
                      min={0} 
                      max={duration} 
                      step={0.1}
                      value={clipEnd} 
                      onChange={e => {
                        const val = parseFloat(e.target.value)
                        setClipEnd(val)
                        if (val < clipStart) setClipStart(val)
                        if (videoRef.current) videoRef.current.currentTime = val
                      }}
                      className="w-full accent-blue-500" 
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <select 
                      value={clipFormat} 
                      onChange={e => setClipFormat(e.target.value as any)}
                      className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-white/10 outline-none focus:border-blue-500"
                    >
                      <option value="mp4">MP4 Video</option>
                      <option value="gif">GIF Animasyon</option>
                    </select>

                    <button 
                      onClick={handleExportClip}
                      disabled={isExporting}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Dışa Aktarılıyor...</span>
                        </>
                      ) : (
                        <span>Dışa Aktar ({(clipEnd - clipStart).toFixed(1)}s)</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <TransformWrapper
            key={currentMedia.id}
            initialScale={1}
            minScale={1}
            maxScale={5}
            centerOnInit={true}
            limitToBounds={true}
            wheel={{ step: 0.03, smoothStep: 0.01 }}
            doubleClick={{ disabled: true }} // We'll handle custom double click
            panning={{ velocityDisabled: false }}
          >
            {({ zoomIn, zoomOut, resetTransform, setTransform, state }) => {
              // We can handle keyboard zoom here or listen to global keys
              useEffect(() => {
                const handleZoomKeys = (e: KeyboardEvent) => {
                  if (e.key === '+') zoomIn(0.5)
                  if (e.key === '-') zoomOut(0.5)
                  if (e.key === '0') resetTransform()
                }
                window.addEventListener('keydown', handleZoomKeys)
                return () => window.removeEventListener('keydown', handleZoomKeys)
              }, [zoomIn, zoomOut, resetTransform])

              return (
                <div className="relative w-full h-full flex items-center justify-center">
                  <TransformComponent wrapperClass="w-full h-full">
                    <img 
                      src={mediaSrc} 
                      alt="Enlarged" 
                      className="w-screen h-screen object-contain drop-shadow-2xl transition-transform duration-200"
                      draggable={false}
                      onDoubleClick={(e) => {
                        if (state.scale > 1.5) {
                          resetTransform()
                        } else {
                          // Zoom to cursor
                          const rect = e.currentTarget.getBoundingClientRect()
                          const x = e.clientX - rect.left
                          const y = e.clientY - rect.top
                          setTransform(-x * 1.5, -y * 1.5, 2.5, 300, 'easeOutCubic')
                        }
                      }}
                    />
                  </TransformComponent>
                  
                  {/* Zoom Indicator */}
                  {state.scale > 1 && (
                    <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur text-white text-xs font-medium px-3 py-1.5 rounded-full z-50">
                      {Math.round(state.scale * 100)}%
                    </div>
                  )}
                </div>
              )
            }}
          </TransformWrapper>
        )}
      </div>

      {/* Navigation Next */}
      {currentIndex < photos.length - 1 && (
        <button 
          onClick={handleNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/20 rounded-full transition-colors z-10"
        >
          <ChevronRight size={32} />
        </button>
      )}
      
      {/* Counter */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm tracking-widest">
        {currentIndex + 1} / {photos.length}
      </div>
    </div>
  )
}
