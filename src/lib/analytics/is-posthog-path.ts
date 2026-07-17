export function isPostHogPath(pathname: string): boolean {
  return pathname !== '/s' && !pathname.startsWith('/s/')
}
