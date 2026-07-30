import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { Search, Sun } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPage, getSpacePages, getSpaces } from "@/features/wiki/server";
import { currentSession } from "@/server/auth";
import * as styles from "@/styles/app.css";

const getViewer = createServerFn({ method: "GET" }).handler(() => currentSession());

export const Route = createFileRoute("/spaces/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    spaceId: typeof search.spaceId === "string" ? search.spaceId : "",
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const viewer = await getViewer();
    if (!viewer) return { viewer, spaces: [], initialPages: [], initialSpaceId: "" };
    const spaces = await getSpaces();
    const initialSpaceId = spaces.some((space) => space.id === deps.spaceId)
      ? deps.spaceId
      : (spaces[0]?.id ?? "");
    return {
      viewer,
      spaces,
      initialPages: initialSpaceId
        ? await getSpacePages({ data: { spaceId: initialSpaceId } })
        : [],
      initialSpaceId,
    };
  },
  component: CreatePage,
});

type ViewMode = "split" | "write" | "preview";

function CreatePage() {
  const { viewer, spaces, initialPages, initialSpaceId } = Route.useLoaderData();
  const create = useServerFn(createPage);
  const loadPages = useServerFn(getSpacePages);
  const router = useRouter();
  const editor = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [mode, setMode] = useState<ViewMode>("split");
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [parentPageId, setParentPageId] = useState("");
  const [parentPages, setParentPages] = useState(initialPages);
  const slug = slugify(title);

  useEffect(() => {
    setSpaceId(initialSpaceId);
    setParentPageId("");
    setParentPages(initialPages);
  }, [initialPages, initialSpaceId]);
  useEffect(() => {
    setParentPageId("");
    if (!spaceId) {
      setParentPages([]);
      return;
    }
    if (spaceId === initialSpaceId) {
      setParentPages(initialPages);
      return;
    }
    void loadPages({ data: { spaceId } }).then(setParentPages);
  }, [initialPages, initialSpaceId, loadPages, spaceId]);

  function insert(before: string, after = "") {
    const input = editor.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = markdown.slice(start, end);
    const next = `${markdown.slice(0, start)}${before}${selected}${after}${markdown.slice(end)}`;
    setMarkdown(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPublishing(true);
    try {
      if (!spaceId) {
        setError("Create a space before publishing a page.");
        return;
      }
      const page = await create({
        data: { title, markdown, spaceId, parentPageId: parentPageId || null },
      });
      await router.navigate({ to: "/spaces/$slug", params: { slug: page.slug } });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "";
      setError(
        detail
          ? `Unable to publish this page: ${detail}`
          : "Unable to publish this page. Please try again.",
      );
    } finally {
      setPublishing(false);
    }
  }

  if (!viewer)
    return (
      <div className={styles.shell}>
        <header className={styles.nav}>
          <Link className={styles.link} to="/spaces">
            ← Spaces
          </Link>
        </header>
        <section className={styles.section}>
          <h1>Create page</h1>
          <a className={styles.primaryButton} href="/auth/google">
            Sign in to create a page
          </a>
        </section>
      </div>
    );
  if (!viewer.isEditor)
    return (
      <div className={styles.shell}>
        <header className={styles.nav}>
          <Link className={styles.link} to="/spaces">
            ← Spaces
          </Link>
        </header>
        <section className={styles.section}>
          <h1>Create page</h1>
          <p className={styles.muted}>Only editors can create pages.</p>
        </section>
      </div>
    );

  return (
    <div>
      <header className={styles.pageViewNav}>
        <div className={`${styles.shell} ${styles.pageViewNavInner}`}>
          <Link className={styles.pageViewBrand} to="/">
            <DocentMark />
            Docent
          </Link>
          <div className={styles.pageViewNavRight}>
            <Link className={styles.pageIconButton} to="/spaces" aria-label="Search spaces">
              <Search size={16} />
            </Link>
            <button type="button" className={styles.pageIconButton} aria-label="Theme">
              <Sun size={15} />
            </button>
            <span className={styles.pageViewAvatar}>{initials(viewer.name)}</span>
          </div>
        </div>
      </header>
      <div className={styles.pageActionBar}>
        <div className={`${styles.shell} ${styles.pageActionBarInner}`}>
          <div className={styles.pageBreadcrumb}>
            <Link className={styles.pageBreadcrumbLink} to="/spaces">
              Spaces
            </Link>
            <span>/</span>
            <span className={styles.pageBreadcrumbCurrent}>{title || "Untitled page"}</span>
          </div>
          <div className={styles.pageActionGroup}>
            <span className={styles.statusPill}>
              <i className={styles.statusPillDot} />
              New draft
            </span>
            <Link className={styles.pageActionButton} to="/spaces">
              Cancel
            </Link>
            <button
              className={styles.pageActionPrimary}
              form="create-page"
              disabled={publishing || !spaceId}
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </div>
      <main className={styles.shell}>
        <form id="create-page" className={styles.editorShell} onSubmit={publish}>
          <section>
            <input
              className={styles.editorTitleInput}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled page"
              disabled={publishing}
              required
              autoFocus
            />
            <div className={styles.editorMeta}>
              <span className={styles.editorSpace}>
                ⌁ {spaces.find((space) => space.id === spaceId)?.name ?? "Choose a space"}
              </span>
              <span>Draft</span>
              <span>·</span>
              <span>Editing as {viewer.name}</span>
            </div>
            <div className={styles.editorToolbar}>
              <div className={styles.formatGroup}>
                <button
                  type="button"
                  className={styles.formatButton}
                  onClick={() => insert("**", "**")}
                  title="Bold"
                >
                  <b>B</b>
                </button>
                <button
                  type="button"
                  className={styles.formatButton}
                  onClick={() => insert("_", "_")}
                  title="Italic"
                >
                  <i>i</i>
                </button>
                <button
                  type="button"
                  className={styles.formatButton}
                  onClick={() => insert("## ")}
                  title="Heading"
                >
                  H
                </button>
                <span className={styles.formatDivider} />
                <button
                  type="button"
                  className={styles.formatButton}
                  onClick={() => insert("- ")}
                  title="Bulleted list"
                >
                  ≡
                </button>
                <button
                  type="button"
                  className={styles.formatButton}
                  onClick={() => insert("[", "](https://)")}
                  title="Link"
                >
                  ⛓
                </button>
                <button
                  type="button"
                  className={styles.formatButton}
                  onClick={() => insert("`", "`")}
                  title="Code"
                >
                  &lt;/&gt;
                </button>
                <button
                  type="button"
                  className={styles.formatButton}
                  onClick={() => insert("> ")}
                  title="Quote"
                >
                  “
                </button>
              </div>
              <div className={styles.viewSwitch}>
                {(["split", "write", "preview"] as const).map((view) => (
                  <button
                    type="button"
                    className={mode === view ? styles.viewSwitchActive : styles.viewSwitchButton}
                    key={view}
                    onClick={() => setMode(view)}
                  >
                    {view.charAt(0).toUpperCase() + view.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div
              className={`${styles.editorPanes} ${mode === "write" ? styles.editorPanesWrite : mode === "preview" ? styles.editorPanesPreview : ""}`}
            >
              <div className={`${styles.editorPane} ${styles.editorWritePane}`}>
                <div className={styles.editorPaneLabel}>Markdown body</div>
                <textarea
                  ref={editor}
                  className={styles.editorTextarea}
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  placeholder="Start writing in Markdown…"
                  disabled={publishing}
                  spellCheck={false}
                  required
                />
              </div>
              <div className={`${styles.editorPane} ${styles.editorPreviewPane}`}>
                <div className={styles.editorPaneLabel}>Preview</div>
                <div className={styles.editorPreview}>
                  {markdown ? (
                    <ReactMarkdown>{markdown}</ReactMarkdown>
                  ) : (
                    <p>Markdown preview will appear here.</p>
                  )}
                </div>
              </div>
            </div>
            {error && (
              <p className={styles.feedbackError} role="alert">
                {error}
              </p>
            )}
          </section>
          <aside className={styles.editorSidebar}>
            <div className={styles.editorSideCard}>
              <h2 className={styles.editorSideCardTitle}>Page settings</h2>
              <div className={styles.editorField}>
                <label htmlFor="space">Space</label>
                <select
                  id="space"
                  className={styles.editorSelect}
                  value={spaceId}
                  onChange={(event) => setSpaceId(event.target.value)}
                  disabled={publishing}
                >
                  <option value="">Choose a space</option>
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                </select>
                {spaces.length === 0 && (
                  <Link className={styles.editorCreateSpaceLink} to="/spaces">
                    Create a space first
                  </Link>
                )}
              </div>
              <div className={styles.editorField}>
                <label htmlFor="parent-page">Parent page</label>
                <select
                  id="parent-page"
                  className={styles.editorSelect}
                  value={parentPageId}
                  onChange={(event) => setParentPageId(event.target.value)}
                  disabled={publishing || !spaceId}
                >
                  <option value="">None (top level)</option>
                  {parentPages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.editorField}>
                <span>Slug</span>
                <output className={styles.editorFieldValue}>{slug}</output>
              </div>
            </div>
            <div className={styles.editorSideCard}>
              <div className={styles.aiHint}>
                <span>✦</span>
                <p className={styles.aiHintText}>
                  Docent will index this page the moment you publish, so it can be cited in chat
                  answers right away.
                </p>
              </div>
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "generated-from-title"
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
