import { useState } from 'react';
import { IconCheck, IconCopy } from '../public-tests/testsUiIcons.jsx';

export default function CopyableField({ label, value, copyValue }) {
  const [copied, setCopied] = useState(false);
  const text = String(copyValue ?? value ?? '');

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const node = document.createElement('textarea');
      node.value = text;
      node.setAttribute('readonly', '');
      node.style.position = 'absolute';
      node.style.left = '-9999px';
      document.body.appendChild(node);
      node.select();
      document.execCommand('copy');
      document.body.removeChild(node);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="ptp-copy">
      <span className="ptp-copy__label">{label}</span>
      <div className="ptp-copy__row">
        <span className="ptp-copy__value">{value}</span>
        <button
          type="button"
          className={`ptp-copy__btn${copied ? ' ptp-copy__btn--done' : ''}`}
          onClick={copy}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
        >
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
