import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import * as styles from "@/styles/app.css";

export type NavigationViewer = { name: string; email: string; avatarUrl?: string | null; isEditor: boolean } | undefined;

type TopNavigationProps = {
  viewer: NavigationViewer;
  createPageContext?: { spaceId?: string; parentPageId?: string };
};

export function TopNavigation({ viewer, createPageContext }: TopNavigationProps) {
  return (
    <header className={styles.pageViewNav}>
      <div className={`${styles.shell} ${styles.pageViewNavInner}`}>
        <Link className={styles.pageViewBrand} to="/">
          <DocentMark />
          Docent
        </Link>
        <nav className={styles.pageViewCenterLinks} aria-label="Primary navigation">
          <Link to="/spaces">Spaces</Link>
          <Link
            to="/spaces/new"
            search={{ spaceId: createPageContext?.spaceId ?? "", parentPageId: createPageContext?.parentPageId ?? "" }}
          >
            Create page
          </Link>
          <Link to="/chat" search={{ q: "", conversationId: "" }}>Conversations</Link>
        </nav>
        <div className={styles.pageViewNavRight}>
          <Link className={styles.pageIconButton} to="/chat" search={{ q: "", conversationId: "" }} aria-label="Search conversations">
            <Search size={16} />
          </Link>
          {viewer ? (
            <AvatarMenu viewer={viewer} />
          ) : (
            <a className={styles.pageActionButton} href="/auth/google">
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className={styles.appFooter}>
      <div className={`${styles.shell} ${styles.appFooterInner}`}>
        <span>© 2026 Docent — internal knowledge base</span>
        <Link to="/terms">Terms of Service</Link>
      </div>
    </footer>
  );
}

function AvatarMenu({ viewer }: { viewer: NavigationViewer & { name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.pageAvatarMenu}>
      <button
        type="button"
        className={styles.pageViewAvatar}
        aria-label="Open account menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {viewer.avatarUrl ? <img className={styles.pageViewAvatarImage} src={viewer.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials(viewer.name)}
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
  );
}

function DocentMark() {
  return (
    <svg className={styles.pageViewBrandMark} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="5" r="2.6" fill="currentColor" opacity=".95" />
      <circle cx="5" cy="19" r="2.6" fill="currentColor" opacity=".7" />
      <circle cx="21" cy="19" r="2.6" fill="currentColor" opacity=".7" />
      <path
        d="M13 7.6 6.2 17M13 7.6 19.8 17M7.6 19h10.8"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity=".5"
      />
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
