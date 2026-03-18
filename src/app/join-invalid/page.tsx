import Link from 'next/link'

export default function JoinInvalidPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Invalid invite link</h1>
        <p className="text-gray-500">This invite link is invalid or has already been used.</p>
        <Link href="/onboarding" className="text-sm text-gray-700 underline">
          Back to onboarding
        </Link>
      </div>
    </div>
  )
}
