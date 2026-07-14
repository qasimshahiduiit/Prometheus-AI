export interface User {
  id: string;
  email: string;
  name: string;
  created_at: number;
}

export interface ChatSummary {
  id: string;
  title: string;
  archived: number;
  created_at: number;
  updated_at: number;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
}

export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export type Mode = 'chat' | 'search' | 'vision' | 'image';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: Mode | null;
  imageUrl?: string | null;
  attachments?: Attachment[];
  sources?: Source[];
  streaming?: boolean;
}
