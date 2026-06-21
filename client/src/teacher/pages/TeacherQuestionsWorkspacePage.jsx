import { useTeacherQuestionWorkspace } from '../hooks/useTeacherQuestionWorkspace';
import TeacherQuestionInbox from '../components/workspace/TeacherQuestionInbox';
import TeacherQuestionConversation from '../components/workspace/TeacherQuestionConversation';
import TeacherQuestionContextPanel from '../components/workspace/TeacherQuestionContextPanel';
import { useMediaQuery } from '../../student/hooks/useMediaQuery';
import '../../student/styles/studentQaChat.css';
import '../styles/teacherQaWorkspace.css';

export default function TeacherQuestionsWorkspacePage() {
  const ws = useTeacherQuestionWorkspace();
  const isMobile = useMediaQuery('(max-width: 820px)');

  return (
    <div className={`tq-ws${ws.chatOpen ? ' tq-ws--chat-open' : ''}`} aria-label="Teacher questions workspace">
      <TeacherQuestionInbox
        items={ws.items}
        summary={ws.summary}
        statusFilter={ws.statusFilter}
        onStatusFilter={ws.setStatusFilter}
        search={ws.search}
        onSearch={ws.setSearch}
        searchRef={ws.searchRef}
        pinnedOnly={ws.pinnedOnly}
        onPinnedOnly={ws.setPinnedOnly}
        selectedId={ws.selectedThreadId}
        onSelect={ws.selectThread}
        onTogglePin={ws.togglePin}
        listLoading={ws.listLoading}
        listError={ws.listError}
        onRetry={ws.refreshInbox}
        onLoadMore={ws.loadMore}
        hasMore={ws.hasMore}
        listLoadingMore={ws.listLoadingMore}
      />

      <TeacherQuestionConversation
        thread={ws.thread}
        loading={ws.detailLoading}
        error={ws.detailError}
        onAnswered={ws.onAnswered}
        onNext={ws.goNext}
        onPrevious={ws.goPrevious}
        canGoNext={ws.canGoNext}
        canGoPrevious={ws.canGoPrevious}
        onTogglePin={ws.togglePin}
        onBack={() => ws.selectThread(null)}
        showBack={ws.chatOpen && isMobile}
      />

      <TeacherQuestionContextPanel
        context={ws.context}
        loading={ws.detailLoading}
        threadOpen={Boolean(ws.selectedThreadId)}
      />
    </div>
  );
}
