import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  Download,
  File as FileIcon,
  FileText,
  Folder,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import {
  confirmUpload,
  createFolder,
  createUploadIntent,
  getDownloadUrl,
  getSpaceFiles,
  getSpaceFolders,
  deleteFile,
  retryFileIngestion,
} from "@/features/files/server";
import { getSpace, getSpacePages, toggleSpaceFavorite } from "@/features/wiki/server";
import { TopNavigation } from "@/components/navigation";
import { SpaceIcon } from "@/components/space-icon";
import { IngestionStatus } from "@/components/ingestion-status";
import { currentSession } from "@/server/auth";
import * as styles from "@/styles/app.css";

const getViewer = createServerFn({ method: "GET" }).handler(() => currentSession());
type SpacePageData = Awaited<ReturnType<typeof getSpacePages>>;
type SpacePageItem = SpacePageData[number];
type SpaceFileData = Awaited<ReturnType<typeof getSpaceFiles>>;
type SpaceFolderData = Awaited<ReturnType<typeof getSpaceFolders>>;

export const Route = createFileRoute("/spaces/space/$slug")({
  validateSearch: z.object({ tab: z.enum(["pages", "files"]).optional().default("pages") }),
  loader: async ({ params }) => {
    const viewer = await getViewer();
    if (!viewer) return { viewer, space: null, pages: [], files: [], folders: [] };
    const space = await getSpace({ data: { slug: params.slug } });
    if (!space) throw notFound();
    const [pages, files, folders] = await Promise.all([
      getSpacePages({ data: { spaceId: space.id } }),
      getSpaceFiles({ data: { spaceId: space.id } }),
      getSpaceFolders({ data: { spaceId: space.id } }),
    ]);
    return { viewer, space, pages, files, folders };
  },
  component: SpacePage,
});

function SpacePage() {
  const { viewer, space, pages, files, folders } = Route.useLoaderData();
  const toggleFavorite = useServerFn(toggleSpaceFavorite);
  const { tab } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"tree" | "updated" | "name">("tree");
  const [flatList, setFlatList] = useState(false);
  const [starred, setStarred] = useState(space?.isFavorite ?? false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setStarred(space?.isFavorite ?? false);
  }, [space?.id, space?.isFavorite]);

  if (!viewer || !space)
    return (
      <div className={styles.shell}>
        <header className={styles.nav}>
          <Link className={styles.link} to="/spaces">
            ← Spaces
          </Link>
        </header>
        <section className={styles.section}>
          <a className={styles.primaryButton} href="/auth/google">
            Sign in to browse spaces
          </a>
        </section>
      </div>
    );

  const matchingPages = useMemo(
    () => pages.filter((page) => page.title.toLowerCase().includes(query.toLowerCase().trim())),
    [pages, query],
  );
  const treePages = useMemo(() => includeAncestors(matchingPages, pages), [matchingPages, pages]);
  const contributors = [...new Set(pages.map((page) => page.author))];
  const orderedPages = useMemo(() => {
    const result = [...matchingPages];
    if (sort === "updated")
      result.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    if (sort === "name" || sort === "tree") result.sort((a, b) => a.title.localeCompare(b.title));
    return result;
  }, [matchingPages, sort]);
  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function setFavorite() {
    if (!space) return;
    const next = !starred;
    setStarred(next);
    try {
      await toggleFavorite({ data: { spaceId: space.id, favorite: next } });
    } catch {
      setStarred(!next);
    }
  }
  const tabLink = (nextTab: "pages" | "files") => ({
    to: "/spaces/space/$slug" as const,
    params: { slug: space.slug },
    search: { tab: nextTab },
  });

  return (
    <div>
      <TopNavigation viewer={viewer} createPageContext={{ spaceId: space.id }} />
      <div className={styles.pageActionBar}>
        <div className={`${styles.shell} ${styles.pageActionBarInner}`}>
          <div className={styles.pageBreadcrumb}>
            <Link className={styles.pageBreadcrumbLink} to="/spaces">
              Spaces
            </Link>
            <span>/</span>
            <span className={styles.pageBreadcrumbCurrent}>{space.name}</span>
          </div>
          <div className={styles.pageActionGroup}>
            <button
              type="button"
              className={styles.pageIconButton}
              aria-label={starred ? "Unstar space" : "Star space"}
              aria-pressed={starred}
              onClick={() => { void setFavorite(); }}
            >
              <Star size={15} fill={starred ? "currentColor" : "none"} />
            </button>
            {viewer.isEditor && (
              <Link
                className={styles.pageActionPrimary}
                to="/spaces/new"
                search={{ spaceId: space.id, parentPageId: "" }}
              >
                <Plus size={13} />
                Create page
              </Link>
            )}
            <button type="button" className={styles.pageIconButton} aria-label="More space actions">
              <MoreHorizontal size={15} />
            </button>
          </div>
        </div>
      </div>
      <main className={styles.shell}>
        <section className={styles.spaceHeader}>
          <div className={styles.spaceHeadTop}>
            <div className={styles.spaceIdentity}>
              <div className={styles.spaceLargeIcon}><SpaceIcon name={space.icon} size={26} /></div>
              <div>
                <h1 className={styles.spaceTitle}>
                  {space.name}{" "}
                  <span className={styles.spaceKeyBadge}>
                    {space.slug.slice(0, 3).toUpperCase()}
                  </span>
                </h1>
                <p>{space.description}</p>
              </div>
            </div>
          </div>
          <div className={styles.spaceMetaRow}>
            <span>
              <b>{pages.length}</b> {pages.length === 1 ? "page" : "pages"}
            </span>
            <span>
              <b>{files.length}</b> {files.length === 1 ? "file" : "files"}
            </span>
            <span>
              <b>{contributors.length}</b>{" "}
              {contributors.length === 1 ? "contributor" : "contributors"}
            </span>
            <span>
              updated <b>{relativeTime(space.updatedAt)}</b>
            </span>
          </div>
          <div className={styles.spaceTabs}>
            <Link
              className={tab === "pages" ? styles.spaceTabActive : styles.spaceTab}
              {...tabLink("pages")}
            >
              Pages
            </Link>
            <Link
              className={tab === "files" ? styles.spaceTabActive : styles.spaceTab}
              {...tabLink("files")}
            >
              Files <span className={styles.spaceTabCount}>{files.length}</span>
            </Link>
          </div>
        </section>
        {tab === "files" ? (
          <FilesTab
            spaceId={space.id}
            files={files}
            folders={folders}
            viewerIsEditor={viewer.isEditor}
          />
        ) : (
          <section className={styles.spaceBody}>
            <aside className={styles.treePanel}>
              <label className={styles.treeSearch}>
                <Search size={14} aria-hidden="true" />
                <input
                  className={styles.treeSearchInput}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter pages…"
                  aria-label="Filter pages"
                />
              </label>
              <div className={styles.detailPageTree}>
                {renderTree(null, treePages, collapsed, toggleCollapsed)}
              </div>
              {viewer.isEditor && (
                <Link className={styles.treeAdd} to="/spaces/new" search={{ spaceId: space.id, parentPageId: "" }}>
                  <Plus size={13} />
                  Add page
                </Link>
              )}
            </aside>
            <section>
              <div className={styles.contentHead}>
                <h2>
                  All pages <span>({matchingPages.length})</span>
                </h2>
                <div className={styles.contentControls}>
                  <select
                    className={styles.detailSort}
                    value={sort}
                    onChange={(event) => setSort(event.target.value as typeof sort)}
                  >
                    <option value="tree">Sort: Tree order</option>
                    <option value="updated">Sort: Recently updated</option>
                    <option value="name">Sort: Name A–Z</option>
                  </select>
                  <div className={styles.detailViewToggle}>
                    <button
                      type="button"
                      className={!flatList ? styles.detailViewActive : styles.detailViewButton}
                      onClick={() => setFlatList(false)}
                      aria-label="Tree order"
                    >
                      <List size={13} />
                    </button>
                    <button
                      type="button"
                      className={flatList ? styles.detailViewActive : styles.detailViewButton}
                      onClick={() => setFlatList(true)}
                      aria-label="Flat list"
                    >
                      <List size={13} />
                    </button>
                  </div>
                </div>
              </div>
              <div className={styles.pageList}>
                {orderedPages.map((page) => (
                  <PageRow
                    key={page.id}
                    page={page}
                    pages={pages}
                    depth={flatList ? 0 : pageDepth(page, pages)}
                  />
                ))}
                {matchingPages.length === 0 && (
                  <p className={styles.muted}>No pages match this filter.</p>
                )}
              </div>
              <RecentFiles files={files} spaceSlug={space.slug} />
            </section>
          </section>
        )}
      </main>
    </div>
  );
}

function RecentFiles({ files, spaceSlug }: { files: SpaceFileData; spaceSlug: string }) {
  const recent = files.slice(0, 5);
  return (
    <section className={styles.recentFiles}>
      <div className={styles.recentFilesHead}>
        <div>
          <h2>Files in this space</h2>
          <p>Documents available to cite in this space.</p>
        </div>
        <Link to="/spaces/space/$slug" params={{ slug: spaceSlug }} search={{ tab: "files" }}>
          View all files →
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className={styles.muted}>No files have been added yet.</p>
      ) : (
        <div className={styles.recentFilesGrid}>
          {recent.map((file) => (
            <div className={styles.recentFile} key={file.id}>
              <FileIcon size={15} />
              <span className={styles.recentFileDetails}>
                <b>{file.filename}</b>
                <small>
                  {file.folderName ?? "Unfiled"} · {relativeTime(file.createdAt)}
                </small>
              </span>
              <span className={styles.fileLabels}>
                {file.tags.slice(0, 2).map((tag) => (
                  <em key={tag}>{tag}</em>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FilesTab({
  spaceId,
  files,
  folders,
  viewerIsEditor,
}: {
  spaceId: string;
  files: SpaceFileData;
  folders: SpaceFolderData;
  viewerIsEditor: boolean;
}) {
  const uploadIntent = useServerFn(createUploadIntent);
  const confirm = useServerFn(confirmUpload);
  const addFolder = useServerFn(createFolder);
  const download = useServerFn(getDownloadUrl);
  const retryFile = useServerFn(retryFileIngestion);
  const removeFile = useServerFn(deleteFile);
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [folderName, setFolderName] = useState("");
  const [parentId, setParentId] = useState("");
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderPath = (folder: SpaceFolderData[number]) => {
    const names = [folder.name];
    let current = folder.parentId;
    const seen = new Set([folder.id]);
    while (current && !seen.has(current)) {
      seen.add(current);
      const parent = folderById.get(current);
      if (!parent) break;
      names.unshift(parent.name);
      current = parent.parentId;
    }
    return names.join(" / ");
  };
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selected = form.get("file");
    if (!(selected instanceof File)) return;
    const mediaType = selected.type || mediaTypeForFilename(selected.name);
    if (!mediaType) return;
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const intent = await uploadIntent({
      data: {
        filename: selected.name,
        mediaType,
        sizeBytes: selected.size,
        folderId: String(form.get("folderId") || "") || null,
        tagNames: tags,
        spaceId,
      },
    });
    await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": selected.type },
      body: selected,
    });
    await confirm({ data: { fileId: intent.fileId } });
    setNotice("Upload accepted and queued for indexing.");
    formElement.reset();
    window.location.reload();
  }
  async function addFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderName.trim()) return;
    await addFolder({ data: { name: folderName, parentId: parentId || null, spaceId } });
    setFolderName("");
    setParentId("");
    setNotice("Folder created.");
    window.location.reload();
  }
  async function downloadFile(fileId: string) {
    const result = await download({ data: { fileId } });
    window.location.assign(result.downloadUrl);
  }
  async function retry(fileId: string) {
    await retryFile({ data: { fileId } });
    setNotice("Indexing restarted.");
    window.location.reload();
  }
  async function remove(file: SpaceFileData[number]) {
    if (!window.confirm(`Delete “${file.filename}”?`)) return;
    await removeFile({ data: { fileId: file.id } });
    setNotice("File deleted.");
    await router.invalidate();
  }
  const renderFolders = (parent: string | null, depth = 0): ReactNode => (
    <ul className={depth === 0 ? styles.fileFolderTree : styles.fileFolderTreeNested}>
      {folders
        .filter((folder) => folder.parentId === parent)
        .map((folder) => (
          <li key={folder.id}>
            <div className={styles.fileFolderRow}>
              <Folder size={15} />
              <span>{folder.name}</span>
              <small>{files.filter((file) => file.folderId === folder.id).length}</small>
            </div>
            {renderFolders(folder.id, depth + 1)}
          </li>
        ))}
    </ul>
  );
  return (
    <section className={styles.filesTab}>
      <div className={styles.filesTabHead}>
        <div>
          <p className={styles.eyebrow}>Space files</p>
          <h2>Files in {spaceId ? "this space" : "the space"}</h2>
          <p className={styles.muted}>
            Organize source documents into folders and reuse them across pages.
          </p>
        </div>
        {viewerIsEditor && (
          <div className={styles.filesTabActions}>
            <form onSubmit={addFolderSubmit} className={styles.inlineFileForm}>
              <input
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="New folder"
              />
              <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">Top level</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folderPath(folder)}
                  </option>
                ))}
              </select>
              <button className={styles.detailButton}>
                <Plus size={14} />
                Folder
              </button>
            </form>
          </div>
        )}
      </div>
      {notice && <p className={styles.feedbackSuccess}>{notice}</p>}
      <div className={styles.filesTabLayout}>
        <aside className={styles.fileFolderPanel}>
          <h3>Folders</h3>
          {renderFolders(null)}
          <div className={styles.fileFolderRow}>
            <Folder size={15} />
            <span>Unfiled</span>
            <small>{files.filter((file) => !file.folderId).length}</small>
          </div>
        </aside>
        <section className={styles.fileListing}>
          <div className={styles.fileListingHead}>
            <h3>
              All files <span>({files.length})</span>
            </h3>
            {viewerIsEditor && (
              <form onSubmit={upload} className={styles.fileUploadForm}>
                <label className={styles.detailButton}>
                  <Upload size={14} />
                  Upload
                  <input
                    name="file"
                    type="file"
                    accept=".pdf,.docx,.odt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text"
                    required
                  />
                </label>
                <input name="tags" placeholder="labels, comma separated" />
                <select name="folderId">
                  <option value="">Unfiled</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folderPath(folder)}
                    </option>
                  ))}
                </select>
                <button className={styles.detailPrimaryButton}>Add file</button>
              </form>
            )}
          </div>
          {files.length === 0 ? (
            <p className={styles.muted}>No files have been uploaded to this space.</p>
          ) : (
            <div className={styles.fileListingRows}>
              {files.map((file) => (
                <div className={styles.spaceFileRow} key={file.id}>
                  <FileText size={17} />
                  <div className={styles.spaceFileMain}>
                    <b>{file.filename}</b>
                    <small>
                      {file.folderName ?? "Unfiled"} ·{" "}
                      {relativeTime(file.createdAt)}
                    </small>
                  </div>
                  <IngestionStatus
                    status={file.status}
                    error={file.error}
                    onRetry={viewerIsEditor && file.status === "failed" ? () => { void retry(file.id); } : undefined}
                  />
                  <div className={styles.fileLabels}>
                    {file.tags.map((tag) => (
                      <em key={tag}>{tag}</em>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.detailIconButton}
                    aria-label={`Download ${file.filename}`}
                    onClick={() => {
                      void downloadFile(file.id);
                    }}
                  >
                    <Download size={14} />
                  </button>
                  {viewerIsEditor && <button type="button" className={styles.detailButton} onClick={() => { void remove(file); }}><Trash2 size={14} />Delete</button>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function renderTree(
  parentId: string | null,
  pages: SpacePageData,
  collapsed: Set<string>,
  toggle: (id: string) => void,
): ReactNode {
  const branch = pages
    .filter((page) => page.parentPageId === parentId)
    .sort((a, b) => a.title.localeCompare(b.title));
  if (branch.length === 0) return null;
  return (
    <ul className={styles.treeList}>
      {branch.map((page) => {
        const hasChildren = pages.some((child) => child.parentPageId === page.id);
        return (
          <li key={page.id}>
            <div className={styles.treeRow}>
              <button
                type="button"
                className={`${styles.treeTwist} ${!hasChildren ? styles.treeTwistHidden : ""}`}
                onClick={() => toggle(page.id)}
                aria-label={collapsed.has(page.id) ? "Expand page" : "Collapse page"}
              >
                {hasChildren && <ChevronDown size={14} />}
              </button>
              <Link to="/spaces/$slug" params={{ slug: page.slug }}>
                <FileText size={14} />
                <span>{page.title}</span>
              </Link>
            </div>
            {hasChildren &&
              !collapsed.has(page.id) &&
              renderTree(page.id, pages, collapsed, toggle)}
          </li>
        );
      })}
    </ul>
  );
}
function PageRow({
  page,
  pages,
  depth,
}: {
  page: SpacePageItem;
  pages: SpacePageData;
  depth: number;
}) {
  return (
    <Link
      className={styles.pageRow}
      style={{ paddingLeft: 8 + depth * 22 }}
      to="/spaces/$slug"
      params={{ slug: page.slug }}
    >
      <FileText className={styles.pageDocumentIcon} size={15} />
      <span className={styles.pageMain}>
        <span className={styles.pageTitle}>{page.title}</span>
        {depth > 0 && <span className={styles.pagePath}>{pagePath(page, pages)}</span>}
      </span>
      <IngestionStatus status={page.ingestionStatus} error={page.ingestionError} />
      <span className={styles.pageAuthor}>
        <span className={styles.miniAvatar}>{initials(page.author)}</span>
        {page.author}
      </span>
      <span className={styles.pageTime}>{relativeTime(page.updatedAt)}</span>
    </Link>
  );
}
function pageDepth(page: SpacePageItem, pages: SpacePageData) {
  let depth = 0;
  let current = page;
  const visited = new Set<string>();
  while (current.parentPageId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = pages.find((candidate) => candidate.id === current.parentPageId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return Math.min(depth, 2);
}
function pagePath(page: SpacePageItem, pages: SpacePageData) {
  const path: string[] = [];
  let current = page;
  const visited = new Set<string>();
  while (current.parentPageId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = pages.find((candidate) => candidate.id === current.parentPageId);
    if (!parent) break;
    path.unshift(parent.title);
    current = parent;
  }
  return path.join(" / ");
}
function includeAncestors(matches: SpacePageData, pages: SpacePageData) {
  const ids = new Set(matches.map((page) => page.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages)
      if (ids.has(page.id) && page.parentPageId && !ids.has(page.parentPageId)) {
        ids.add(page.parentPageId);
        changed = true;
      }
  }
  return pages.filter((page) => ids.has(page.id));
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function mediaTypeForFilename(filename: string): 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'application/vnd.oasis.opendocument.text' | undefined {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extension === 'odt') return 'application/vnd.oasis.opendocument.text';
  return undefined;
}
