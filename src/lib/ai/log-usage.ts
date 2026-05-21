import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function logAiUsage(
  supabase: SupabaseClient<Database>,
  householdId: string,
  feature: string,
  usage: { input_tokens: number; output_tokens: number }
): Promise<void> {
  const { error } = await supabase.from('ai_usage_logs').insert({
    household_id: householdId,
    feature,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
  })
  if (error) {
    console.error('[logAiUsage] Failed to log AI usage:', error)
  }
}
