# End-to-end feature matrix

This is the Playwright coverage inventory. Each independent user-visible behavior should have a corresponding `.spec.ts` test. Features that require a signed-in user are marked `authenticated` and need deterministic test-session/database fixtures.

## Shared application features

- Global document shell renders the active route and footer.
- Footer links to Terms of Service.
- Docent brand navigates to the home page.
- Unauthenticated navigation presents Google sign-in.
- Authenticated navigation exposes Spaces, Create page, Conversations, conversation search, and the account menu.
- Account menu opens/closes, displays identity, and signs out.

## `/`

- Hero content and knowledge-graph illustration render.
- Unauthenticated state displays the Google sign-in action.
- Authenticated state displays the question composer.
- Composer sends on button click.
- Composer sends on Enter.
- Sent question navigates to Chat with the query in the URL.
- Authenticated state displays recently updated pages.
- Recently updated page cards navigate to their page.

## `/terms`

- Terms of Service page renders its title and effective date.
- Terms sections render: use, content/access, acceptable use, availability/changes, and contact.
- Breadcrumb navigates back to Docent.

## `/spaces`

- Unauthenticated state explains that sign-in is required.
- Authenticated state loads spaces.
- Space search filters by name and description.
- Empty search results are communicated.
- Grid/list view toggle changes the presentation.
- Editor can open and cancel the create-space form.
- Editor can create a space with name, description, and icon.
- Space creation validation/error feedback renders.
- Space cards display metadata, favorite state, page count, and relative update time.
- Space cards navigate to the space detail page.
- Editor can navigate to Create page.

## `/spaces/new`

- Unauthenticated state requires sign-in.
- Non-editor state explains the permission restriction.
- Editor state loads spaces and parent pages.
- Space selection reloads available parent pages.
- Parent-page selection is available.
- Title and markdown editor accept input.
- Formatting toolbar inserts bold, italic, heading, list, link, code, and quote markup.
- Split, write, and preview modes switch the editor view.
- Breadcrumb and Cancel navigate away.
- Publish validates a selected space and creates a page.
- Publish failure displays feedback.

## `/spaces/space/:slug`

- Unauthenticated state provides a sign-in action.
- Authenticated state loads space metadata, pages, files, and folders.
- Pages/files tab navigation works.
- Page search filters results.
- Page sorting supports tree, updated, and name order.
- Page tree supports collapsing/expanding nodes.
- Page navigation opens a page detail view.
- Editor can favorite/unfavorite the space.
- Editor can open, edit, save, and cancel space metadata editing.
- Editor can move pages and receives validation errors.
- File view supports folder selection and folder navigation.
- Editor can create, rename/move, and delete folders.
- Editor can upload a file, confirm it, and see upload/indexing status.
- Editor can download, preview, retry ingestion, and delete files.
- File preview modal opens and closes.

## `/spaces/:slug`

- Unauthenticated state redirects to home.
- Authenticated state loads page content, revisions, attachments, files, and sibling pages.
- Page content renders markdown.
- Page edit mode opens and can be cancelled.
- Page title and markdown can be updated.
- Save queues a new revision and shows feedback.
- Revision history is displayed.
- Revision restore asks for confirmation and creates a new current revision.
- Page deletion asks for confirmation and navigates away.
- Page ingestion can be retried.
- Existing files can be attached and detached.
- File attachments can be uploaded.
- File previews open in the preview modal.
- Ingestion status and retry controls render.

## `/chat`

- Unauthenticated state explains sign-in requirement.
- Authenticated state loads conversation history.
- Conversation search filters history.
- New conversation clears the active conversation.
- Question composer submits a question.
- Query-string questions auto-submit.
- Loading state renders while answering.
- Assistant answer and citations render.
- Citation links navigate to page sources.
- File citations open file preview.
- Conversation selection loads its messages.
- Conversation deletion asks for confirmation and removes the conversation.
- Chat errors render as feedback.

## Server routes

- `/auth/google` returns a configuration error when OAuth is not configured, otherwise redirects to Google.
- `/auth/google/callback` rejects missing/cancelled OAuth parameters.
- `/auth/logout` clears the session and redirects home.
- `/api/ingestion` rejects missing/invalid Cloud Tasks identity and payloads.
