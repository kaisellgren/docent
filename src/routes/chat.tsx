import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { ArrowUp, BookOpen, Clock3, MessageSquare, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { askDocent, deleteConversation, getConversationMessages, getConversations } from "@/features/chat/server";
import { currentSession } from "@/server/auth";
import { TopNavigation } from "@/components/navigation";
import * as styles from "@/styles/app.css";

const getViewer = createServerFn({ method: "GET" }).handler(() => currentSession());
type Conversation = Awaited<ReturnType<typeof getConversations>>[number];
type Messages = Awaited<ReturnType<typeof getConversationMessages>>;
type Citation = Messages[number]["citations"][number];
type Reference = { messageId: string; citation: Citation };

export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
    conversationId: typeof search.conversationId === "string" ? search.conversationId : "",
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const viewer = await getViewer();
    if (!viewer) return { viewer, conversations: [], messages: [] };
    return {
      viewer,
      conversations: await getConversations(),
      messages: deps.conversationId
        ? await getConversationMessages({ data: { conversationId: deps.conversationId } })
        : [],
    };
  },
  component: ChatPage,
});

function ChatPage() {
  const { q, conversationId } = Route.useSearch();
  const { viewer, conversations, messages } = Route.useLoaderData();
  const ask = useServerFn(askDocent);
  const removeConversation = useServerFn(deleteConversation);
  const router = useRouter();
  const [question, setQuestion] = useState(q);
  const [conversationQuery, setConversationQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [optimisticMessage, setOptimisticMessage] = useState<Messages[number] | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const autoSentQuestionRef = useRef("");

  useEffect(() => {
    setQuestion(q);
    setError("");
  }, [q, conversationId]);

  useEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [question]);

  useEffect(() => {
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }, [conversationId, q]);

  useEffect(() => {
    const message = q.trim();
    if (!message || autoSentQuestionRef.current === message) return;
    autoSentQuestionRef.current = message;
    void sendQuestion(message);
  }, [q]);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    requestAnimationFrame(() => {
      messagesElement.scrollTo({ top: messagesElement.scrollHeight, behavior: "smooth" });
    });
  }, [messages, loading]);

  const activeConversation = conversations.find((conversation) => conversation.id === conversationId);
  const visibleConversations = conversations.filter((conversation) => conversation.title.toLowerCase().includes(conversationQuery.toLowerCase().trim()));
  const references = useMemo(() => uniqueReferences(messages), [messages]);
  const displayedMessages = optimisticMessage ? [...messages, optimisticMessage] : messages;

  async function sendQuestion(message: string) {
    if (!message || loading) return;
    setLoading(true);
    setError("");
    setQuestion("");
    setOptimisticMessage({ id: `optimistic-${Date.now()}`, role: "user", content: message, createdAt: new Date().toISOString(), citations: [] });
    try {
      const result = await ask({ data: { message, conversationId: conversationId || undefined } });
      setOptimisticMessage(null);
      await router.navigate({ to: "/chat", search: { q: "", conversationId: result.conversationId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Docent could not answer right now.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendQuestion(question.trim());
  }

  async function newConversation() {
    setQuestion("");
    setError("");
    await router.navigate({ to: "/chat", search: { q: "", conversationId: "" } });
  }

  async function deleteSelectedConversation(id: string) {
    if (!window.confirm("Delete this conversation?")) return;
    setError("");
    try {
      await removeConversation({ data: { conversationId: id } });
      if (id === conversationId) {
        await router.navigate({ to: "/chat", search: { q: "", conversationId: "" } });
      } else {
        await router.invalidate();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Conversation could not be deleted.");
    }
  }

  return (
    <div className={styles.chatPage}>
      <TopNavigation viewer={viewer} />
      {!viewer ? (
        <main className={styles.chatUnauthenticated}>
          <div className={styles.chatWelcomeIcon}><Sparkles size={22} /></div>
          <h1>Ask Docent</h1>
          <p>Search your team’s spaces and get answers with source pages attached.</p>
          <a className={styles.primaryButton} href="/auth/google">Sign in to ask Docent</a>
        </main>
      ) : (
        <main className={`${styles.shell} ${styles.chatWorkspace}`}>
          <aside className={styles.chatHistory}>
            <div className={styles.chatHistoryHead}>
              <div>
                <span className={styles.chatKicker}>Knowledge chat</span>
                <h1 className={styles.chatHistoryHeadTitle}>Conversations</h1>
              </div>
              <button type="button" className={styles.chatNewButton} onClick={() => { void newConversation(); }} aria-label="New conversation">
                <Plus size={16} />
              </button>
            </div>
            <label className={styles.chatHistorySearch}>
              <Search size={14} aria-hidden="true" />
              <input className={styles.chatHistorySearchInput} value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} placeholder="Find a conversation" aria-label="Find a conversation" />
            </label>
            <div className={styles.chatConversationList}>
              {visibleConversations.length === 0 ? (
                <p className={styles.chatEmptyHistory}>Your conversations will appear here.</p>
              ) : visibleConversations.map((conversation) => (
                <ConversationButton
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === conversationId}
                  onClick={() => { setQuestion(""); void router.navigate({ to: "/chat", search: { q: "", conversationId: conversation.id } }); }}
                  onDelete={() => { void deleteSelectedConversation(conversation.id); }}
                />
              ))}
            </div>
            <div className={styles.chatHistoryFoot}>
              <BookOpen size={14} />
              <span>Answers are grounded in your spaces.</span>
            </div>
          </aside>

          <section className={styles.chatMain}>
            <header className={styles.chatMainHead}>
              <div>
                <span className={styles.chatKicker}>Docent assistant</span>
                <h2 className={styles.chatMainTitle}>{activeConversation?.title ?? "New conversation"}</h2>
              </div>
              <span className={styles.chatStatus}><span className={styles.chatStatusDot} /> Ready</span>
            </header>
            <div className={styles.chatMessages} ref={messagesRef}>
              {displayedMessages.length === 0 && !loading ? (
                <div className={styles.chatIntro}>
                  <div className={styles.chatIntroIcon}><Sparkles size={20} /></div>
                  <h2 className={styles.chatIntroTitle}>What would you like to find?</h2>
                  <p className={styles.chatIntroText}>Ask about a policy, project, decision, or owner. Docent will show the pages it used.</p>
                  <div className={styles.chatSuggestions}>
                    {['What changed recently?', 'Who owns this project?', 'Summarize our on-call policy'].map((suggestion) => (
                      <button className={styles.chatSuggestion} key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>{suggestion}</button>
                    ))}
                  </div>
                </div>
              ) : displayedMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {loading && <div className={styles.chatThinking} role="status" aria-live="polite"><span className={styles.chatThinkingIcon}><Sparkles size={15} /></span><span className={styles.chatThinkingDots}><i className={styles.chatThinkingDot} /><i className={styles.chatThinkingDot} /><i className={styles.chatThinkingDot} /></span><span>Docent is weaving an answer…</span></div>}
            </div>
            <form className={styles.chatComposer} onSubmit={submit}>
              <textarea
                className={styles.chatComposerInput}
                ref={composerInputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about your team’s knowledge…"
                aria-label="Ask Docent"
                rows={1}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              />
              <button className={styles.chatComposerButton} type="submit" disabled={loading || !question.trim()} aria-label="Send question">
                <ArrowUp size={17} />
              </button>
              <small className={styles.chatComposerHint}>Enter to send · Shift + Enter for a new line</small>
            </form>
            {error && <p className={styles.feedbackError} role="alert">{error}</p>}
          </section>

          <aside className={styles.chatReferences}>
            <div className={styles.chatReferencesHead}>
              <div><span className={styles.chatKicker}>Grounding</span><h2>References</h2></div>
              <span>{references.length}</span>
            </div>
            {references.length === 0 ? (
              <div className={styles.chatReferenceEmpty}><BookOpen size={18} /><p>Sources used by Docent will appear here.</p></div>
            ) : (
              <div className={styles.chatReferenceList}>
                {references.map((reference) => <ReferenceCard key={referenceId(reference.messageId, reference.citation)} reference={reference} />)}
              </div>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}

function ConversationButton({ conversation, active, onClick, onDelete }: { conversation: Conversation; active: boolean; onClick: () => void; onDelete: () => void }) {
  return (
    <div className={styles.chatConversationRow}>
      <button type="button" className={active ? styles.chatConversationActive : styles.chatConversation} onClick={onClick}>
        <MessageSquare size={15} />
        <span><strong className={styles.chatConversationTitle}>{conversation.title}</strong><small className={styles.chatConversationMeta}><Clock3 size={11} />{formatDate(conversation.updatedAt)}</small></span>
      </button>
      <button type="button" className={styles.chatConversationDelete} onClick={onDelete} aria-label={`Delete ${conversation.title}`} title="Delete conversation">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: Messages[number] }) {
  const assistant = message.role === "assistant";
  return (
    <article className={assistant ? styles.chatMessageAssistant : styles.chatMessageUser}>
      <div className={styles.chatMessageLabel}>{assistant ? <><Sparkles size={14} /> Docent</> : "You"}</div>
      <div className={assistant ? styles.chatMessageBody : styles.chatMessageUserBody}>
        {assistant ? <CitedText text={message.content} messageId={message.id} citations={message.citations} /> : <p>{message.content}</p>}
      </div>
      {assistant && message.citations.length > 0 && (
        <div className={styles.chatMessageReferences}>
          {message.citations.map((citation) => <a className={styles.chatMessageReferenceLink} key={citation.number} href={`#${referenceId(message.id, citation)}`}>[{citation.number}] {citation.title}</a>)}
        </div>
      )}
    </article>
  );
}

function CitedText({ text, messageId, citations }: { text: string; messageId: string; citations: Citation[] }) {
  const paragraphs = text.split(/\n\s*\n/);
  return <>{paragraphs.map((paragraph, index) => <p key={`${messageId}-${index}`}>{renderCitations(paragraph, messageId, citations)}</p>)}</>;
}

function renderCitations(text: string, messageId: string, citations: Citation[]): ReactNode[] {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, index) => {
    const match = /^\[(\d+)\]$/.exec(part);
    const citation = match ? citations.find((item) => item.number === Number(match[1])) : undefined;
    return match && citation ? <a className={styles.chatInlineCitation} href={`#${referenceId(messageId, citation)}`} key={`${messageId}-citation-${index}`}>{part}</a> : part;
  });
}

function ReferenceCard({ reference }: { reference: Reference }) {
  const { messageId, citation } = reference;
  return (
    <article id={referenceId(messageId, citation)} className={styles.chatReferenceCard}>
      <span className={styles.chatReferenceNumber}>[{citation.number}]</span>
      {citation.slug ? <a className={styles.chatReferenceLink} href={`/spaces/${citation.slug}`}><strong>{citation.title}</strong></a> : <strong className={styles.chatReferenceLink}>{citation.title}</strong>}
      <p className={styles.chatReferenceText}>{citation.excerpt}</p>
    </article>
  );
}

function uniqueReferences(messages: Messages): Reference[] {
  const references: Reference[] = [];
  for (const message of messages) for (const citation of message.citations) {
    references.push({ messageId: message.id, citation });
  }
  return references;
}

function referenceId(messageId: string, citation: Citation) {
  return `reference-${messageId}-${citation.number}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
