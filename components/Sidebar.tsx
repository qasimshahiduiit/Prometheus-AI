'use client';
import { useState } from 'react';
import {
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Archive,
  ArchiveRestore,
  Trash2,
  Settings,
  LogOut,
  Flame,
} from 'lucide-react';
import type { ChatSummary, User } from './types';

interface Props {
  user: User;
  chats: ChatSummary[];
  activeChatId: string | null;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
}

export default function Sidebar(p: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const active = p.chats.filter((c) => !c.archived);
  const archived = p.chats.filter((c) => c.archived);
  const initials = p.user.name.trim().charAt(0).toUpperCase() || 'P';

  const renderItem = (c: ChatSummary) => (
    <div
      key={c.id}
      className={`chat-item interactive ${c.id === p.activeChatId ? 'active' : ''}`}
      onClick={() => {
        p.onSelectChat(c.id);
        p.onCloseMobile();
      }}
      title={c.title}
    >
      <MessageSquare size={16} style={{ flexShrink: 0 }} />
      <span className="title">{c.title}</span>
      <span className="actions">
        <button
          title={c.archived ? 'Unarchive' : 'Archive'}
          onClick={(e) => {
            e.stopPropagation();
            p.onArchive(c.id, !c.archived);
          }}
        >
          {c.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        </button>
        <button
          className="danger"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            p.onDelete(c.id);
          }}
        >
          <Trash2 size={15} />
        </button>
      </span>
    </div>
  );

  return (
    <>
      <div
        className={`sidebar-backdrop ${p.mobileOpen ? 'show' : ''}`}
        onClick={p.onCloseMobile}
      />
      <aside
        className={`sidebar ${p.collapsed ? 'collapsed' : ''} ${
          p.mobileOpen ? '' : 'mobile-hidden'
        }`}
      >
        <div className="sidebar-top">
          {!p.collapsed && (
            <div className="sidebar-logo hide-collapsed">
              Prome<span className="spark">theus</span>
            </div>
          )}
          {p.collapsed && <Flame size={22} color="var(--gold-light)" />}
          <button
            className="sidebar-icon-btn collapse-btn"
            onClick={p.onToggleCollapse}
            title={p.collapsed ? 'Expand' : 'Collapse'}
          >
            {p.collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <button className="new-chat interactive" onClick={p.onNewChat} title="New conversation">
          <Plus size={18} />
          {!p.collapsed && <span className="hide-collapsed">New Conversation</span>}
        </button>

        <div className="chat-list">
          {active.length === 0 && archived.length === 0 && (
            <p className="chat-section-label">No conversations yet</p>
          )}
          {active.length > 0 && <p className="chat-section-label">Recent</p>}
          {active.map(renderItem)}

          {archived.length > 0 && (
            <>
              <p
                className="chat-section-label interactive"
                style={{ cursor: 'pointer' }}
                onClick={() => setShowArchived((s) => !s)}
              >
                Archived · {archived.length} {showArchived ? '▾' : '▸'}
              </p>
              {showArchived && archived.map(renderItem)}
            </>
          )}
        </div>

        <div className="sidebar-user">
          <div className="avatar">{initials}</div>
          {!p.collapsed && (
            <>
              <div className="meta hide-collapsed">
                <div className="name">{p.user.name}</div>
                <div className="email">{p.user.email}</div>
              </div>
              <button
                className="sidebar-icon-btn hide-collapsed"
                style={{ width: 36, height: 36 }}
                onClick={p.onLogout}
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
