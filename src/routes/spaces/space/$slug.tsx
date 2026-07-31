import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  Download,
  File as FileIcon,
  FileText,
  Folder,
  Pencil,
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
  deleteFolder,
  getDownloadUrl,
  getSpaceFiles,
  getSpaceFolders,
  moveFolder,
  deleteFile,
  retryFileIngestion,
} from "@/features/files/server";
import { getSpace, getSpacePages, movePage, toggleSpaceFavorite, updateSpace } from "@/features/wiki/server";
import { TopNavigation } from "@/components/navigation";
import { SPACE_ICON_OPTIONS, SpaceIcon, type SpaceIconName } from "@/components/space-icon";
import { FancySelect } from "@/components/fancy-select";
import { IngestionStatus } from "@/components/ingestion-status";
import { currentSession } from "@/server/auth";
import * as styles from "@/styles/app.css";

const getViewer = createServerFn({ method: "GET" }).handler(() => currentSession());
type SpacePageData = Awaited<ReturnType<typeof getSpacePages>>;
type SpacePageItem = SpacePageData[number];
type SpaceFileData = Awaited<ReturnType<typeof getSpaceFiles>>;
type SpaceFolderData = Awaited<ReturnType<typeof getSpaceFolders>>;

export const Route = createFileRoute("/spaces/space/$slug")({
  validateSearch: z.object({ tab: z.enum(["pages", "files"]).optional().default("pages"), folder: z.string().uuid().optional() }),
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
  const router = useRouter();
  const toggleFavorite = useServerFn(toggleSpaceFavorite);
  const movePageFn = useServerFn(movePage);
  const saveSpace = useServerFn(updateSpace);
  const { tab } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"tree" | "updated" | "name">("tree");
  const [starred, setStarred] = useState(space?.isFavorite ?? false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);
  const [editingSpace, setEditingSpace] = useState(false);
  const [spaceName, setSpaceName] = useState(space?.name ?? "");
  const [spaceDescription, setSpaceDescription] = useState(space?.description ?? "");
  const [spaceIcon, setSpaceIcon] = useState<SpaceIconName>(space?.icon ?? "book-open");

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
    if (sort === "name") result.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "tree") return flattenPageTree(result);
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
  async function movePageTo(pageId: string, destinationParentId: string) {
    try {
      await movePageFn({ data: { pageId, destinationParentId } });
      await router.invalidate();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "Page could not be moved.");
    } finally {
      setDraggedPageId(null);
      setDropTargetPageId(null);
    }
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
  async function saveSpaceChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!space) return;
    await saveSpace({ data: { spaceId: space.id, name: spaceName, description: spaceDescription, icon: spaceIcon } });
    setEditingSpace(false);
    await router.invalidate();
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
            {viewer.isEditor && <button type="button" className={styles.pageActionButton} onClick={() => setEditingSpace((value) => !value)}><Pencil size={13} />{editingSpace ? "Cancel" : "Edit space"}</button>}
          </div>
        </div>
      </div>
      <main className={styles.shell}>
        <section className={styles.spaceHeader}>
          {editingSpace && <form className={styles.spaceCreateForm} onSubmit={saveSpaceChanges}>
            <input className={styles.spacesFormInput} value={spaceName} onChange={(event) => setSpaceName(event.target.value)} aria-label="Space name" required />
            <input className={styles.spacesFormInput} value={spaceDescription} onChange={(event) => setSpaceDescription(event.target.value)} aria-label="Space description" required />
            <FancySelect value={spaceIcon} onChange={(value) => setSpaceIcon(value as SpaceIconName)} options={SPACE_ICON_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} />
            <button className={styles.detailPrimaryButton}>Save changes</button>
          </form>}
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
                {renderTree(null, treePages, collapsed, toggleCollapsed, viewer.isEditor, draggedPageId, dropTargetPageId, setDraggedPageId, setDropTargetPageId, movePageTo)}
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
                  <FancySelect value={sort} onChange={(value) => setSort(value as typeof sort)} options={[{ value: "tree", label: "Sort: Tree order" }, { value: "updated", label: "Sort: Recently updated" }, { value: "name", label: "Sort: Name A–Z" }]} className={styles.detailSort} />
                </div>
              </div>
              <div className={styles.pageList}>
                {orderedPages.map((page) => (
                  <PageRow
                    key={page.id}
                    page={page}
                    pages={pages}
                    depth={sort === "tree" ? pageDepth(page, pages) : 0}
                    showPath={sort !== "tree"}
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
                <b>{file.filename} </b>
                <small>
                   · {relativeTime(file.createdAt)}
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
  const removeFolder = useServerFn(deleteFolder);
  const moveFolderFn = useServerFn(moveFolder);
  const download = useServerFn(getDownloadUrl);
  const retryFile = useServerFn(retryFileIngestion);
  const removeFile = useServerFn(deleteFile);
  const router = useRouter();
  const navigate = Route.useNavigate();
  const { folder: folderParam } = Route.useSearch();
  const [notice, setNotice] = useState("");
  const [folderName, setFolderName] = useState("");
  const [parentId, setParentId] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(folderParam ?? null);
  const [uploadFolderId, setUploadFolderId] = useState("");
  const [uploadFilename, setUploadFilename] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  useEffect(() => { setSelectedFolderId(folderParam ?? null); }, [folderParam]);
  function selectFolder(folderId: string | null) {
    setSelectedFolderId(folderId);
    void navigate({ search: (previous) => ({ ...previous, folder: folderId ?? undefined, tab: "files" as const }) });
  }
  const visibleFiles = selectedFolderId ? files.filter((file) => file.folderId === selectedFolderId) : files.filter((file) => !file.folderId);
  const listingFolders = folders.filter((folder) => folder.parentId === selectedFolderId);
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
    const selectedFiles = uploadFiles.length ? uploadFiles : form.getAll("file").filter((value): value is File => value instanceof File && value.size > 0);
    if (selectedFiles.length === 0) return;
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    for (const selected of selectedFiles) {
      const mediaType = selected.type || mediaTypeForFilename(selected.name);
      if (!mediaType) continue;
      const intent = await uploadIntent({ data: { filename: selected.name, mediaType, sizeBytes: selected.size, folderId: uploadFolderId || null, tagNames: tags, spaceId } });
      const response = await fetch(intent.uploadUrl, { method: "PUT", headers: { "Content-Type": mediaType }, body: selected });
      if (!response.ok) throw new Error(`Could not upload ${selected.name}.`);
      await confirm({ data: { fileId: intent.fileId } });
    }
    setNotice("Upload accepted and queued for indexing.");
    formElement.reset();
    setUploadFolderId("");
    setUploadFilename("");
    setUploadFiles([]);
    setUploadDragging(false);
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
  async function removeFolderAndRefresh(folder: SpaceFolderData[number]) {
    if (!window.confirm(`Delete folder “${folder.name}”?`)) return;
    try {
      await removeFolder({ data: { folderId: folder.id } });
      if (selectedFolderId === folder.id) selectFolder(null);
      setNotice("Folder deleted.");
      await router.invalidate();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Folder could not be deleted.");
    }
  }
  async function moveFolderTo(folderId: string, destinationParentId: string | null) {
    try {
      await moveFolderFn({ data: { folderId, destinationParentId } });
      setNotice("Folder moved.");
      await router.invalidate();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Folder could not be moved.");
    } finally {
      setDraggedFolderId(null);
      setDropTargetFolderId(null);
    }
  }
  const renderFolders = (parent: string | null, depth = 0): ReactNode => (
    <ul className={depth === 0 ? styles.fileFolderTree : styles.fileFolderTreeNested}>
      {folders
        .filter((folder) => folder.parentId === parent)
        .map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              draggable={viewerIsEditor}
              className={`${selectedFolderId === folder.id ? styles.fileFolderRowSelected : styles.fileFolderButton} ${dropTargetFolderId === folder.id ? styles.fileFolderRowDropTarget : ""}`}
              onClick={() => selectFolder(folder.id)}
              onDragStart={() => setDraggedFolderId(folder.id)}
              onDragOver={(event) => { if (draggedFolderId && draggedFolderId !== folder.id) { event.preventDefault(); setDropTargetFolderId(folder.id); } }}
              onDragLeave={() => setDropTargetFolderId(null)}
              onDrop={(event) => { event.preventDefault(); if (draggedFolderId && draggedFolderId !== folder.id) void moveFolderTo(draggedFolderId, folder.id); }}
              onDragEnd={() => { setDraggedFolderId(null); setDropTargetFolderId(null); }}
            >
              <Folder size={15} />
              <span>{folder.name}</span>
              <small>{files.filter((file) => file.folderId === folder.id).length}</small>
            </button>
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
              <FancySelect value={parentId} onChange={setParentId} options={[{ value: "", label: "Top level" }, ...folders.map((folder) => ({ value: folder.id, label: folderPath(folder) }))]} />
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
          <button
            type="button"
            className={`${selectedFolderId === null ? styles.fileFolderRowSelected : styles.fileFolderButton} ${dropTargetFolderId === "__root__" ? styles.fileFolderRowDropTarget : ""}`}
            onClick={() => selectFolder(null)}
            onDragOver={(event) => { if (draggedFolderId) { event.preventDefault(); setDropTargetFolderId("__root__"); } }}
            onDragLeave={() => setDropTargetFolderId(null)}
            onDrop={(event) => { event.preventDefault(); if (draggedFolderId) void moveFolderTo(draggedFolderId, null); }}
          >
            <SpaceIcon name="compass" size={15} />
            <span>Space</span>
          </button>
          {renderFolders(null)}
        </aside>
        <section className={styles.fileListing}>
          <div className={styles.fileListingHead}>
            <h3>{selectedFolderId ? folderById.get(selectedFolderId)?.name ?? "Folder" : "Space"} <span>({visibleFiles.length})</span></h3>
            {viewerIsEditor && (
              <form onSubmit={upload} className={`${styles.fileUploadForm} ${uploadDragging ? styles.fileUploadFormDragging : ""}`} onDragEnter={(event) => { event.preventDefault(); setUploadDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setUploadDragging(false); }} onDrop={(event) => { event.preventDefault(); setUploadDragging(false); const files = [...event.dataTransfer.files]; setUploadFiles(files); setUploadFilename(files.map((file) => file.name).join(", ")); }}>
                <label className={styles.detailButton}>
                  <Upload size={14} />
                  <span className={styles.fileUploadName}>{uploadFilename || "Choose file"}</span>
                  <input
                    name="file"
                    type="file"
                    accept=".pdf,.docx,.odt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text"
                    multiple
                    onChange={(event) => { const files = [...(event.target.files ?? [])]; setUploadFiles(files); setUploadFilename(files.map((file) => file.name).join(", ")); }}
                  />
                </label>
                <input name="tags" placeholder="labels, comma separated" />
                <FancySelect name="folderId" value={uploadFolderId} onChange={setUploadFolderId} options={[{ value: "", label: "No folder" }, ...folders.map((folder) => ({ value: folder.id, label: folderPath(folder) }))]} />
                <button className={styles.detailPrimaryButton}>Add file</button>
              </form>
            )}
          </div>
          {files.length === 0 ? (
            <p className={styles.muted}>No files have been uploaded to this space.</p>
          ) : (
            <>
              <div className={styles.fileListingFolders}>
                {listingFolders.map((folder) => (
                  <div className={styles.fileListingFolderRow} key={folder.id}>
                    <button type="button" className={selectedFolderId === folder.id ? styles.fileListingFolderButtonSelected : styles.fileListingFolderButton} onClick={() => selectFolder(folder.id)}><Folder size={15} /><span>{folder.name}</span></button>
                    {viewerIsEditor && <button type="button" className={styles.fileListingFolderDelete} aria-label={`Delete folder ${folder.name}`} onClick={() => { void removeFolderAndRefresh(folder); }}><Trash2 size={14} /></button>}
                  </div>
                ))}
              </div>
              <div className={styles.fileListingRows}>
              {visibleFiles.map((file) => (
                <div className={styles.spaceFileRow} key={file.id}>
                  <FileText size={17} />
                  <div className={styles.spaceFileMain}>
                    <b>{file.filename}</b>
                    <small>
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
              {visibleFiles.length === 0 && <p className={styles.muted}>No files in this folder.</p>}
              </div>
            </>
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
  viewerIsEditor: boolean,
  draggedPageId: string | null,
  dropTargetPageId: string | null,
  setDraggedPageId: (id: string | null) => void,
  setDropTargetPageId: (id: string | null) => void,
  movePageTo: (pageId: string, destinationParentId: string) => void,
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
            <div
              className={`${styles.treeRow} ${dropTargetPageId === page.id ? styles.treeRowDropTarget : ""}`}
              draggable={viewerIsEditor}
              onDragStart={() => setDraggedPageId(page.id)}
              onDragOver={(event) => { if (draggedPageId && draggedPageId !== page.id) { event.preventDefault(); setDropTargetPageId(page.id); } }}
              onDragLeave={() => setDropTargetPageId(null)}
              onDrop={(event) => { event.preventDefault(); if (draggedPageId && draggedPageId !== page.id) movePageTo(draggedPageId, page.id); }}
              onDragEnd={() => { setDraggedPageId(null); setDropTargetPageId(null); }}
            >
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
              renderTree(page.id, pages, collapsed, toggle, viewerIsEditor, draggedPageId, dropTargetPageId, setDraggedPageId, setDropTargetPageId, movePageTo)}
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
  showPath,
}: {
  page: SpacePageItem;
  pages: SpacePageData;
  depth: number;
  showPath: boolean;
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
        {showPath && page.parentPageId && <span className={styles.pagePath}>{pagePath(page, pages)}</span>}
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
function flattenPageTree(pages: SpacePageData): SpacePageItem[] {
  const children = new Map<string | null, SpacePageItem[]>();
  for (const page of pages) {
    const branch = children.get(page.parentPageId) ?? [];
    branch.push(page);
    children.set(page.parentPageId, branch);
  }
  for (const branch of children.values()) branch.sort((a, b) => a.title.localeCompare(b.title));
  const result: SpacePageItem[] = [];
  function visit(parentId: string | null) {
    for (const page of children.get(parentId) ?? []) {
      result.push(page);
      visit(page.id);
    }
  }
  visit(null);
  for (const page of pages) if (!result.includes(page)) result.push(page);
  return result;
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
