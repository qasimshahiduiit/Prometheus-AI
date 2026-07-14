'use client';
import { useState } from 'react';
import { Monitor, RefreshCw, X } from 'lucide-react';

interface Props {
  code: string;
  onClose: () => void;
}

export default function PreviewPanel({ code, onClose }: Props) {
  // Bumping the key forces the iframe to remount → a clean reload.
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <aside className="preview-panel">
      <div className="preview-head">
        <span className="preview-title">
          <Monitor size={15} /> Live Preview
        </span>
        <span className="preview-actions">
          <button
            className="code-action-btn"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload preview"
            aria-label="Reload preview"
          >
            <RefreshCw size={14} />
          </button>
          <button
            className="code-action-btn"
            onClick={onClose}
            title="Close preview"
            aria-label="Close preview"
          >
            <X size={15} />
          </button>
        </span>
      </div>
      <iframe
        key={reloadKey}
        className="preview-frame"
        title="Live Preview"
        // Scripts run in an opaque origin (no allow-same-origin) so previewed
        // markup can't touch the Prometheus session or cookies.
        sandbox="allow-scripts allow-modals allow-popups allow-forms"
        srcDoc={code}
      />
    </aside>
  );
}
