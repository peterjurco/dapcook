import { describe, it, expect, vi } from 'vitest'
import { logAiUsage } from './log-usage'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

describe('logAiUsage', () => {
  it('inserts a row with the correct fields', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as SupabaseClient<Database>

    await logAiUsage(supabase, 'hh-1', 'shopping_smart', {
      input_tokens: 100,
      output_tokens: 200,
    })

    expect(supabase.from).toHaveBeenCalledWith('ai_usage_logs')
    expect(insert).toHaveBeenCalledWith({
      household_id: 'hh-1',
      feature: 'shopping_smart',
      input_tokens: 100,
      output_tokens: 200,
    })
  })
})
