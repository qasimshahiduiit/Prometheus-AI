'use client';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Download, Play, Terminal, Code2 } from 'lucide-react';

/** Language id → file extension for the Download action. */
const EXT: Record<string, string> = {
  javascript: 'js', js: 'js', jsx: 'jsx', mjs: 'mjs',
  typescript: 'ts', ts: 'ts', tsx: 'tsx',
  python: 'py', py: 'py',
  html: 'html', htm: 'html', xhtml: 'html',
  css: 'css', scss: 'scss', sass: 'sass',
  json: 'json', jsonc: 'json',
  bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
  markdown: 'md', md: 'md',
  sql: 'sql', yaml: 'yml', yml: 'yml', toml: 'toml',
  java: 'java', kotlin: 'kt', c: 'c', cpp: 'cpp', 'c++': 'cpp', h: 'h',
  csharp: 'cs', cs: 'cs', go: 'go', rust: 'rs', rs: 'rs',
  ruby: 'rb', rb: 'rb', php: 'php', swift: 'swift',
  xml: 'xml', svg: 'svg', dockerfile: 'dockerfile', text: 'txt',
};

const SHELL = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);
const RUNNABLE = new Set(['html', 'htm', 'xhtml', 'svg']);

/** Run/preview is offered only for renderable markup. */
function isRunnable(lang: string, code: string): boolean {
  if (RUNNABLE.has(lang)) return true;
  // Catch fenced blocks that are HTML but labelled text/markup/xml.
  if (lang === 'text' || lang === 'markup' || lang === 'xml') {
    const head = code.trim().slice(0, 400).toLowerCase();
    return /^<!doctype html|^<html[\s>]|^<svg[\s>]/.test(head) || /<\/html>|<body[\s>]/.test(head);
  }
  return false;
}

export interface CodeBlockProps {
  /** The <code> element react-markdown nests inside <pre>. */
  children?: any;
  onRun?: (code: string, language: string) => void;
}

export default function CodeBlock({ children, onRun }: CodeBlockProps) {
  // react-markdown hands <pre> a single <code> child (sometimes wrapped in an array).
  const arr = Array.isArray(children) ? children : [children];
  const codeEl = arr.find((c) => c && c.props) ?? arr[0];
  const className: string = codeEl?.props?.className || '';
  const match = /language-(\w+)/.exec(className);
  const language = (match ? match[1] : 'text').toLowerCase();
  const code = String(codeEl?.props?.children ?? '').replace(/\n$/, '');

  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  }

  function handleDownload() {
    const ext = EXT[language] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prometheus-snippet.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const isShell = SHELL.has(language);
  const runnable = !!onRun && isRunnable(language, code);
  const label = language === 'text' ? (isShell ? 'shell' : 'code') : language;

  return (
    <div className="code-card">
      <div className="code-card-head">
        <span className="code-lang">
          {isShell ? <Terminal size={13} /> : <Code2 size={13} />}
          {label}
        </span>
        <span className="code-actions">
          <button className="code-action-btn" onClick={handleCopy} title="Copy code" aria-label="Copy code">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span className="lbl">{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button className="code-action-btn" onClick={handleDownload} title="Download as file" aria-label="Download code">
            <Download size={14} />
            <span className="lbl">Download</span>
          </button>
          {runnable && (
            <button
              className="code-action-btn run"
              onClick={() => onRun!(code, language)}
              title="Run — live preview"
              aria-label="Run code"
            >
              <Play size={14} />
              <span className="lbl">Run</span>
            </button>
          )}
        </span>
      </div>
      <div className="code-body">
        <SyntaxHighlighter
          language={language === 'text' ? 'markup' : language}
          style={oneDark}
          PreTag="div"
          customStyle={{ margin: 0, padding: '16px 20px', background: 'transparent', fontSize: '13px' }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
