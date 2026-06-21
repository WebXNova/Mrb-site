import { useCallback, useMemo, useRef, useState } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  Alignment,
  Bold,
  ClassicEditor,
  Essentials,
  Image,
  ImageToolbar,
  ImageUpload,
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
import { registerQuestionImageUploadAdapter } from './QuestionImageUploadAdapter.js';

function QuestionBankUploadAdapterPlugin(editor) {
  registerQuestionImageUploadAdapter(editor);
}
QuestionBankUploadAdapterPlugin.pluginName = 'QuestionBankUploadAdapter';

/** Proven-stable plugin set (extends working CKEditorWrapper) + inline images. */
const AUTHORING_PLUGINS = [
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
  Image,
  ImageUpload,
  ImageToolbar,
  QuestionBankUploadAdapterPlugin,
];

/**
 * Sandboxed rich-text host — native CKEditor toolbar hidden; ribbon controls commands.
 */
export default function RichTextEditorHost({
  editorId,
  value = '',
  onChange,
  onEditorReady,
  disabled = false,
  invalid = false,
  placeholder = 'Start writing…',
  ariaLabel = 'Rich text editor',
  sanitize = sanitizeEditorOutput,
}) {
  const editorRef = useRef(null);
  const [editorError, setEditorError] = useState('');

  const config = useMemo(
    () => ({
      licenseKey: 'GPL',
      plugins: AUTHORING_PLUGINS,
      placeholder,
      toolbar: { items: [] },
      image: {
        toolbar: ['imageTextAlternative'],
      },
      table: {
        contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
      },
    }),
    [placeholder]
  );

  const safeValue = useMemo(() => sanitize(value), [value, sanitize]);

  const emitCleanChange = useCallback(
    (rawHtml) => {
      const cleanHtml = sanitize(rawHtml);
      onChange?.(cleanHtml);
    },
    [onChange, sanitize]
  );

  function handleReady(editor) {
    editorRef.current = editor;
    setEditorError('');

    try {
      onEditorReady?.(editor);
    } catch (err) {
      console.error(`[RichTextEditorHost:${editorId}] onEditorReady failed:`, err);
      setEditorError('Editor failed to initialize.');
    }
  }

  function handleEditorError(_event, { willEditorRestart }) {
    if (willEditorRestart) return;
    setEditorError('Editor failed to load. Please reload the page.');
  }

  if (editorError) {
    return (
      <div className="qaw-editor-host qaw-editor-host--error" data-editor-id={editorId}>
        <p className="admin-field__error" role="alert">
          {editorError}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`qaw-editor-host${invalid ? ' qaw-editor-host--invalid' : ''}${disabled ? ' qaw-editor-host--disabled' : ''}`}
      data-editor-id={editorId}
      aria-label={ariaLabel}
    >
      <CKEditor
        editor={ClassicEditor}
        config={config}
        data={safeValue}
        disabled={disabled}
        onReady={handleReady}
        onError={handleEditorError}
        onChange={(_event, editor) => {
          emitCleanChange(editor.getData());
        }}
      />
    </div>
  );
}
