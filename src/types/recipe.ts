export interface Ingredient {
  id: string
  quantity: number | null
  unit: string
  name: string
  notes: string
}

export interface Step {
  id: string
  order: number
  text: string
}

// What the scraper + AI parser returns — not yet saved
export interface RecipeDraft {
  title: string
  description: string
  source_url: string
  image_url: string | null
  prep_time_min: number | null
  cook_time_min: number | null
  servings: number | null
  tags: string[]
  ingredients: Ingredient[]
  steps: Step[]
  partial: boolean
  partial_reason?: string
}

// Form-level ingredient (quantity as string for easy editing)
export interface IngredientFormItem {
  id: string
  quantity: string
  unit: string
  name: string
  notes: string
}
