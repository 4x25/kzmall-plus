export function isLoggedIn(): boolean {
  return !!getCookie('token')
}

export function clearAuth(): void {
  document.cookie = 'token=; path=/; max-age=0'
}

function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? match[1] : ''
}