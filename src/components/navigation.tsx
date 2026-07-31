import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as styles from '@/styles/app.css'

export type NavigationViewer = { name: string; email: string; avatarUrl?: string | null; isEditor: boolean } | undefined

type TopNavigationProps = {
  viewer: NavigationViewer
  createPageContext?: { spaceId?: string; parentPageId?: string }
}

export function TopNavigation({ viewer, createPageContext }: TopNavigationProps) {
  return (
    <header className={styles.pageViewNav}>
      <div className={`${styles.shell} ${styles.pageViewNavInner}`}>
        <Link className={styles.pageViewBrand} to="/">
          <DocentMark />
          Docent
        </Link>
        {viewer && (
          <nav className={styles.pageViewCenterLinks} aria-label="Primary navigation">
            <Link to="/spaces">Spaces</Link>
            <Link
              to="/spaces/new"
              search={{
                spaceId: createPageContext?.spaceId ?? '',
                parentPageId: createPageContext?.parentPageId ?? '',
              }}
            >
              Create page
            </Link>
            <Link to="/chat" search={{ q: '', conversationId: '' }}>
              Conversations
            </Link>
          </nav>
        )}
        <div className={styles.pageViewNavRight}>
          {viewer && (
            <Link
              className={styles.pageIconButton}
              to="/chat"
              search={{ q: '', conversationId: '' }}
              aria-label="Search conversations"
            >
              <Search size={16} />
            </Link>
          )}
          {viewer ? (
            <AvatarMenu viewer={viewer} />
          ) : (
            <a className={styles.pageActionButton} href="/auth/google">
              <GoogleMark />
              Sign in with Google
            </a>
          )}
        </div>
      </div>
    </header>
  )
}

export function AppFooter() {
  return (
    <footer className={styles.appFooter}>
      <div className={`${styles.shell} ${styles.appFooterInner}`}>
        <span>© 2026 Docent — internal knowledge base</span>
        <Link to="/terms">Terms of Service</Link>
      </div>
    </footer>
  )
}

function AvatarMenu({ viewer }: { viewer: NavigationViewer & { name: string; email: string } }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  return (
    <div className={styles.pageAvatarMenu} ref={menuRef}>
      <button
        type="button"
        className={styles.pageViewAvatar}
        aria-label="Open account menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {viewer.avatarUrl ? (
          <img className={styles.pageViewAvatarImage} src={viewer.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          initials(viewer.name)
        )}
      </button>
      {open && (
        <div className={styles.pageAvatarDropdown} role="menu">
          <strong>{viewer.name}</strong>
          <small>{viewer.email}</small>
          <form action="/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      )}
    </div>
  )
}

function DocentMark() {
  return (
    <svg className={styles.pageViewBrandMark} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="5" r="2.6" fill="currentColor" opacity=".95" />
      <circle cx="5" cy="19" r="2.6" fill="currentColor" opacity=".7" />
      <circle cx="21" cy="19" r="2.6" fill="currentColor" opacity=".7" />
      <path d="M13 7.6 6.2 17M13 7.6 19.8 17M7.6 19h10.8" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
    </svg>
  )
}

export function GoogleMark() {
  return (
    <svg className={styles.googleMark} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.72-.06-1.41-.18-2.07H12v3.92h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.69 2.91-4.18 2.91-7.23Z"
      />
      <path
        fill="#34A853"
        d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.44c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.52A9.74 9.74 0 0 0 12 21.5Z"
      />
      <path
        fill="#FBBC05"
        d="M6.54 13.59A5.86 5.86 0 0 1 6.23 12c0-.55.11-1.09.31-1.59V7.89H3.3A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.11l3.24-2.52Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.38c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.47 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.39l3.24 2.52C7.31 8.1 9.46 6.38 12 6.38Z"
      />
    </svg>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
