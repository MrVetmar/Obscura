import React, { useEffect, useState } from 'react'
import { Users, Edit2, Check, X } from 'lucide-react'

export default function PeopleView({ onSelectPerson }: { onSelectPerson: (id: string, name: string) => void }) {
  const [people, setPeople] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

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
      <h2 className="text-2xl font-medium text-white mb-8 flex items-center space-x-3">
        <Users className="text-blue-400" />
        <span>Kişiler ({people.length})</span>
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {people.map(person => {
          const box = JSON.parse(person.boundingBox)
          // We can use object-position or clip-path or just use the full image as cover for simplicity
          // But to focus on the face, we can use object-fit: cover and object-position 
          // Since we know the bounding box, we can calculate percentages for object-position if we knew image size,
          // but without image size, object-fit: cover is a decent fallback for now.
          const imgUrl = `obscura://local/${encodeURIComponent(person.photoPath)}`

          return (
            <div key={person.id} className="flex flex-col items-center space-y-3">
              <div 
                className="w-32 h-32 rounded-full overflow-hidden border-2 border-white/10 hover:border-blue-500 transition-colors cursor-pointer shadow-lg bg-zinc-800"
                onClick={() => onSelectPerson(person.id, person.name)}
              >
                <img 
                  src={imgUrl} 
                  alt={person.name}
                  className="w-full h-full object-cover"
                />
              </div>

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
                <div className="flex items-center space-x-2 group">
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
                    className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white transition-opacity"
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
