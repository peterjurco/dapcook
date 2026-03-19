'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
}

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif'
const MAX_SIZE_MB = 5

export function ImageUpload({ value, onChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_SIZE_MB}MB`)
      return
    }

    setUploading(true)
    setError(null)

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const supabase = createClient()

    const { error: uploadError } = await supabase.storage
      .from('recipe-images')
      .upload(path, file, { upsert: false })

    if (uploadError) {
      setError('Upload failed — ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('recipe-images').getPublicUrl(path)
    onChange(data.publicUrl)
    setUploading(false)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleFile(file)
  }

  function clear() {
    onChange('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      {value ? (
        <div className="relative w-full aspect-video max-w-sm rounded-lg overflow-hidden bg-gray-100 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Recipe" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
            aria-label="Remove image"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          disabled={uploading}
          className="flex flex-col items-center justify-center w-full max-w-sm aspect-video rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <Loader2 size={24} className="text-gray-400 animate-spin mb-2" />
              <span className="text-sm text-gray-400">Uploading...</span>
            </>
          ) : (
            <>
              <ImagePlus size={24} className="text-gray-400 mb-2" />
              <span className="text-sm font-medium text-gray-500">Add photo</span>
              <span className="text-xs text-gray-400 mt-1">or drag and drop</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        onChange={handleInputChange}
        className="sr-only"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
