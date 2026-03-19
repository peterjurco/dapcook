import { RecipeForm } from '@/components/recipe/RecipeForm'

export default function NewRecipePage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">New recipe</h1>
        <p className="text-sm text-gray-500 mt-1">Add a recipe from scratch</p>
      </div>
      <RecipeForm />
    </div>
  )
}
