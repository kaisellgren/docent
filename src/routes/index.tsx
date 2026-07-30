import { Link, createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Search, Send } from 'lucide-react';
import { currentSession } from '@/server/auth';
import { getRecentPages } from '@/features/wiki/server';
import * as styles from '@/styles/app.css';

const getViewer = createServerFn({ method: 'GET' }).handler(() => currentSession());

export const Route = createFileRoute('/')({
  loader: async () => {
    const viewer = await getViewer();
    return { viewer, pages: viewer ? await getRecentPages() : [] };
  },
  component: HomePage,
});

function HomePage() {
  const { viewer, pages } = Route.useLoaderData();
  const [question, setQuestion] = useState('');
  const navigateToChat = () => { if (question.trim()) window.location.assign(`/chat?q=${encodeURIComponent(question.trim())}`); };
  return <div className={styles.shell}>
    <header className={styles.homeNav}>
      <Link className={styles.homeBrand} to="/"><DocentMark />Docent</Link>
      <nav className={styles.homeNavLinks} aria-label="Primary navigation"><Link className={styles.homeNavLink} to="/spaces">Spaces</Link><Link className={styles.homeNavLink} to="/files">Files</Link>{viewer?.isEditor && <Link className={styles.homeNavLink} to="/spaces/new" search={{ spaceId: '' }}>Create page</Link>}</nav>
      <div className={styles.homeNavRight}>{viewer ? <><span className={styles.muted}>{viewer.name} · {viewer.isEditor ? 'Editor' : 'Viewer'}</span><form action="/auth/logout" method="post"><button className={styles.secondaryButton}>Sign out</button></form></> : <a className={styles.secondaryButton} href="/auth/google">Sign in with Google</a>}</div>
    </header>
    <section className={styles.hero}>
      <KnowledgeGraph />
      <div className={styles.heroContent}>
        <div className={styles.eyebrow}><span className={styles.eyebrowDot} />Internal knowledge base</div>
        <h1 className={styles.headline}>Ask Docent anything.<br /><span className={styles.gradient}>It already knows.</span></h1>
        <p className={styles.subhead}>Every space, page and decision your team has written down — searchable in one conversation, with the source pages cited every time.</p>
        {viewer ? <div className={styles.homeConsole}><div className={styles.homeConsoleRow}><Search size={18} color="#64828c" aria-hidden="true" /><input className={styles.homeConsoleInput} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && navigateToChat()} placeholder="Ask about a policy, a project, or who owns what…" aria-label="Ask Docent" /><button className={styles.homeSendButton} onClick={navigateToChat} aria-label="Ask Docent"><Send size={17} /></button></div></div> : <a className={styles.primaryButton} href="/auth/google">Sign in to ask Docent</a>}
      </div>
    </section>
    {viewer && <section className={styles.section}><h2>Recently updated</h2><div className={styles.grid}>{pages.map((page) => <Link key={page.id} className={styles.card + ' ' + styles.link} to="/spaces/$slug" params={{ slug: page.slug }}><strong>{page.title}</strong><p className={styles.muted}>{page.author} · {new Date(page.updatedAt).toLocaleDateString()}</p></Link>)}</div></section>}
  </div>;
}

function DocentMark() {
  return <svg className={styles.brandMark} viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="5" r="2.6" fill="currentColor" opacity=".95" /><circle cx="5" cy="19" r="2.6" fill="currentColor" opacity=".7" /><circle cx="21" cy="19" r="2.6" fill="currentColor" opacity=".7" /><path d="M13 7.6 6.2 17M13 7.6 19.8 17M7.6 19h10.8" stroke="currentColor" strokeWidth="1.2" opacity=".5" /></svg>;
}

function KnowledgeGraph() {
  return <div className={styles.heroGraph} aria-hidden="true"><svg className={styles.heroGraphSvg} viewBox="0 0 1180 560" preserveAspectRatio="xMidYMin meet"><defs><linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1fc8b5" /><stop offset="1" stopColor="#3e7bfa" /></linearGradient></defs><g><path className={styles.graphFlowEdge} stroke="url(#edgeGrad)" d="M150 90C300 90 420 260 590 330" /><path className={styles.graphEdge} d="M300 40C380 120 480 220 590 330" /><path className={styles.graphFlowEdge} stroke="url(#edgeGrad)" d="M1030 90C880 90 760 260 590 330" /><path className={styles.graphEdge} d="M880 40C800 120 700 220 590 330" /><path className={styles.graphEdge} d="M150 90C200 250 320 300 460 250" /><path className={styles.graphEdge} d="M1030 90C980 250 860 300 720 250" /></g><g><circle className={styles.graphDot} cx="150" cy="90" r="3.5" /><text className={styles.graphLabel} x="150" y="76" textAnchor="middle">ENGINEERING</text><circle className={styles.graphDot} cx="300" cy="40" r="3.5" /><text className={styles.graphLabel} x="300" y="26" textAnchor="middle">PRODUCT</text><circle className={styles.graphDot} cx="880" cy="40" r="3.5" /><text className={styles.graphLabel} x="880" y="26" textAnchor="middle">DESIGN</text><circle className={styles.graphDot} cx="1030" cy="90" r="3.5" /><text className={styles.graphLabel} x="1030" y="76" textAnchor="middle">PEOPLE OPS</text><circle className={styles.graphDot} cx="460" cy="250" r="3" /><text className={styles.graphLabel} x="460" y="238" textAnchor="middle">FINANCE</text><circle className={styles.graphDot} cx="720" cy="250" r="3" /><text className={styles.graphLabel} x="720" y="238" textAnchor="middle">SALES</text></g></svg></div>;
}
