import { useEditorRibbon } from './EditorRibbonProvider.jsx';
import RibbonGroup from './RibbonGroup.jsx';
import RibbonButton from './RibbonButton.jsx';
import AddPhotoIcon from './AddPhotoIcon.jsx';

function Icon({ name }) {
  const icons = {
    bold: 'B',
    italic: 'I',
    underline: 'U',
    superscript: 'x²',
    subscript: 'x₂',
    alignLeft: '≡',
    alignCenter: '≡',
    alignRight: '≡',
    justify: '≡',
    bullet: '•',
    number: '1.',
    outdent: '⇤',
    indent: '⇥',
    table: '⊞',
    formula: 'ƒ',
    image: null,
    undo: '↶',
    redo: '↷',
  };
  if (name === 'image') {
    return <AddPhotoIcon className="qaw-ribbon-icon qaw-ribbon-icon--photo" />;
  }
  return <span className="qaw-ribbon-icon" aria-hidden="true">{icons[name] || '·'}</span>;
}

export default function EditorRibbon({ useRibbonHook = useEditorRibbon }) {
  const { executeCommand, queryCommand, toggleState, disabled, activeEditorId } = useRibbonHook();

  const editorActive = Boolean(activeEditorId);

  function isPressed(id) {
    return Boolean(toggleState[id]?.isOn);
  }

  function isEnabled(id) {
    if (!editorActive) return false;
    const def = toggleState[id];
    if (def) return def.isEnabled !== false;
    return queryCommand(id).isEnabled;
  }

  return (
    <div className="qaw-ribbon" role="toolbar" aria-label="Question editor formatting">
      <div className="qaw-ribbon__scroll">
        <RibbonGroup label="Text formatting">
          <RibbonButton label="Bold" shortcut="Ctrl+B" pressed={isPressed('bold')} disabled={disabled || !isEnabled('bold')} onClick={() => executeCommand('bold')}>
            <Icon name="bold" />
          </RibbonButton>
          <RibbonButton label="Italic" shortcut="Ctrl+I" pressed={isPressed('italic')} disabled={disabled || !isEnabled('italic')} onClick={() => executeCommand('italic')}>
            <Icon name="italic" />
          </RibbonButton>
          <RibbonButton label="Underline" shortcut="Ctrl+U" pressed={isPressed('underline')} disabled={disabled || !isEnabled('underline')} onClick={() => executeCommand('underline')}>
            <Icon name="underline" />
          </RibbonButton>
          <RibbonButton label="Superscript" pressed={isPressed('superscript')} disabled={disabled || !isEnabled('superscript')} onClick={() => executeCommand('superscript')}>
            <Icon name="superscript" />
          </RibbonButton>
          <RibbonButton label="Subscript" pressed={isPressed('subscript')} disabled={disabled || !isEnabled('subscript')} onClick={() => executeCommand('subscript')}>
            <Icon name="subscript" />
          </RibbonButton>
        </RibbonGroup>

        <RibbonGroup label="Paragraph">
          <RibbonButton label="Align left" disabled={disabled || !editorActive} onClick={() => executeCommand('alignment:left')}>
            <Icon name="alignLeft" />
          </RibbonButton>
          <RibbonButton label="Align center" disabled={disabled || !editorActive} onClick={() => executeCommand('alignment:center')}>
            <Icon name="alignCenter" />
          </RibbonButton>
          <RibbonButton label="Align right" disabled={disabled || !editorActive} onClick={() => executeCommand('alignment:right')}>
            <Icon name="alignRight" />
          </RibbonButton>
          <RibbonButton label="Justify" disabled={disabled || !editorActive} onClick={() => executeCommand('alignment:justify')}>
            <Icon name="justify" />
          </RibbonButton>
          <RibbonButton label="Bulleted list" shortcut="Ctrl+Shift+L" pressed={isPressed('bulletedList')} disabled={disabled || !isEnabled('bulletedList')} onClick={() => executeCommand('bulletedList')}>
            <Icon name="bullet" />
          </RibbonButton>
          <RibbonButton label="Numbered list" shortcut="Ctrl+Shift+O" pressed={isPressed('numberedList')} disabled={disabled || !isEnabled('numberedList')} onClick={() => executeCommand('numberedList')}>
            <Icon name="number" />
          </RibbonButton>
          <RibbonButton label="Decrease indent" disabled={disabled || !editorActive} onClick={() => executeCommand('outdent')}>
            <Icon name="outdent" />
          </RibbonButton>
          <RibbonButton label="Increase indent" disabled={disabled || !editorActive} onClick={() => executeCommand('indent')}>
            <Icon name="indent" />
          </RibbonButton>
        </RibbonGroup>

        <RibbonGroup label="Insert">
          <RibbonButton label="Insert table" disabled={disabled || !editorActive} onClick={() => executeCommand('insertTable')}>
            <Icon name="table" />
          </RibbonButton>
          <RibbonButton label="Insert formula" disabled={disabled || !editorActive} onClick={() => executeCommand('insertFormula')}>
            <Icon name="formula" />
          </RibbonButton>
          <RibbonButton
            label="Insert image — upload or paste URL"
            disabled={disabled}
            onClick={() => executeCommand('insertImage')}
          >
            <Icon name="image" />
          </RibbonButton>
        </RibbonGroup>

        <RibbonGroup label="Actions">
          <RibbonButton label="Undo" shortcut="Ctrl+Z" disabled={disabled || !editorActive} onClick={() => executeCommand('undo')}>
            <Icon name="undo" />
          </RibbonButton>
          <RibbonButton label="Redo" shortcut="Ctrl+Y" disabled={disabled || !editorActive} onClick={() => executeCommand('redo')}>
            <Icon name="redo" />
          </RibbonButton>
        </RibbonGroup>
      </div>
    </div>
  );
}
