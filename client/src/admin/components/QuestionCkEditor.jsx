import { useEffect, useMemo, useRef } from 'react';
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
 * CKEditor 5 for question body — restricted toolbar; HTML stored via onChange only.
 */
export default function QuestionCkEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
  invalid = false,
  placeholder = 'Enter the question text…',
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

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !editor.ui?.view?.editable?.element) return;
    editor.isReadOnly = disabled;
  }, [disabled]);

  return (
    <div
      className={`admin-ckeditor${invalid ? ' admin-ckeditor--invalid' : ''}${disabled ? ' admin-ckeditor--disabled' : ''}`}
    >
      <CKEditor
        editor={ClassicEditor}
        config={config}
        data={value || ''}
        disabled={disabled}
        onReady={(editor) => {
          editorRef.current = editor;
          editor.isReadOnly = disabled;
        }}
        onChange={(_event, editor) => {
          onChange(editor.getData());
        }}
        onBlur={(_event, editor) => {
          onBlur?.(editor.getData());
        }}
      />
    </div>
  );
}
