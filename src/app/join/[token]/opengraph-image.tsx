import { unstable_noStore as noStore } from 'next/cache'
import { ImageResponse } from 'next/og'
import { AppCard, InviteCard, OG_SIZE } from '@/lib/og/cards'
import { loadOgFonts } from '@/lib/og/fonts'
import { getInviteDetails } from '@/lib/households/invite-details'
import { isTrustedAvatar, jpegDataUri } from '@/lib/og/photo'

export const alt = 'An invitation to cook together on dapcook'
export const size = OG_SIZE
export const contentType = 'image/png'

const AVATAR_PX = 112
const MAX_AVATARS = 4

export default async function Image({ params }: { params: { token: string } }) {
  noStore()
  const [household, fonts] = await Promise.all([getInviteDetails(params.token).catch(() => null), loadOgFonts()])
  if (!household) return new ImageResponse(<AppCard />, { ...OG_SIZE, fonts })

  const members = await Promise.all(
    household.members.map(async (member, i) => ({
      name: member.display_name,
      photo:
        i < MAX_AVATARS && isTrustedAvatar(member.avatar_url)
          ? await jpegDataUri(member.avatar_url, { width: AVATAR_PX, height: AVATAR_PX })
          : null,
    }))
  )
  return new ImageResponse(<InviteCard household={household.name} members={members} />, { ...OG_SIZE, fonts })
}
