import { useCallback, useMemo, useRef } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  Alignment,
  Bold,
  ClassicEditor,
  Essentials,
  Italic,
  List,
  Paragraph,
  Subscript,
  Superscript,
  Table,
  TableToolbar,
  Underline,
  Undo,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';
import { sanitizeEditorOutput } from '../utils/sanitizeEditorOutput.js';

const QUESTION_CK_PLUGINS = [
  Essentials,
  Paragraph,
  Bold,
  Italic,
  Underline,
  List,
  Alignment,
  Subscript,
  Superscript,
  Table,
  TableToolbar,
  Undo,
];

/**
 * Sandboxed CKEditor wrapper for Question Bank authoring.
 *
 * Data flow (strict):
 *   CKEditor Input → sanitizeEditorOutput() → onChange(cleanHtml) → parent state
 *   Parent value (cleanHtml) → CKEditor display (controlled)
 *   cleanHtml → prepareForPreview() → preview (plain text only)
 *   cleanHtml → sanitizeBeforeSubmit() → future API
 *
 * Security:
 * - CKEditor output is NEVER trusted
 * - All HTML must pass sanitization before preview/render
 * - Backend will re-validate content again
 * - Raw editor.getData() never leaves this component unprocessed
 */
export default function CKEditorWrapper({
  value = '',
  onChange,
  onBlur,
  disabled = false,
  invalid = false,
  placeholder = 'Enter text…',
  id = 'cq-ckeditor',
  label = 'Rich text',
  /** @type {(html: string) => string} */
  sanitize = sanitizeEditorOutput,
}) {
  const editorRef = useRef(null);

  const config = useMemo(
    () => ({
      licenseKey: 'GPL',
      plugins: QUESTION_CK_PLUGINS,
      placeholder,
      toolbar: {
        items: [
          'undo',
          'redo',
          '|',
          'bold',
          'italic',
          'underline',
          '|',
          'subscript',
          'superscript',
          '|',
          'bulletedList',
          'numberedList',
          '|',
          'alignment',
          '|',
          'insertTable',
        ],
        shouldNotGroupWhenFull: true,
      },
      table: {
        contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
      },
    }),
    [placeholder]
  );

  /** @type {string} controlled display value — always pre-sanitized */
  const safeValue = useMemo(() => sanitize(value), [value, sanitize]);

  const emitCleanChange = useCallback(
    (rawHtml) => {
      const cleanHtml = sanitize(rawHtml);
      onChange?.(cleanHtml);
    },
    [onChange, sanitize]
  );

  return (
    <div
      className={`admin-ckeditor cq-ckeditor${invalid ? ' admin-ckeditor--invalid' : ''}${disabled ? ' admin-ckeditor--disabled' : ''}`}
    >
      <label htmlFor={id} className="admin-field__label-block">
        {label}
      </label>
      <CKEditor
        editor={ClassicEditor}
        config={config}
        data={safeValue}
        disabled={disabled}
        onReady={(editor) => {
          editorRef.current = editor;
        }}
        onChange={(_event, editor) => {
          emitCleanChange(editor.getData());
        }}
        onBlur={(_event, editor) => {
          const cleanHtml = sanitize(editor.getData());
          onBlur?.(cleanHtml);
        }}
      />
    </div>
  );
}
