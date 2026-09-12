import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function JoinInvalidPage() {
  const t = await getTranslations('auth')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">{t('joinInvalid.heading')}</h1>
        <p className="text-gray-500">{t('joinInvalid.body')}</p>
        <Link href="/onboarding" className="text-sm text-gray-700 underline">
          {t('joinInvalid.backToOnboarding')}
        </Link>
      </div>
    </div>
  )
}
