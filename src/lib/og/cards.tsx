/* eslint-disable @next/next/no-img-element -- these render through next/og, not the DOM */
import { inviteLine } from './inviters'

export const OG_SIZE = { width: 1200, height: 630 }

const EMERALD = '#047857'
const MINT = '#d1fae5'
const AVATAR_TINTS = ['#fde68a', '#fecaca', '#bfdbfe', '#ddd6fe']

const fill = {
  width: '100%',
  height: '100%',
  display: 'flex',
  fontFamily: 'Fraunces',
  background: EMERALD,
  color: '#fff',
} as const

/** The white "d" tile from the app icon. */
function Mark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: '#fff',
        color: EMERALD,
        fontSize: size * 0.72,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: size * 0.08,
      }}
    >
      d
    </div>
  )
}

/** Small "d dapcook" signature along the bottom of the content cards. */
function Signature() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 44,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 14,
        color: MINT,
        fontSize: 36,
      }}
    >
      <Mark size={44} />
      dapcook
    </div>
  )
}

export function AppCard() {
  return (
    <div style={{ ...fill, alignItems: 'center', justifyContent: 'center', gap: 40 }}>
      <Mark size={168} />
      <div style={{ fontSize: 150, letterSpacing: -4, paddingBottom: 18 }}>dapcook</div>
    </div>
  )
}

/** Shared recipe with a cover: the photo, plus a badge saying where it's from. */
export function RecipePhotoCard({ photo }: { photo: string }) {
  return (
    <div style={{ ...fill, position: 'relative' }}>
      <img src={photo} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'absolute',
          left: 40,
          bottom: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 28px 12px 12px',
          borderRadius: 24,
          background: EMERALD,
          fontSize: 44,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}
      >
        <Mark size={60} />
        dapcook
      </div>
    </div>
  )
}

// next/og ignores lineClamp, so long names are cut here to stay within three lines.
const MAX_TITLE = 90

function clipTitle(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1).trimEnd()}…` : title
}

function titleSize(title: string): number {
  if (title.length <= 22) return 96
  if (title.length <= 44) return 76
  return 60
}

/** Shared recipe without a usable cover: its name on the brand background. */
export function RecipeTitleCard({ title }: { title: string }) {
  const text = clipTitle(title)
  return (
    <div style={{ ...fill, position: 'relative', alignItems: 'center', justifyContent: 'center', padding: '0 90px 90px' }}>
      <div style={{ fontSize: titleSize(text), lineHeight: 1.1, textAlign: 'center' }}>{text}</div>
      <Signature />
    </div>
  )
}

export interface InviteMember {
  name: string | null
  /** A data URI, or null to show the initial instead. */
  photo: string | null
}

export function InviteCard({ household, members }: { household: string; members: InviteMember[] }) {
  const shown = members.slice(0, 4)
  return (
    <div
      style={{
        ...fill,
        position: 'relative',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 90px 90px',
        textAlign: 'center',
      }}
    >
      {shown.length > 0 && (
        <div style={{ display: 'flex', marginBottom: 32, paddingLeft: 24 }}>
          {shown.map((member, i) =>
            member.photo ? (
              <img
                key={i}
                src={member.photo}
                width={112}
                height={112}
                alt=""
                style={{ borderRadius: 56, border: `6px solid ${EMERALD}`, marginLeft: -24 }}
              />
            ) : (
              <div
                key={i}
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: 56,
                  border: `6px solid ${EMERALD}`,
                  marginLeft: -24,
                  background: AVATAR_TINTS[i % AVATAR_TINTS.length],
                  color: '#064e3b',
                  fontSize: 52,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingBottom: 6,
                }}
              >
                {(member.name?.trim()[0] ?? '?').toUpperCase()}
              </div>
            )
          )}
        </div>
      )}
      <div style={{ fontSize: 40, color: MINT }}>{inviteLine(members.map((m) => m.name))}</div>
      <div style={{ fontSize: titleSize(household), lineHeight: 1.1, marginTop: 12 }}>{clipTitle(household)}</div>
      <Signature />
    </div>
  )
}
