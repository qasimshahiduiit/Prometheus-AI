'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import MessageView from './Message';
import Composer from './Composer';
import PreviewPanel from './PreviewPanel';
import type { Attachment, ChatSummary, Message, Mode, Source, User } from './types';

const WELCOME = [
  { plain: 'Speak, and the', accent: 'substrate listens.' },
  { plain: 'What shall we', accent: 'architect today?' },
  { plain: 'Bring me your best', accent: 'and worst ideas.' },
  { plain: "Let's separate signal", accent: 'from noise.' },
  { plain: 'Ready when you are,', accent: 'architect.' },
  { plain: 'Pose the question.', accent: "I'll do the rest." },
];

const STATIC_SUGGESTIONS = [
  'Roast my startup idea, no mercy',
  "What's the latest in AI this week?",
  'Generate a moody editorial poster',
  'Explain async/await like I’m sharp',
];

let toastSeq = 0;

export default function ChatApp({ user }: { user: User }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [welcomeIdx, setWelcomeIdx] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>(STATIC_SUGGESTIONS);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ code: string; language: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toast = useCallback((text: string, kind = 'error') => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const loadChats = useCallback(async () => {
    const res = await fetch('/api/chats');
    if (res.ok) setChats((await res.json()).chats);
  }, []);

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await fetch('/api/suggestions');
      if (!res.ok) throw new Error('Suggestions unavailable');
      const data = await res.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length === 4) {
        setSuggestions(data.suggestions);
      }
    } catch {
      // STATIC_SUGGESTIONS already loaded as fallback.
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
    setWelcomeIdx(Math.floor(Math.random() * WELCOME.length));
  }, [loadChats]);

  // Refresh the AI-generated suggestion cards every time the welcome screen is shown.
  useEffect(() => {
    if (messages.length === 0) loadSuggestions();
  }, [messages.length, loadSuggestions]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function selectChat(id: string) {
    if (streaming) return;
    setActiveChatId(id);
    const res = await fetch(`/api/chats/${id}`);
    if (res.ok) setMessages((await res.json()).messages);
  }

  function newChat() {
    if (streaming) return;
    setActiveChatId(null);
    setMessages([]);
    setMobileOpen(false);
  }

  async function ensureChat(): Promise<string> {
    if (activeChatId) return activeChatId;
    const res = await fetch('/api/chats', { method: 'POST' });
    const { chat } = await res.json();
    setChats((c) => [chat, ...c]);
    setActiveChatId(chat.id);
    return chat.id;
  }

  const upsertAssistant = (patch: Partial<Message>) =>
    setMessages((msgs) => {
      const next = [...msgs];
      const last = next[next.length - 1];
      if (last && last.role === 'assistant') next[next.length - 1] = { ...last, ...patch };
      return next;
    });

  const appendAssistant = (text: string) =>
    setMessages((msgs) => {
      const next = [...msgs];
      const last = next[next.length - 1];
      if (last && last.role === 'assistant')
        next[next.length - 1] = { ...last, content: last.content + text };
      return next;
    });

  async function streamAssistantResponse(
    chatId: string,
    text: string,
    attachmentIds: string[]
  ) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: text, attachmentIds }),
    });
    if (!res.ok || !res.body) throw new Error('The substrate refused the connection.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        let evt: any;
        try {
          evt = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (evt.type === 'meta') {
          upsertAssistant({ mode: evt.mode as Mode, sources: (evt.sources as Source[]) || [] });
        } else if (evt.type === 'delta') {
          appendAssistant(evt.text);
        } else if (evt.type === 'image') {
          upsertAssistant({ imageUrl: evt.url });
        } else if (evt.type === 'title') {
          setChats((c) =>
            c.map((x) => (x.id === chatId ? { ...x, title: (evt.title as string) || x.title } : x))
          );
        } else if (evt.type === 'done') {
          upsertAssistant({
            streaming: false,
            mode: evt.mode as Mode,
            sources: (evt.sources as Source[]) || [],
            imageUrl: evt.imageUrl || undefined,
          });
        } else if (evt.type === 'error') {
          toast(evt.message);
          upsertAssistant({ streaming: false });
        }
      }
    }
  }

  async function send(text: string, attachments: Attachment[]) {
    if (streaming) return;
    const chatId = await ensureChat();
    setStreaming(true);

    const userMsg: Message = {
      id: 'u' + Date.now(),
      role: 'user',
      content: text,
      attachments,
    };
    const assistantMsg: Message = {
      id: 'a' + Date.now(),
      role: 'assistant',
      content: '',
      streaming: true,
      sources: [],
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);

    try {
      await streamAssistantResponse(chatId, text, attachments.map((a) => a.id));
      upsertAssistant({ streaming: false });
    } catch (e: any) {
      toast(e.message || 'Connection lost.');
      upsertAssistant({ streaming: false });
    } finally {
      setStreaming(false);
      loadChats();
    }
  }

  async function regenerate(assistantMsgId: string) {
    if (streaming) return;
    const idx = messages.findIndex((m) => m.id === assistantMsgId);
    if (idx <= 0 || !activeChatId) return;
    let userMsg: Message | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMsg = messages[i];
        break;
      }
    }
    if (!userMsg) return;

    setStreaming(true);
    const assistantMsg: Message = {
      id: 'a' + Date.now(),
      role: 'assistant',
      content: '',
      streaming: true,
      sources: [],
    };
    setMessages((m) => [...m, assistantMsg]);

    try {
      await streamAssistantResponse(
        activeChatId,
        userMsg.content,
        (userMsg.attachments || []).map((a) => a.id)
      );
      upsertAssistant({ streaming: false });
    } catch (e: any) {
      toast(e.message || 'Connection lost.');
      upsertAssistant({ streaming: false });
    } finally {
      setStreaming(false);
      loadChats();
    }
  }

  async function archiveChat(id: string, archived: boolean) {
    setChats((c) => c.map((x) => (x.id === id ? { ...x, archived: archived ? 1 : 0 } : x)));
    await fetch(`/api/chats/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    toast(archived ? 'Conversation archived.' : 'Conversation restored.', 'success');
  }

  async function confirmDelete() {
    const id = deleteTarget;
    if (!id) return;
    setDeleteTarget(null);
    setChats((c) => c.filter((x) => x.id !== id));
    if (id === activeChatId) newChat();
    await fetch(`/api/chats/${id}`, { method: 'DELETE' });
    toast('Conversation deleted.', 'success');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const w = WELCOME[welcomeIdx];
  const activeTitle = chats.find((c) => c.id === activeChatId)?.title;
  const showWelcome = messages.length === 0;

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        chats={chats}
        activeChatId={activeChatId}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => {
          setCollapsed((c) => !c);
          // On mobile, the collapse button acts as a close button.
          if (mobileOpen) setMobileOpen(false);
        }}
        onCloseMobile={() => setMobileOpen(false)}
        onNewChat={newChat}
        onSelectChat={selectChat}
        onArchive={archiveChat}
        onDelete={(id) => setDeleteTarget(id)}
        onLogout={logout}
      />

      <main className="main">
        <header className="main-header">
          <button
            className="icon-btn mobile-only"
            style={{ width: 40, height: 40 }}
            onClick={() => {
              setCollapsed(false);
              setMobileOpen(true);
            }}
          >
            <Menu size={18} />
          </button>
          <span className="chat-title">
            {showWelcome ? 'New Conversation' : activeTitle || 'Conversation'}
          </span>
        </header>

        <div className="scroll-area" ref={scrollRef}>
          {showWelcome ? (
            <div className="welcome">
              <div className="float-shape s1" />
              <div className="float-shape s2" />
              <div className="float-shape s3" />
              <p className="eyebrow">Prometheus · The Digital Substrate</p>
              <h1>
                {w.plain} <span className="accent">{w.accent}</span>
              </h1>
              <p className="welcome-sub">
                Razor-sharp, brutally honest, and built to think. Ask anything — I decide when to
                search the web, read your files, or render an image.
              </p>
              <div className={`suggestions ${suggestionsLoading ? 'loading' : ''}`}>
                {suggestions.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    className="suggestion interactive"
                    onClick={() => send(s, [])}
                    disabled={suggestionsLoading}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread">
              {messages.map((m) => (
                <MessageView
                  key={m.id}
                  msg={m}
                  onRegenerate={m.role === 'assistant' ? () => regenerate(m.id) : undefined}
                  onRun={(code, language) => setPreview({ code, language })}
                />
              ))}
            </div>
          )}
        </div>

        <Composer disabled={streaming} onSend={send} onError={(m) => toast(m)} />
      </main>

      {/* Live HTML preview panel */}
      {preview && <PreviewPanel code={preview.code} onClose={() => setPreview(null)} />}

      {/* Toasts */}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow" style={{ marginBottom: 14 }}>Confirm</p>
            <h3>
              Delete this <span className="accent">conversation?</span>
            </h3>
            <p>This permanently removes the conversation and its messages. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--error)' }}
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
