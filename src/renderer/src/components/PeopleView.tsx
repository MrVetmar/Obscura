import React, { useEffect, useState } from 'react'
import { Users, Edit2, Check, X } from 'lucide-react'

export default function PeopleView({ onSelectPerson }: { onSelectPerson: (id: string, name: string) => void }) {
  const [people, setPeople] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    loadPeople()
  }, [])

  const loadPeople = async () => {
    try {
      const data = await window.api.getPeople()
      setPeople(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveName = async (personId: string) => {
    if (!editName.trim()) return
    try {
      await window.api.updatePersonName(personId, editName.trim())
      setPeople(people.map(p => p.id === personId ? { ...p, name: editName.trim() } : p))
      setEditingId(null)
    } catch (e) {
      console.error(e)
    }
  }

  const toggleSelection = (personId: string) => {
    if (selectedIds.includes(personId)) {
      setSelectedIds(selectedIds.filter(id => id !== personId))
    } else {
      setSelectedIds([...selectedIds, personId])
    }
  }

  const handleMerge = async () => {
    if (selectedIds.length < 2) return
    const targetPersonId = selectedIds[0]
    const sourceIds = selectedIds.slice(1)
    if (window.confirm('Seçili kişileri tek bir profilde birleştirmek istiyor musunuz?')) {
      await window.api.mergePeople(targetPersonId, sourceIds)
      setSelectedIds([])
      loadPeople()
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Bu kişiyi silmek istiyor musunuz? (Sadece kişi profili silinir, fotoğraflar silinmez)')) {
      await window.api.deletePerson(id)
      setSelectedIds(selectedIds.filter(sid => sid !== id))
      loadPeople()
    }
  }

  if (loading) return <div className="p-8 text-white/50">Yükleniyor...</div>

  if (people.length === 0) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center h-full">
        <Users size={64} className="text-white/20 mb-4" />
        <h2 className="text-2xl font-medium text-white mb-2">Henüz Kişi Bulunamadı</h2>
        <p className="text-white/50 max-w-sm">
          Yüz taraması yapıldığında tespit edilen kişiler burada gruplanarak gösterilir.
        </p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-medium text-white flex items-center space-x-3">
          <Users className="text-blue-400" />
          <span>Kişiler ({people.length})</span>
        </h2>
        {selectedIds.length > 0 && (
          <div className="flex items-center space-x-4 bg-zinc-800 px-4 py-2 rounded-lg">
            <span className="text-sm text-white/70">{selectedIds.length} kişi seçildi</span>
            <button
              onClick={handleMerge}
              disabled={selectedIds.length < 2}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              Birleştir
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-sm text-white/50 hover:text-white"
            >
              İptal
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {people.map(person => {
          const isSelected = selectedIds.includes(person.id)
          const imgUrl = `obscura://local/${encodeURIComponent(person.photoPath)}`

          return (
            <div key={person.id} className="flex flex-col items-center space-y-3 relative group">
              <div 
                className={`w-32 h-32 rounded-full overflow-hidden border-4 transition-colors cursor-pointer shadow-lg bg-zinc-800 ${isSelected ? 'border-blue-500' : 'border-white/10 group-hover:border-blue-500/50'}`}
                onClick={() => onSelectPerson(person.id, person.name)}
              >
                <img 
                  src={imgUrl} 
                  alt={person.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Checkbox for selection */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSelection(person.id)
                }}
                className={`absolute top-0 right-2 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-white/30 bg-black/50 text-transparent hover:border-white/60'}`}
              >
                <Check size={14} />
              </button>

              {/* Delete Person Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(person.id)
                }}
                className="absolute top-0 left-2 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Kişiyi Sil"
              >
                <X size={14} />
              </button>

              {editingId === person.id ? (
                <div className="flex items-center space-x-1 w-full px-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveName(person.id)}
                    className="w-full bg-zinc-800 text-white text-sm rounded px-2 py-1 outline-none border border-blue-500 text-center"
                  />
                  <button onClick={() => handleSaveName(person.id)} className="text-green-400 p-1 hover:bg-green-400/20 rounded">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-red-400 p-1 hover:bg-red-400/20 rounded">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2 group/edit">
                  <span 
                    className="text-white text-sm font-medium cursor-pointer hover:text-blue-400 transition-colors"
                    onClick={() => onSelectPerson(person.id, person.name)}
                  >
                    {person.name}
                  </span>
                  <button 
                    onClick={() => {
                      setEditingId(person.id)
                      setEditName(person.name)
                    }}
                    className="opacity-0 group-hover/edit:opacity-100 text-white/40 hover:text-white transition-opacity"
                  >
                    <Edit2 size={12} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
