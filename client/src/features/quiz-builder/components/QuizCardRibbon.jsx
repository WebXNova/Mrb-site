import EditorRibbon from '../../create-question/ribbon/EditorRibbon.jsx';
import { useQuizCardRibbon } from '../ribbon/QuizCardEditorProvider.jsx';

export default function QuizCardRibbon() {
  return <EditorRibbon useRibbonHook={useQuizCardRibbon} />;
}
