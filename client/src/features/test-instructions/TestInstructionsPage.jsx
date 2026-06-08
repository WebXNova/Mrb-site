import { useState } from 'react';
import { useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { useStartTest, useTestInstructions } from './hooks/useTestInstructions';
import AttemptInfoCard from './components/AttemptInfoCard';
import InstructionsSection from './components/InstructionsSection';
import StartTestPanel from './components/StartTestPanel';
import TestInstructionsEmpty from './components/TestInstructionsEmpty';
import TestInstructionsError from './components/TestInstructionsError';
import TestInstructionsErrorBoundary from './components/TestInstructionsErrorBoundary';
import TestInstructionsSkeleton from './components/TestInstructionsSkeleton';
import TestMetaGrid from './components/TestMetaGrid';
import './styles/test-instructions.css';

function TestInstructionsContent() {
  const { slug } = useParams();
  const { meta, prep, status, error, isAuthenticated, reload } = useTestInstructions(slug);
  const { startTest, isStarting, startError, clearStartError } = useStartTest(slug);
  const [studentName, setStudentName] = useState('');

  const canStart = prep?.canStart ?? true;

  async function handleSubmit(event) {
    event.preventDefault();
    clearStartError();
    await startTest({ studentName });
  }

  if (status === 'loading') {
    return (
      <PageLayout>
        <div className="ti-shell">
          <TestInstructionsSkeleton />
        </div>
      </PageLayout>
    );
  }

  if (status === 'empty') {
    return (
      <PageLayout>
        <div className="ti-shell">
          <TestInstructionsEmpty slug={slug} />
        </div>
      </PageLayout>
    );
  }

  if (status === 'error') {
    return (
      <PageLayout>
        <div className="ti-shell">
          <TestInstructionsError message={error} onRetry={reload} />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="ti-shell">
        <div className="ti-page">
          <header className="ti-header">
            <p className="ti-eyebrow">MRB Assessment</p>
            <h1 className="ti-title">{meta?.title || 'Test instructions'}</h1>
            {meta?.subject ? (
              <p className="ti-subtitle">
                Subject: <span>{meta.subject}</span>
              </p>
            ) : null}
          </header>

          <TestMetaGrid meta={meta} />
          <AttemptInfoCard meta={meta} prep={prep} isAuthenticated={isAuthenticated} />
          <InstructionsSection meta={meta} />
          <StartTestPanel
            slug={slug}
            isAuthenticated={isAuthenticated}
            isStarting={isStarting}
            startError={startError}
            canStart={canStart}
            studentName={studentName}
            onStudentNameChange={setStudentName}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </PageLayout>
  );
}

export default function TestInstructionsPage() {
  return (
    <TestInstructionsErrorBoundary>
      <TestInstructionsContent />
    </TestInstructionsErrorBoundary>
  );
}
