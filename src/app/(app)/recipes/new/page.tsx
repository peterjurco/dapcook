import { getTranslations } from 'next-intl/server'
import { RecipeForm } from '@/components/recipe/RecipeForm'

export default async function NewRecipePage() {
  const t = await getTranslations('recipes')
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('newPage.heading')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('newPage.subtitle')}</p>
      </div>
      <RecipeForm />
    </div>
  )
}
