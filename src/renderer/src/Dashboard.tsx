import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Plus, Image as ImageIcon, Settings, FolderClosed, LogOut, Heart, X, Tag as TagIcon, Trash2, Download, Archive, RefreshCw, Play, Maximize2, Zap, Users, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import Lightbox from './components/Lightbox'
import Scanner from './components/Scanner'
import PeopleView from './components/PeopleView'

interface Photo {
  id: string
  path: string
  dateAdded: number
  isFavorite: number
  deletedAt?: number
  isVideo: number
  thumbPath: string
  caption?: string
  originalName?: string
  sizeBytes?: number
}

interface Album {
  id: string
  name: string
}

interface Tag {
  id: string
  name: string
}

export default function Dashboard() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('dateAdded')
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC')
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  
  const [smartAlbums, setSmartAlbums] = useState<any[]>([])
  const [selectedSmartAlbumId, setSelectedSmartAlbumId] = useState<string | null>(null)
  const [isCreatingSmartAlbum, setIsCreatingSmartAlbum] = useState(false)
  
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [captionText, setCaptionText] = useState('')
  const captionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Bulk Selection State
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [showBulkTagModal, setShowBulkTagModal] = useState(false)
  const [showBulkAlbumModal, setShowBulkAlbumModal] = useState(false)
  
  const [photoTags, setPhotoTags] = useState<Tag[]>([])
  const [photoAlbums, setPhotoAlbums] = useState<Album[]>([])
  const [newTag, setNewTag] = useState('')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [newSmartAlbumName, setNewSmartAlbumName] = useState('')
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false)
  
  const [showTrash, setShowTrash] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showSecurityLogs, setShowSecurityLogs] = useState(false)
  const [securityLogs, setSecurityLogs] = useState<any[]>([])
  const [isBackingUp, setIsBackingUp] = useState(false)
  
  // People State
  const [showPeople, setShowPeople] = useState(false)
  
  // Lightbox State
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const navigate = useNavigate()

  // Virtualization State
  const parentRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(4)

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  
  // Updater State
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'downloading' | 'downloaded'>('idle')
  const [updateProgress, setUpdateProgress] = useState<number>(0)
  const [appVersion, setAppVersion] = useState<string>('')
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)

  const RELEASE_NOTES: Record<string, string[]> = {
    '1.0.2': [
      'Yüz tanıma yapay zekasının doğruluğu artırıldı, hata payı sıfıra yaklaştırıldı.',
      'Kalitesiz ve çok küçük (40x40px altı) yüzlerin taranması engellendi.',
      'Profesyonel yüz yönetimi eklendi: Aynı kişiyi birleştirme (Merge) ve hatalı kişiyi silme yeteneği.',
      'Fotoğraf görüntüleyicisinden yanlış yüzleri kişiden ayırmak için "Bu Kişi Değil" butonu eklendi.',
      'Fotoğraf görüntüleyicisinde pürüzsüz mouse tekerleği ile zoom/pan ve çift tıkla yakınlaştırma desteği.'
    ],
    '1.0.1': [
      'Güvenlik günlüğü eklendi: Başarılı ve başarısız giriş denemeleri kaydediliyor.',
      'Brute-force koruması: Çok fazla hatalı şifre denemesinde uygulama 1 dakika kilitlenir.',
      'Yenilikler ekranı: Uygulama güncellendiğinde bu ekran otomatik açılır.'
    ]
  }

  useEffect(() => {
    window.api.getAppVersion().then(v => {
      setAppVersion(v)
      
      const lastVersion = localStorage.getItem('obscura_version')
      if (lastVersion && lastVersion !== v && RELEASE_NOTES[v]) {
        // App was updated, show release notes
        setShowReleaseNotes(true)
      }
      
      // Save current version
      localStorage.setItem('obscura_version', v)
    })
    
    window.api.onUpdateAvailable(() => {
      setUpdateStatus('downloading')
    })
    window.api.onDownloadProgress((progress) => {
      setUpdateProgress(progress.percent)
    })
    window.api.onUpdateDownloaded(() => {
      setUpdateStatus('downloaded')
    })
  }, [])
  
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const width = entry.contentRect.width
        if (width < 640) setColumns(2)
        else if (width < 768) setColumns(3)
        else if (width < 1024) setColumns(4)
        else if (width < 1280) setColumns(5)
        else setColumns(6)
      }
    })
    if (parentRef.current) observer.observe(parentRef.current)
    return () => observer.disconnect()
  }, [])

  const loadData = async () => {
    try {
      if (selectedPersonId) {
        const photosData = await window.api.getPersonPhotos(selectedPersonId)
        setPhotos(photosData)
      } else {
        const [photosData, albumsData, smartAlbumsData] = await Promise.all([
          window.api.getPhotos({ 
            query: searchQuery, 
            albumId: selectedAlbumId || undefined, 
            smartAlbumId: selectedSmartAlbumId || undefined, 
            trash: showTrash, 
            sortBy, 
            sortOrder 
          }),
          window.api.getAlbums(),
          window.api.getSmartAlbums()
        ])
        setPhotos(photosData)
        setAlbums(albumsData)
        setSmartAlbums(smartAlbumsData)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [searchQuery, selectedAlbumId, selectedSmartAlbumId, selectedPersonId, showTrash, sortBy, sortOrder])

  const loadPhotoDetails = async (photoId: string) => {
    const [tags, photoAlbs] = await Promise.all([
      window.api.getPhotoTags(photoId),
      window.api.getPhotoAlbums(photoId)
    ])
    setPhotoTags(tags)
    setPhotoAlbums(photoAlbs)
  }

  useEffect(() => {
    if (selectedPhoto) {
      loadPhotoDetails(selectedPhoto.id)
      setCaptionText(selectedPhoto.caption || '')
    } else {
      setCaptionText('')
    }
  }, [selectedPhoto])

  const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCaption = e.target.value
    setCaptionText(newCaption)
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current)
    
    captionTimeoutRef.current = setTimeout(async () => {
      if (selectedPhoto) {
        await window.api.updateCaption(selectedPhoto.id, newCaption)
        setPhotos(photos => photos.map(p => p.id === selectedPhoto.id ? { ...p, caption: newCaption } : p))
      }
    }, 500)
  }

  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid')

  type VirtualItem = 
    | { type: 'header', title: string }
    | { type: 'row', photos: Photo[], absoluteStartIndex: number }

  const virtualItems = useMemo(() => {
    if (viewMode === 'grid') {
      const items: VirtualItem[] = []
      for (let i = 0; i < photos.length; i += columns) {
        items.push({ type: 'row', photos: photos.slice(i, i + columns), absoluteStartIndex: i })
      }
      return items
    } else {
      const items: VirtualItem[] = []
      let currentHeader = ''
      let currentGroupPhotos: Photo[] = []
      let absoluteStartIndex = 0
      
      const flushGroup = () => {
        if (currentGroupPhotos.length > 0) {
          items.push({ type: 'header', title: currentHeader })
          for (let i = 0; i < currentGroupPhotos.length; i += columns) {
            items.push({ 
              type: 'row', 
              photos: currentGroupPhotos.slice(i, i + columns), 
              absoluteStartIndex: absoluteStartIndex + i 
            })
          }
          absoluteStartIndex += currentGroupPhotos.length
          currentGroupPhotos = []
        }
      }

      for (const p of photos) {
        const date = new Date(p.dateAdded)
        const header = date.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
        if (header !== currentHeader) {
          flushGroup()
          currentHeader = header
        }
        currentGroupPhotos.push(p)
      }
      flushGroup()
      return items
    }
  }, [photos, columns, viewMode])

  const rowVirtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (virtualItems[index].type === 'header') return 60
      return parentRef.current ? parentRef.current.clientWidth / columns : 200
    },
    overscan: 5
  })

  const handleImport = async () => {
    try {
      const res = await window.api.importPhotos()
      if (res.imported > 0) {
        loadData()
      }
      if (res.duplicates > 0) {
        alert(`${res.duplicates} adet medya zaten kasanızda bulunduğu için atlandı.`)
      }
    } catch (error: any) {
      console.error('Failed to import photos:', error)
      alert('İçe aktarılırken bir hata oluştu: ' + error.message)
    }
  }

  const handleLock = async () => {
    await window.api.lock()
    navigate('/auth', { replace: true })
  }

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAlbumName.trim()) return
    try {
      await window.api.createAlbum(newAlbumName.trim())
      setNewAlbumName('')
      setIsCreatingAlbum(false)
      loadData()
    } catch (error: any) {
      console.error('Failed to create album:', error)
      alert('Albüm oluşturulurken bir hata oluştu: ' + error.message)
    }
  }

  const handleDeleteAlbum = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm('Bu albümü silmek istediğinize emin misiniz? (Medya silinmez)')) {
      await window.api.deleteAlbum(id)
      if (selectedAlbumId === id) setSelectedAlbumId(null)
      loadData()
    }
  }

  const handleCreateSmartAlbum = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSmartAlbumName.trim()) return
    try {
      // Create a basic keyword rule matching the smart album name
      const rules = [{ type: 'keyword', value: newSmartAlbumName.trim() }]
      await window.api.createSmartAlbum(newSmartAlbumName.trim(), rules)
      setNewSmartAlbumName('')
      setIsCreatingSmartAlbum(false)
      loadData()
    } catch (error: any) {
      console.error('Failed to create smart album:', error)
      alert('Akıllı Albüm oluşturulurken bir hata oluştu: ' + error.message)
    }
  }

  const handleDeleteSmartAlbum = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm('Bu akıllı albümü silmek istediğinize emin misiniz? (Medya silinmez)')) {
      await window.api.deleteSmartAlbum(id)
      if (selectedSmartAlbumId === id) setSelectedSmartAlbumId(null)
      loadData()
    }
  }

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPhoto || !newTag.trim()) return
    await window.api.addTag(selectedPhoto.id, newTag)
    setNewTag('')
    loadPhotoDetails(selectedPhoto.id)
  }

  const handleRemoveTag = async (tagId: string) => {
    if (!selectedPhoto) return
    await window.api.removeTag(selectedPhoto.id, tagId)
    loadPhotoDetails(selectedPhoto.id)
  }

  const handleToggleFavorite = async (e: React.MouseEvent, photo: Photo) => {
    e.stopPropagation()
    const newFavStatus = photo.isFavorite ? 0 : 1
    await window.api.toggleFavorite(photo.id, !!newFavStatus)
    setPhotos(photos.map(p => p.id === photo.id ? { ...p, isFavorite: newFavStatus } : p))
    if (selectedPhoto?.id === photo.id) {
      setSelectedPhoto({ ...selectedPhoto, isFavorite: newFavStatus })
    }
  }

  const handleAddToAlbum = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!selectedPhoto || !e.target.value) return
    await window.api.addPhotoToAlbum(selectedPhoto.id, e.target.value)
    e.target.value = ''
    loadPhotoDetails(selectedPhoto.id)
  }

  const handleRemoveFromAlbum = async (albumId: string) => {
    if (!selectedPhoto) return
    await window.api.removePhotoFromAlbum(selectedPhoto.id, albumId)
    loadPhotoDetails(selectedPhoto.id)
  }

  const handleMoveToTrash = async () => {
    if (!selectedPhoto) return
    if (confirm('Bu medyayı çöp kutusuna taşımak istediğinize emin misiniz?')) {
      await window.api.moveToTrash(selectedPhoto.id)
      setSelectedPhoto(null)
      loadData()
    }
  }

  const handlePhotoClick = (e: React.MouseEvent, photo: Photo, index: number) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedPhotoIds(prev => 
        prev.includes(photo.id) ? prev.filter(id => id !== photo.id) : [...prev, photo.id]
      )
      setLastSelectedIndex(index)
      setSelectedPhoto(photo)
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      const rangeIds = photos.slice(start, end + 1).map(p => p.id)
      
      const newSelection = new Set([...selectedPhotoIds, ...rangeIds])
      setSelectedPhotoIds(Array.from(newSelection))
    } else {
      if (selectedPhotoIds.length > 0) setSelectedPhotoIds([])
      setSelectedPhoto(photo)
      setLastSelectedIndex(index)
    }
  }

  const handleBulkMoveToTrash = async () => {
    if (selectedPhotoIds.length === 0) return
    if (confirm(`${selectedPhotoIds.length} medyayı çöp kutusuna taşımak istediğinize emin misiniz?`)) {
      await window.api.bulkMoveToTrash(selectedPhotoIds)
      setSelectedPhotoIds([])
      if (selectedPhoto && selectedPhotoIds.includes(selectedPhoto.id)) setSelectedPhoto(null)
      loadData()
    }
  }
  
  const handleBulkExport = async () => {
    if (selectedPhotoIds.length === 0) return
    const exported = await window.api.exportPhotos(selectedPhotoIds)
    if (exported !== false) {
      alert(`${exported} dosya başarıyla dışa aktarıldı.`)
      setSelectedPhotoIds([])
    }
  }

  const handleBulkAddTag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTag.trim() || selectedPhotoIds.length === 0) return
    await window.api.bulkAddTag(selectedPhotoIds, newTag)
    setNewTag('')
    setShowBulkTagModal(false)
    setSelectedPhotoIds([])
    if (selectedPhoto) loadPhotoDetails(selectedPhoto.id)
  }

  const handleBulkAddToAlbum = async (albumId: string) => {
    if (!albumId || selectedPhotoIds.length === 0) return
    await window.api.bulkAddToAlbum(selectedPhotoIds, albumId)
    setShowBulkAlbumModal(false)
    setSelectedPhotoIds([])
    if (selectedPhoto) loadPhotoDetails(selectedPhoto.id)
  }

  const handleRestore = async () => {
    if (!selectedPhoto) return
    await window.api.restoreFromTrash(selectedPhoto.id)
    setSelectedPhoto(null)
    loadData()
  }

  const handleEmptyTrash = async () => {
    if (confirm('Çöp kutusundaki tüm medyalar kalıcı olarak silinecek. Emin misiniz?')) {
      await window.api.emptyTrash()
      setSelectedPhoto(null)
      loadData()
    }
  }

  const handleExportSingle = async () => {
    if (!selectedPhoto) return
    const exported = await window.api.exportPhotos([selectedPhoto.id])
    if (exported !== false) {
      alert(`Medya başarıyla dışa aktarıldı!`)
    }
  }

  const handleExportAlbum = async () => {
    if (!selectedAlbumId) return
    const photosInAlbum = photos.map(p => p.id)
    if (photosInAlbum.length === 0) return alert('Bu albümde medya yok.')
    const exported = await window.api.exportPhotos(photosInAlbum)
    if (exported !== false) {
      alert(`${exported} medya başarıyla dışa aktarıldı!`)
    }
  }

  const handleCreateBackup = async () => {
    setIsBackingUp(true)
    try {
      const success = await window.api.createBackup()
      if (success) {
        alert('Yedekleme başarıyla tamamlandı!')
      }
    } catch (e: any) {
      alert('Yedekleme sırasında bir hata oluştu: ' + e.message)
    } finally {
      setIsBackingUp(false)
      setShowSettings(false)
    }
  }

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 overflow-hidden font-sans">
      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox 
          photos={photos} 
          initialIndex={lightboxIndex} 
          onClose={() => setLightboxIndex(null)} 
          selectedPersonId={selectedPersonId}
        />
      )}

      {/* Left Sidebar */}
      <aside className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-6">
          <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Obscura</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 space-y-6">
          <nav className="space-y-1">
            <button 
              onClick={() => { setShowTrash(false); setSelectedAlbumId(null); setSelectedSmartAlbumId(null); setSelectedPersonId(null); setShowPeople(false); setSelectedPhoto(null); setShowScanner(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${!selectedAlbumId && !selectedSmartAlbumId && !selectedPersonId && !showTrash && !showPeople ? 'bg-gray-900 text-blue-400' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
            >
              <ImageIcon size={20} />
              Tüm Medyalar
            </button>
            <button 
              onClick={() => { setShowTrash(true); setSelectedAlbumId(null); setSelectedSmartAlbumId(null); setSelectedPersonId(null); setShowPeople(false); setSelectedPhoto(null); setShowScanner(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${showTrash ? 'bg-red-900/20 text-red-400' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
            >
              <Trash2 size={20} />
              Çöp Kutusu
            </button>
            <button 
              onClick={() => { setShowTrash(false); setSelectedAlbumId(null); setSelectedSmartAlbumId(null); setSelectedPersonId(null); setShowPeople(true); setSelectedPhoto(null); setShowScanner(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${showPeople && !selectedPersonId ? 'bg-blue-900/20 text-blue-400' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
            >
              <Users size={20} />
              Kişiler
            </button>
          </nav>

          {!showTrash && !showPeople && (
            <div>
              <div className="flex items-center justify-between px-3 mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Albümler</h3>
                <button 
                  onClick={() => setIsCreatingAlbum(!isCreatingAlbum)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              
              {isCreatingAlbum && (
                <form onSubmit={handleCreateAlbum} className="px-3 mb-3">
                  <input 
                    type="text" 
                    value={newAlbumName}
                    onChange={e => setNewAlbumName(e.target.value)}
                    placeholder="Albüm adı..."
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                    autoFocus
                    onBlur={() => !newAlbumName && setIsCreatingAlbum(false)}
                  />
                </form>
              )}

              <nav className="space-y-1">
                {albums.map(album => (
                  <div key={album.id} className={`group flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${selectedAlbumId === album.id && !showTrash ? 'bg-gray-900 text-blue-400' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}>
                    <button 
                      onClick={() => { setShowTrash(false); setSelectedAlbumId(album.id); setSelectedPhoto(null); setShowScanner(false); }}
                      className="flex items-center gap-3 flex-1 text-left truncate"
                    >
                      <FolderClosed size={18} />
                      <span className="truncate">{album.name}</span>
                    </button>
                    <button 
                      onClick={(e) => handleDeleteAlbum(e, album.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                      title="Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </nav>
            </div>
          )}

          {!showTrash && (
            <div className="mt-6">
              <div className="flex items-center justify-between px-3 mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Akıllı Albümler</h3>
                <button 
                  onClick={() => setIsCreatingSmartAlbum(!isCreatingSmartAlbum)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Yeni Akıllı Albüm"
                >
                  <Plus size={16} />
                </button>
              </div>
              
              {isCreatingSmartAlbum && (
                <form onSubmit={handleCreateSmartAlbum} className="px-3 mb-3">
                  <input 
                    type="text" 
                    value={newSmartAlbumName}
                    onChange={e => setNewSmartAlbumName(e.target.value)}
                    placeholder="Anahtar kelime (Kelime İçerir)..."
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                    autoFocus
                    onBlur={() => !newSmartAlbumName && setIsCreatingSmartAlbum(false)}
                  />
                </form>
              )}

              <nav className="space-y-1">
                {smartAlbums.map(album => (
                  <div key={album.id} className={`group flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${selectedSmartAlbumId === album.id && !showTrash ? 'bg-gray-900 text-blue-400' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}>
                    <button 
                      onClick={() => { setShowTrash(false); setSelectedAlbumId(null); setSelectedSmartAlbumId(album.id); setSelectedPhoto(null); setShowScanner(false); }}
                      className="flex items-center gap-3 flex-1 text-left truncate"
                    >
                      <Zap size={18} className="text-amber-400" />
                      <span className="truncate">{album.name}</span>
                    </button>
                    <button 
                      onClick={(e) => handleDeleteSmartAlbum(e, album.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                      title="Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </nav>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-800 space-y-2">
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:bg-gray-900 hover:text-gray-200 rounded-lg font-medium transition-colors"
          >
            <Settings size={18} />
            Ayarlar
          </button>
          <button 
            onClick={handleLock}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-900 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Kilitle
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-gray-900 relative">
        {/* Updater Banner */}
        {updateStatus !== 'idle' && (
          <div className={`w-full text-sm font-medium px-4 py-2 flex items-center justify-center gap-3 transition-colors ${updateStatus === 'downloaded' ? 'bg-green-600 text-white' : 'bg-blue-600/20 text-blue-400'}`}>
            {updateStatus === 'downloading' && (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Yeni sürüm indiriliyor... {Math.round(updateProgress)}%</span>
              </>
            )}
            {updateStatus === 'downloaded' && (
              <>
                <span>🎉 Yeni sürüm hazır!</span>
                <button 
                  onClick={() => window.api.installUpdate()}
                  className="bg-white text-green-700 hover:bg-gray-100 px-3 py-1 rounded-md text-xs font-bold transition-colors shadow-sm"
                >
                  Şimdi Güncelle
                </button>
              </>
            )}
          </div>
        )}
        
        {/* Topbar */}
        <header className="h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-10 shrink-0">
          <div className="w-96 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Etikete göre ara..." 
              className="w-full bg-gray-950 border border-gray-800 rounded-full pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            {!showTrash && (
              <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 mr-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'grid' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Izgara
                </button>
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Zaman Çizelgesi
                </button>
              </div>
            )}
            {!showTrash && (
              <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-2 py-1">
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
                >
                  <option value="dateAdded">Tarihe Göre</option>
                  <option value="originalName">İsme Göre</option>
                  <option value="sizeBytes">Boyuta Göre</option>
                  <option value="isFavorite">Favoriler Önde</option>
                </select>
                <button 
                  onClick={() => setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')}
                  className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
                  title={sortOrder === 'ASC' ? 'Artan' : 'Azalan'}
                >
                  {sortOrder === 'ASC' ? '↑' : '↓'}
                </button>
              </div>
            )}
            {selectedAlbumId && !showTrash && (
              <button 
                onClick={handleExportAlbum}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
              >
                <Download size={18} />
                Albümü Dışa Aktar
              </button>
            )}
            {showTrash ? (
              <button 
                onClick={handleEmptyTrash}
                className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-500 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
              >
                <Trash2 size={18} />
                Çöp Kutusunu Boşalt
              </button>
            ) : (
              <button 
                onClick={handleImport}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-900/20"
              >
                <Plus size={18} />
                İçe Aktar (Foto & Video)
              </button>
            )}
          </div>
        </header>

        {showScanner ? (
          <div className="flex-1 overflow-y-auto p-8 flex items-center justify-center">
            <Scanner />
          </div>
        ) : showPeople && !selectedPersonId ? (
          <div className="flex-1 overflow-y-auto relative">
            <PeopleView onSelectPerson={(id, name) => {
              setSelectedPersonId(id)
            }} />
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden p-8 relative">
            {selectedPersonId && (
              <div className="mb-6 flex items-center gap-3">
                <button 
                  onClick={() => setSelectedPersonId(null)}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                  <Users size={18} />
                </button>
                <h2 className="text-xl font-medium text-white">Bu Kişiyi İçeren Fotoğraflar</h2>
              </div>
            )}
            {loading ? (
            <div className="h-full flex items-center justify-center text-gray-500">Yükleniyor...</div>
          ) : photos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              {showTrash ? (
                <>
                  <Trash2 size={64} className="mb-4 opacity-20" />
                  <h3 className="text-xl font-medium text-gray-300 mb-2">Çöp Kutusu Boş</h3>
                </>
              ) : (
                <>
                  <ImageIcon size={64} className="mb-4 opacity-20" />
                  <h3 className="text-xl font-medium text-gray-300 mb-2">Henüz Medya Yok</h3>
                  <p className="text-sm">Gizli kasanıza fotoğraf veya video eklemek için İçe Aktar butonunu kullanın.</p>
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = virtualItems[virtualRow.index]

                if (item.type === 'header') {
                  return (
                    <div
                      key={`header-${virtualRow.index}`}
                      className="absolute top-0 left-0 w-full flex items-end pb-2 px-2"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <h2 className="text-xl font-bold text-white tracking-wide">{item.title}</h2>
                    </div>
                  )
                }

                return (
                  <div
                    key={`row-${virtualRow.index}`}
                    className="absolute top-0 left-0 w-full flex gap-4"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: '16px'
                    }}
                  >
                    {item.photos.map((photo, colIndex) => {
                      const absoluteIndex = item.absoluteStartIndex + colIndex
                      const isSelected = selectedPhoto?.id === photo.id || selectedPhotoIds.includes(photo.id)
                      
                      return (
                        <div 
                          key={photo.id} 
                          onClick={(e) => handlePhotoClick(e, photo, absoluteIndex)}
                          onDoubleClick={() => setLightboxIndex(absoluteIndex)}
                          style={{ width: `calc(${100 / columns}% - ${16 * (columns - 1) / columns}px)` }}
                          className={`group relative rounded-xl overflow-hidden bg-gray-950 border-2 cursor-pointer transition-all duration-200 flex-shrink-0 ${isSelected ? 'border-blue-500 shadow-lg shadow-blue-900/20' : 'border-gray-800 hover:border-gray-600'}`}
                        >
                          <img 
                            src={`obscura://local/${encodeURIComponent(photo.thumbPath)}`} 
                            alt="Encrypted Thumbnail" 
                            className={`w-full h-full object-cover ${showTrash ? 'opacity-50 grayscale' : ''}`}
                            loading="lazy"
                          />
                          
                          {/* Video Indicator */}
                          {photo.isVideo === 1 && (
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md rounded-md p-1.5 text-white/80">
                              <Play size={16} fill="currentColor" />
                            </div>
                          )}
                          
                          {/* Hover Overlay */}
                          {!showTrash && (
                            <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-200 ${photo.isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              <div className="absolute bottom-2 left-2">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(absoluteIndex); }}
                                  className="p-1.5 rounded-full backdrop-blur-md bg-black/50 text-white hover:bg-white hover:text-black transition-colors"
                                  title="Tam Ekran"
                                >
                                  <Maximize2 size={16} />
                                </button>
                              </div>
                              <div className="absolute bottom-2 right-2">
                                <button 
                                  onClick={(e) => handleToggleFavorite(e, photo)}
                                  className={`p-1.5 rounded-full backdrop-blur-md transition-colors ${photo.isFavorite ? 'bg-red-500/20 text-red-500 hover:bg-red-500/40' : 'bg-black/50 text-white hover:bg-white hover:text-black'}`}
                                >
                                  <Heart size={16} fill={photo.isFavorite ? "currentColor" : "none"} />
                                </button>
                              </div>
                              {/* Selection Indicator Checkbox */}
                              <div className="absolute top-2 left-2">
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${selectedPhotoIds.includes(photo.id) ? 'bg-blue-500 border-blue-500' : 'border-white/50 bg-black/30'}`}>
                                  {selectedPhotoIds.includes(photo.id) && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}
        
        {/* Floating Bulk Action Bar */}
        {selectedPhotoIds.length > 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-800 rounded-full shadow-2xl px-6 py-3 flex items-center gap-6 z-40 animate-in slide-in-from-bottom-10">
            <div className="text-white font-medium whitespace-nowrap">
              {selectedPhotoIds.length} Seçili
            </div>
            <div className="w-px h-6 bg-gray-800"></div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowBulkTagModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 text-gray-300 hover:text-white rounded-md transition-colors"
              >
                <TagIcon size={16} /> Etiketle
              </button>
              <button 
                onClick={() => setShowBulkAlbumModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 text-gray-300 hover:text-white rounded-md transition-colors"
              >
                <FolderClosed size={16} /> Albüme Ekle
              </button>
              <button 
                onClick={handleBulkExport}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 text-gray-300 hover:text-white rounded-md transition-colors"
              >
                <Download size={16} /> Dışa Aktar
              </button>
              <button 
                onClick={handleBulkMoveToTrash}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/20 text-red-500 rounded-md transition-colors"
              >
                <Trash2 size={16} /> Sil
              </button>
            </div>
            <div className="w-px h-6 bg-gray-800"></div>
            <button 
              onClick={() => setSelectedPhotoIds([])}
              className="p-1 hover:bg-gray-800 text-gray-400 hover:text-white rounded-full transition-colors"
              title="Seçimi İptal Et"
            >
              <X size={20} />
            </button>
          </div>
        )}
      </main>

      {/* Right Sidebar (Photo Details) */}
      {selectedPhoto && (
        <aside className="w-80 bg-gray-950 border-l border-gray-800 flex flex-col shrink-0 transform transition-transform duration-300 ease-in-out">
          <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
            <h3 className="font-medium text-gray-200">Detaylar</h3>
            <button 
              onClick={() => setSelectedPhoto(null)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="aspect-video w-full bg-black relative">
              {selectedPhoto.isVideo === 1 ? (
                <video 
                  src={`obscura://local/${encodeURIComponent(selectedPhoto.path)}`} 
                  controls
                  className={`w-full h-full object-contain ${showTrash ? 'opacity-50 grayscale' : ''}`}
                />
              ) : (
                <img 
                  src={`obscura://local/${encodeURIComponent(selectedPhoto.path)}`} 
                  alt="Preview" 
                  className={`w-full h-full object-contain ${showTrash ? 'opacity-50 grayscale' : ''}`}
                />
              )}
            </div>

            <div className="p-6 space-y-6">
              {/* Actions */}
              <div className="flex flex-col gap-3 pb-6 border-b border-gray-800">
                {showTrash ? (
                  <button 
                    onClick={handleRestore}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    <RefreshCw size={18} />
                    Geri Yükle
                  </button>
                ) : (
                  <>
                    <div className="flex justify-between items-center gap-2">
                      <button 
                        onClick={(e) => handleToggleFavorite(e, selectedPhoto)}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${selectedPhoto.isFavorite ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                      >
                        <Heart size={16} fill={selectedPhoto.isFavorite ? "currentColor" : "none"} />
                        {selectedPhoto.isFavorite ? 'Favori' : 'Favori'}
                      </button>
                      <button 
                        onClick={handleExportSingle}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg font-medium transition-colors"
                      >
                        <Download size={16} />
                        Dışa Aktar
                      </button>
                    </div>
                    <button 
                      onClick={handleMoveToTrash}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg font-medium transition-colors"
                    >
                      <Trash2 size={16} />
                      Çöp Kutusuna Taşı
                    </button>
                  </>
                )}
              </div>

              {!showTrash && (
                <>
                  {/* Tags Section */}
                  <section>
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      <TagIcon size={14} />
                      Etiketler
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {photoTags.map(tag => (
                        <span key={tag.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-900/30 text-blue-400 text-sm border border-blue-900/50">
                          {tag.name}
                          <button 
                            onClick={() => handleRemoveTag(tag.id)}
                            className="hover:text-blue-300 hover:bg-blue-900/50 rounded-full p-0.5"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>

                    <form onSubmit={handleAddTag}>
                      <input 
                        type="text" 
                        value={newTag}
                        onChange={e => setNewTag(e.target.value)}
                        placeholder="Etiket ekle..."
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                    </form>
                  </section>

                  {/* Caption Section */}
                  <section>
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Açıklama
                    </div>
                    <textarea 
                      value={captionText}
                      onChange={handleCaptionChange}
                      placeholder="Fotoğraf hakkında bir şeyler yazın..."
                      rows={3}
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </section>

                  {/* Albums Section */}
                  <section>
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      <FolderClosed size={14} />
                      Bulunduğu Albümler
                    </div>

                    <div className="space-y-2 mb-3">
                      {photoAlbums.map(album => (
                        <div key={album.id} className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2 border border-gray-800">
                          <span className="text-sm text-gray-300 truncate">{album.name}</span>
                          <button 
                            onClick={() => handleRemoveFromAlbum(album.id)}
                            className="text-gray-500 hover:text-red-400 p-1 rounded-md hover:bg-gray-800 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <select 
                      onChange={handleAddToAlbum}
                      value=""
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="" disabled>Albüm Seç ve Ekle...</option>
                      {albums.filter(a => !photoAlbums.find(pa => pa.id === a.id)).map(album => (
                        <option key={album.id} value={album.id}>{album.name}</option>
                      ))}
                    </select>
                  </section>
                </>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-800">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Settings size={20} className="text-blue-400" />
                Ayarlar
              </h2>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          <div className="p-6 space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Veri Güvenliği & Akıllı Özellikler</h3>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-6">
                  
                  {/* Backup */}
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-blue-900/30 text-blue-400 rounded-lg shrink-0">
                      <Archive size={20} />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-200 mb-1">Yedek Oluştur</h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Kasanızdaki tüm fotoğrafları ve veritabanını dışa aktarılabilir bir ZIP dosyası olarak yedekleyin.
                      </p>
                      <button 
                        onClick={handleCreateBackup}
                        disabled={isBackingUp}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                      >
                        {isBackingUp ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            Yedekleniyor...
                          </>
                        ) : (
                          <>
                            <Download size={16} />
                            Şimdi Yedekle
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Face Scan */}
                  <div className="flex items-start gap-4 border-t border-gray-800 pt-6">
                    <div className="p-2 bg-purple-900/30 text-purple-400 rounded-lg shrink-0">
                      <Users size={20} />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-200 mb-1">Akıllı Yüz Taraması</h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Tüm kütüphanenizi çevrimdışı ve güvenli bir şekilde tarayarak fotoğraflardaki kişileri otomatik gruplandırır.
                      </p>
                      <button 
                        onClick={() => { setShowSettings(false); setShowScanner(true); setShowPeople(false); setSelectedAlbumId(null); setSelectedSmartAlbumId(null); setSelectedPhoto(null); }}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                      >
                        <Search size={16} />
                        Kütüphaneyi Tara
                      </button>
                    </div>
                  </div>

                  {/* Security Log */}
                  <div className="flex items-start gap-4 border-t border-gray-800 pt-6">
                    <div className="p-2 bg-red-900/30 text-red-400 rounded-lg shrink-0">
                      <Shield size={20} />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-200 mb-1">Güvenlik Günlüğü</h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Başarılı ve başarısız tüm giriş denemelerini ile kilitlenme kayıtlarını görüntüleyin.
                      </p>
                      <button 
                        onClick={async () => {
                          const logs = await window.api.getSecurityLogs()
                          setSecurityLogs(logs.reverse()) // newest first
                          setShowSecurityLogs(true)
                          setShowSettings(false)
                        }}
                        className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                      >
                        Kayıtları Gör
                      </button>
                    </div>
                  </div>
                  {/* Auto Updater */}
                  <div className="flex items-start gap-4 border-t border-gray-800 pt-6">
                    <div className="p-2 bg-green-900/30 text-green-400 rounded-lg shrink-0">
                      <Zap size={20} />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-200 mb-1">Güncellemeler</h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Mevcut Sürüm: v{appVersion || '...'}<br/>
                        Uygulama arka planda otomatik olarak yeni sürümleri denetler ve indirir.
                      </p>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            setUpdateStatus('idle')
                            window.api.checkForUpdates()
                          }}
                          disabled={updateStatus === 'downloading'}
                          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={16} className={updateStatus === 'downloading' ? 'animate-spin' : ''} />
                          Güncellemeleri Kontrol Et
                        </button>
                        
                        {RELEASE_NOTES[appVersion] && (
                          <button 
                            onClick={() => {
                              setShowSettings(false)
                              setShowReleaseNotes(true)
                            }}
                            className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                          >
                            <Zap size={16} />
                            Güncelleme Notları
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Release Notes Modal */}
      {showReleaseNotes && RELEASE_NOTES[appVersion] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="p-8 pb-6 flex flex-col items-center text-center border-b border-gray-800 shrink-0">
              <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
                <Zap size={32} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Yenilikler</h2>
              <p className="text-sm text-gray-400">Sürüm {appVersion}</p>
            </div>
            <div className="p-6 overflow-y-auto bg-gray-900/50">
              <ul className="space-y-4">
                {RELEASE_NOTES[appVersion].map((note, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></div>
                    <p className="text-gray-300 text-sm leading-relaxed">{note}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-6 border-t border-gray-800 bg-gray-950 shrink-0">
              <button 
                onClick={() => setShowReleaseNotes(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-colors"
              >
                Harika, Devam Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Logs Modal */}
      {showSecurityLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-800 shrink-0">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Shield size={20} className="text-red-400" />
                Güvenlik Günlüğü
              </h2>
              <button 
                onClick={() => setShowSecurityLogs(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {securityLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-8">Henüz kayıt yok.</div>
              ) : (
                securityLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-3 border-b border-gray-800/50 pb-4 last:border-0 last:pb-0">
                    <div className="mt-1">
                      {log.type === 'LOGIN_SUCCESS' && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
                      {log.type === 'LOGIN_FAILED' && <div className="w-2 h-2 rounded-full bg-yellow-500"></div>}
                      {log.type === 'LOCKOUT' && <div className="w-2 h-2 rounded-full bg-red-500"></div>}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-medium text-sm ${
                          log.type === 'LOGIN_SUCCESS' ? 'text-green-400' :
                          log.type === 'LOGIN_FAILED' ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {log.type === 'LOGIN_SUCCESS' ? 'Başarılı Giriş' :
                           log.type === 'LOGIN_FAILED' ? 'Başarısız Deneme' : 'Kilitlenme'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {log.details && <p className="text-sm text-gray-400">{log.details}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Tag Modal */}
      {showBulkTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Toplu Etiket Ekle</h2>
            <form onSubmit={handleBulkAddTag}>
              <input 
                type="text" 
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                placeholder="Etiket adı..."
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-gray-200 focus:outline-none focus:border-blue-500 mb-6"
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowBulkTagModal(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  İptal
                </button>
                <button 
                  type="submit"
                  disabled={!newTag.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Uygula
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Album Modal */}
      {showBulkAlbumModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Toplu Albüme Ekle</h2>
            <select 
              onChange={e => handleBulkAddToAlbum(e.target.value)}
              value=""
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-gray-200 focus:outline-none focus:border-blue-500 mb-6"
            >
              <option value="" disabled>Albüm Seçin...</option>
              {albums.map(album => (
                <option key={album.id} value={album.id}>{album.name}</option>
              ))}
            </select>
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={() => setShowBulkAlbumModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
