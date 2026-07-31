import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { Grid2X2, List, Plus, Search, Star } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { TopNavigation } from "@/components/navigation";
import { SPACE_ICON_OPTIONS, SpaceIcon, type SpaceIconName } from "@/components/space-icon";
import { createSpace, getSpaces } from "@/features/wiki/server";
import { currentSession } from "@/server/auth";
import * as styles from "@/styles/app.css";

const getViewer = createServerFn({ method: "GET" }).handler(() => currentSession());

export const Route = createFileRoute("/spaces/")({
  loader: async () => {
    const viewer = await getViewer();
    return { viewer, spaces: viewer ? await getSpaces() : [] };
  },
  component: SpacesIndex,
});

function SpacesIndex() {
  const { viewer, spaces } = Route.useLoaderData();
  const router = useRouter();
  const create = useServerFn(createSpace);
  const [query, setQuery] = useState("");
  const [listView, setListView] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<SpaceIconName>("book-open");
  const [error, setError] = useState("");
  const filteredSpaces = useMemo(
    () =>
      spaces.filter((space) =>
        `${space.name} ${space.description}`.toLowerCase().includes(query.toLowerCase().trim()),
      ),
    [query, spaces],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await create({ data: { name, description, icon } });
      setName("");
      setDescription("");
      setIcon("book-open");
      setCreating(false);
      await router.invalidate();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "";
      setError(
        detail
          ? `Unable to create this space: ${detail}`
          : "Unable to create this space. Please try again.",
      );
    }
  }

  return (
    <div>
      <TopNavigation viewer={viewer} />
      <div className={styles.pageActionBar}>
        <div className={`${styles.shell} ${styles.pageActionBarInner}`}>
          <div className={styles.pageBreadcrumb}>
            <span className={styles.pageBreadcrumbCurrent}>Spaces</span>
          </div>
          {viewer?.isEditor && (
            <div className={styles.pageActionGroup}>
              <button
                type="button"
                className={styles.pageActionPrimary}
                onClick={() => {
                  setError("");
                  setCreating((value) => !value);
                }}
              >
                <Plus size={13} />
                Create space
              </button>
              <Link className={styles.pageActionButton} to="/spaces/new" search={{ spaceId: "", parentPageId: "" }}>
                <Plus size={13} />
                Create page
              </Link>
            </div>
          )}
        </div>
      </div>
      {!viewer ? (
        <main className={styles.shell}>
          <section className={styles.section}>
            <h1>Spaces</h1>
            <p className={styles.muted}>Sign in to browse your team’s knowledge spaces.</p>
            <a className={styles.primaryButton} href="/auth/google">
              Sign in with Google
            </a>
          </section>
        </main>
      ) : (
        <main className={styles.shell}>
          <section className={styles.spacesPageHead}>
            <div>
              <h1>Spaces</h1>
              <p>Where your team’s knowledge lives, organized by topic and team.</p>
            </div>
            <div className={styles.spacesHeadActions}>
              <label className={styles.spacesSearch}>
                <Search size={15} aria-hidden="true" />
                <input
                  className={styles.spacesSearchInput}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a space…"
                  aria-label="Find a space"
                />
              </label>
            </div>
          </section>
          {creating && (
            <form className={styles.spaceCreateForm} onSubmit={submit}>
              <input
                className={styles.spacesFormInput}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Space name"
                required
                autoFocus
              />
              <input
                className={styles.spacesFormInput}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What belongs in this space?"
                required
              />
              <label className={styles.spacesIconField}>
                <span>Icon</span>
                <select
                  className={styles.spacesFormSelect}
                  value={icon}
                  onChange={(event) => setIcon(event.target.value as SpaceIconName)}
                  aria-label="Space icon"
                >
                  {SPACE_ICON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <span className={styles.spaceIcon}><SpaceIcon name={icon} size={20} /></span>
              <button className={styles.primaryButton}>Create space</button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              {error && (
                <p className={styles.feedbackError} role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
          <div className={styles.spacesFilterRow}>
            <span className={styles.spacesCount}>All spaces ({filteredSpaces.length})</span>
            <div className={styles.spacesViewToggle}>
              <button
                type="button"
                className={!listView ? styles.spacesViewActive : styles.spacesViewButton}
                onClick={() => setListView(false)}
                aria-label="Grid view"
              >
                <Grid2X2 size={14} />
              </button>
              <button
                type="button"
                className={listView ? styles.spacesViewActive : styles.spacesViewButton}
                onClick={() => setListView(true)}
                aria-label="List view"
              >
                <List size={14} />
              </button>
            </div>
          </div>
          {spaces.length === 0 ? (
            <section className={styles.emptySpaces}>
              <h2>No spaces yet</h2>
              <p>Create a space to organize pages and their parent-child hierarchy.</p>
              {viewer.isEditor && (
                <button className={styles.primaryButton} onClick={() => setCreating(true)}>
                  Create the first space
                </button>
              )}
            </section>
          ) : (
            <>
              <div className={`${styles.spacesGrid} ${listView ? styles.spacesGridList : ""}`}>
                {filteredSpaces.map((space) => (
                  <Link
                    className={styles.spaceCard}
                    key={space.id}
                    to="/spaces/space/$slug"
                    params={{ slug: space.slug }}
                  >
                    <div className={styles.spaceCardTop}>
                      <span className={styles.spaceIcon}>
                        <SpaceIcon name={space.icon} />
                      </span>
                      <span className={styles.spaceKey}>
                        {space.slug.slice(0, 3).toUpperCase()}
                      </span>
                      {space.isFavorite && <Star className={styles.spaceFavorite} size={15} fill="currentColor" aria-label="Favorite space" />}
                    </div>
                    <h2>{space.name}</h2>
                    <p>{space.description}</p>
                    <div className={styles.spaceCardFoot}>
                      <span>
                        {space.pageCount} {space.pageCount === 1 ? "page" : "pages"}
                      </span>
                      <span>updated {relativeTime(space.updatedAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
              {filteredSpaces.length === 0 && (
                <p className={styles.muted}>No spaces match “{query}”.</p>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
