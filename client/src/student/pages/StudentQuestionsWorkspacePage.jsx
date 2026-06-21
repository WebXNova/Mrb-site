import { useStudentQuestionWorkspace } from '../hooks/useStudentQuestionWorkspace';
import StudentQuestionInbox from '../components/workspace/StudentQuestionInbox';
import StudentQuestionConversation from '../components/workspace/StudentQuestionConversation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import '../../teacher/styles/teacherQaWorkspace.css';
import '../styles/studentQaWorkspace.css';
import '../styles/studentQaChat.css';

export default function StudentQuestionsWorkspacePage() {
  const ws = useStudentQuestionWorkspace();
  const isMobile = useMediaQuery('(max-width: 820px)');

  return (
    <div className={`tq-ws tq-ws--student${ws.chatOpen ? ' tq-ws--chat-open' : ''}`} aria-label="Student questions workspace">
      <StudentQuestionInbox
        items={ws.items}
        summary={ws.summary}
        course={ws.course}
        statusFilter={ws.statusFilter}
        onStatusFilter={ws.setStatusFilter}
        search={ws.search}
        onSearch={ws.setSearch}
        searchRef={ws.searchRef}
        selectedId={ws.selectedThreadId}
        onSelect={ws.selectThread}
        listLoading={ws.listLoading}
        listError={ws.listError}
        onRetry={ws.refreshInbox}
      />

      <StudentQuestionConversation
        thread={ws.thread}
        loading={ws.detailLoading}
        error={ws.detailError}
        onQuestionSubmitted={ws.onQuestionSubmitted}
        onNext={ws.goNext}
        onPrevious={ws.goPrevious}
        canGoNext={ws.canGoNext}
        canGoPrevious={ws.canGoPrevious}
        onBack={() => ws.selectThread(null)}
        showBack={ws.chatOpen && isMobile}
      />
    </div>
  );
}
