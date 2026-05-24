import Cookies from 'js-cookie'

export function isLoggedIn(): boolean {
  return !!Cookies.get('token')
}

export async function signOut(): Promise<void> {
  try {
    await fetch('/api/passport/login/signOut', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01'
      }
    })
  } finally {
    clearAuth()
  }
}

export function clearAuth(): void {
  const paths = getCookiePaths()

  Object.keys(Cookies.get()).forEach((name) => {
    Cookies.remove(name)
    paths.forEach((path) => Cookies.remove(name, { path }))
  })
}

function getCookiePaths(): string[] {
  const paths = new Set<string>(['/'])
  const segments = window.location.pathname.split('/').filter(Boolean)

  segments.forEach((_, index) => {
    paths.add(`/${segments.slice(0, index + 1).join('/')}`)
  })

  return [...paths]
}
