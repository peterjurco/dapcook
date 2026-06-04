import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipeForm } from './RecipeForm'
import type { Recipe } from '@/types/database'
import type { RecipeDraft } from '@/types/recipe'

// ── mocks ──────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockBack = vi.fn()
const mockRefresh = vi.fn()
const mockCapture = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, refresh: mockRefresh }),
}))

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('./ImageUpload', () => ({
  ImageUpload: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="image-upload" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

// ── helpers ────────────────────────────────────────────────────────────────

function mockFetchSuccess(id = 'recipe-123') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id }),
  } as Response)
}

function mockFetchError(message = 'Something went wrong') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: message }),
  } as Response)
}

const sampleRecipe: Recipe = {
  id: 'r-1',
  household_id: 'hh-1',
  created_by: 'user-1',
  title: 'Test Cake',
  description: 'A tasty cake',
  source_url: 'https://example.com/cake',
  image_url: 'https://example.com/cake.jpg',
  prep_time_min: 15,
  cook_time_min: 45,
  servings: 8,
  tags: ['dessert', 'baking'],
  ingredients: [],
  steps: [],
  notes: 'Great with coffee',
  is_archived: false,
  last_used_at: null,
  title_normalized: 'test cake',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const sampleDraft: RecipeDraft = {
  title: 'Imported Recipe',
  description: 'From the web',
  source_url: 'https://example.com/imported',
  image_url: 'https://example.com/img.jpg',
  prep_time_min: 10,
  cook_time_min: 20,
  servings: 4,
  tags: ['quick'],
  ingredients: [],
  steps: [],
  partial: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchSuccess()
})

// ── rendering ──────────────────────────────────────────────────────────────

describe('RecipeForm — rendering', () => {
  it('renders empty form in new mode', () => {
    render(<RecipeForm />)
    expect(screen.getByLabelText(/title/i)).toHaveValue('')
    expect(screen.getByText('Save recipe')).toBeInTheDocument()
  })

  it('renders pre-filled form in edit mode', () => {
    render(<RecipeForm recipe={sampleRecipe} />)
    expect(screen.getByLabelText(/title/i)).toHaveValue('Test Cake')
    expect(screen.getByLabelText(/description/i)).toHaveValue('A tasty cake')
    expect(screen.getByLabelText(/prep time/i)).toHaveValue(15)
    expect(screen.getByLabelText(/cook time/i)).toHaveValue(45)
    expect(screen.getByLabelText(/servings/i)).toHaveValue(8)
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })

  it('renders pre-filled form in import mode', () => {
    render(<RecipeForm draft={sampleDraft} />)
    expect(screen.getByLabelText(/title/i)).toHaveValue('Imported Recipe')
    expect(screen.getByText('Save recipe')).toBeInTheDocument()
  })

  it('shows partial warning banner when draft.partial is true', () => {
    render(<RecipeForm draft={{ ...sampleDraft, partial: true }} />)
    expect(screen.getByText(/could not be extracted/i)).toBeInTheDocument()
  })

  it('shows custom partial_reason when provided', () => {
    render(<RecipeForm draft={{ ...sampleDraft, partial: true, partial_reason: 'Custom message here' }} />)
    expect(screen.getByText('Custom message here')).toBeInTheDocument()
  })

  it('does not show partial warning when partial is false', () => {
    render(<RecipeForm draft={sampleDraft} />)
    expect(screen.queryByText(/could not be extracted/i)).toBeNull()
  })

  it('shows source URL link when sourceUrl is set', () => {
    render(<RecipeForm recipe={sampleRecipe} />)
    expect(screen.getByRole('link', { name: /example\.com/i })).toBeInTheDocument()
  })

  it('uses URL input for image in import mode instead of ImageUpload', () => {
    render(<RecipeForm draft={sampleDraft} />)
    expect(screen.queryByTestId('image-upload')).toBeNull()
    // image URL field is a plain url input when draft is provided
    const urlInputs = screen.getAllByDisplayValue('https://example.com/img.jpg')
    expect(urlInputs.length).toBeGreaterThan(0)
  })

  it('uses ImageUpload component in new mode', () => {
    render(<RecipeForm />)
    expect(screen.getByTestId('image-upload')).toBeInTheDocument()
  })

  it('shows existing tags as chips in edit mode', () => {
    render(<RecipeForm recipe={sampleRecipe} />)
    expect(screen.getByText('dessert')).toBeInTheDocument()
    expect(screen.getByText('baking')).toBeInTheDocument()
  })

  it('shows the delete action only in edit mode', () => {
    const { rerender } = render(<RecipeForm />)
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()

    rerender(<RecipeForm recipe={sampleRecipe} />)
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })
})

// ── validation ─────────────────────────────────────────────────────────────

describe('RecipeForm — validation', () => {
  it('shows error and does not submit when title is empty', async () => {
    render(<RecipeForm />)
    fireEvent.submit(screen.getByRole('button', { name: /save recipe/i }).closest('form')!)
    await waitFor(() => expect(screen.getByText(/title is required/i)).toBeInTheDocument())
    expect(global.fetch).not.toHaveBeenCalledWith('/api/recipes', expect.anything())
  })
})

// ── submission ─────────────────────────────────────────────────────────────

describe('RecipeForm — submission', () => {
  it('POSTs to /api/recipes for a new recipe', async () => {
    render(<RecipeForm />)
    await userEvent.type(screen.getByLabelText(/title/i), 'My Recipe')
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/recipes',
      expect.objectContaining({ method: 'POST' })
    ))
  })

  it('PUTs to /api/recipes/[id] for an edit', async () => {
    render(<RecipeForm recipe={sampleRecipe} />)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/recipes/r-1',
      expect.objectContaining({ method: 'PUT' })
    ))
  })

  it('includes title in POST payload', async () => {
    render(<RecipeForm />)
    await userEvent.type(screen.getByLabelText(/title/i), 'Cheese Soup')
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))

    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/recipes')
      expect(call).toBeDefined()
      const body = JSON.parse(call![1].body as string) as { title: string }
      expect(body.title).toBe('Cheese Soup')
    })
  })

  it('redirects to recipe page after successful save', async () => {
    mockFetchSuccess('new-recipe-id')
    render(<RecipeForm />)
    await userEvent.type(screen.getByLabelText(/title/i), 'Soup')
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/recipes/new-recipe-id'))
  })

  it('shows error message when API returns error', async () => {
    mockFetchError('Database error')
    render(<RecipeForm />)
    await userEvent.type(screen.getByLabelText(/title/i), 'Soup')
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))

    await waitFor(() => expect(screen.getByText('Database error')).toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('disables submit button while saving', async () => {
    // Never-resolving fetch to keep loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<RecipeForm />)
    await userEvent.type(screen.getByLabelText(/title/i), 'Soup')
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    )
  })
})

// ── tag management ─────────────────────────────────────────────────────────

describe('RecipeForm — tag management', () => {
  it('adds a tag on Enter key', async () => {
    render(<RecipeForm />)
    const tagInput = screen.getByPlaceholderText(/type a tag/i)
    await userEvent.type(tagInput, 'vegan{Enter}')
    expect(screen.getByText('vegan')).toBeInTheDocument()
  })

  it('adds a tag on comma key', async () => {
    render(<RecipeForm />)
    const tagInput = screen.getByPlaceholderText(/type a tag/i)
    await userEvent.type(tagInput, 'quick,')
    expect(screen.getByText('quick')).toBeInTheDocument()
  })

  it('lowercases tags', async () => {
    render(<RecipeForm />)
    const tagInput = screen.getByPlaceholderText(/type a tag/i)
    await userEvent.type(tagInput, 'VEGAN{Enter}')
    expect(screen.getByText('vegan')).toBeInTheDocument()
  })

  it('does not add duplicate tags', async () => {
    render(<RecipeForm />)
    const tagInput = screen.getByPlaceholderText(/type a tag/i)
    await userEvent.type(tagInput, 'vegan{Enter}')
    await userEvent.type(tagInput, 'vegan{Enter}')
    const chips = screen.getAllByText('vegan')
    expect(chips).toHaveLength(1)
  })

  it('removes a tag by clicking X', async () => {
    render(<RecipeForm recipe={sampleRecipe} />)
    expect(screen.getByText('dessert')).toBeInTheDocument()
    // Find the X button next to 'dessert' chip
    const dessertChip = screen.getByText('dessert').closest('span')!
    const xButton = dessertChip.querySelector('button')!
    fireEvent.click(xButton)
    expect(screen.queryByText('dessert')).toBeNull()
  })
})

// ── cancel ─────────────────────────────────────────────────────────────────

describe('RecipeForm — cancel', () => {
  it('calls router.back() on cancel', () => {
    render(<RecipeForm />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockBack).toHaveBeenCalled()
  })
})

// ── PostHog events ────────────────────────────────────────────────────────────

describe('PostHog events', () => {
  it('captures recipe_created after saving a new recipe', async () => {
    mockFetchSuccess('recipe-456')
    render(<RecipeForm />)
    await userEvent.type(screen.getByLabelText(/title/i), 'New Recipe')
    await userEvent.click(screen.getByRole('button', { name: /save recipe/i }))
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('recipe_created'))
  })

  it('does not capture recipe_created when editing an existing recipe', async () => {
    mockFetchSuccess('r-1')
    render(<RecipeForm recipe={sampleRecipe} />)
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockCapture).not.toHaveBeenCalledWith('recipe_created')
  })
})
