'use client';
import { useRef, useState } from 'react';
import { Paperclip, ArrowUp, X, FileText, Loader2 } from 'lucide-react';
import type { Attachment } from './types';

interface Props {
  disabled: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onError: (msg: string) => void;
}

export default function Composer({ disabled, onSend, onError }: Props) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6 - pending.length)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/files', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed.');
        setPending((p) => [...p, data.file]);
      }
    } catch (e: any) {
      onError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function send() {
    const t = text.trim();
    if ((!t && pending.length === 0) || disabled) return;
    onSend(t || 'Analyze the attached file.', pending);
    setText('');
    setPending([]);
    if (taRef.current) taRef.current.style.height = 'auto';
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        {pending.length > 0 && (
          <div className="composer-attachments">
            {pending.map((a) => (
              <span className="pending-attach" key={a.id}>
                {a.mime.startsWith('image/') ? (
                  <img
                    src={`/api/files/${a.id}`}
                    alt=""
                    style={{ width: 22, height: 22, objectFit: 'cover' }}
                  />
                ) : (
                  <FileText size={15} color="var(--gold)" />
                )}
                {a.name.length > 22 ? a.name.slice(0, 20) + '…' : a.name}
                <button onClick={() => setPending((p) => p.filter((x) => x.id !== a.id))}>
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="composer-row">
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            className="composer-btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || pending.length >= 6}
            title="Attach image or PDF"
          >
            {uploading ? <Loader2 size={18} className="spin-icon" /> : <Paperclip size={18} />}
          </button>

          <textarea
            ref={taRef}
            value={text}
            rows={1}
            placeholder="Message Prometheus…"
            onChange={(e) => {
              setText(e.target.value);
              autosize();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />

          <button
            className="composer-btn send"
            onClick={send}
            disabled={disabled || (!text.trim() && pending.length === 0)}
            title="Send"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
      <p className="composer-hint">Prometheus is AI and can make mistakes. Please double-check responses.</p>
    </div>
  );
}
