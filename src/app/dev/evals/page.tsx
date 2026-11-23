import { redirect } from 'next/navigation'
import { PROMPTS } from '@/lib/evals/prompts'

export default function EvalsIndex() {
  redirect(`/dev/evals/${PROMPTS[0].id}`)
}
