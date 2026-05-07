import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import RichTextEditor from '../components/RichTextEditor';

const defaultTestForm = {
  title: '',
  description: '',
  subject: '',
  category: '',
  subCategory: '',
  durationMinutes: 30,
  passingMarks: 0,
  maxAttempts: 1,
  negativeMarking: 0,
  shuffleQuestions: false,
  shuffleOptions: false,
  showExplanations: true,
  tagsInput: '',
  status: 'draft',
};

const defaultQuestionForm = {
  questionText: '',
  questionImageUrl: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctOption: 'A',
  explanation: '',
  explanationImageUrl: '',
  marks: 1,
};

function normalizeOptionId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace('.', '')
    .replace(')', '');
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function validatePreviewRow(row) {
  const errors = [];
  const questionText = String(row.questionText || '');
  const normalizedQuestionText = stripHtml(questionText);
  const options = (row.options || [])
    .map((option) => ({
      id: normalizeOptionId(option.id),
      text: String(option.text || '').trim(),
    }))
    .filter((option) => option.id && option.text);
  const correctOption = normalizeOptionId(row.correctOption);

  if (!normalizedQuestionText) errors.push('Question text is required');
  if (options.length < 2) errors.push('At least 2 valid options are required');
  const uniqueOptionIds = new Set(options.map((option) => option.id));
  if (uniqueOptionIds.size !== options.length) errors.push('Option ids must be unique');
  if (!correctOption) errors.push('Exactly one ANSWER is required');
  if (correctOption && !options.some((option) => option.id === correctOption)) {
    errors.push('ANSWER must match one provided option id');
  }

  return {
    ...row,
    questionText,
    options,
    correctOption,
    explanation: String(row.explanation || '').trim(),
    questionImageUrl: String(row.questionImageUrl || '').trim(),
    explanationImageUrl: String(row.explanationImageUrl || '').trim(),
    errors,
    valid: errors.length === 0,
  };
}

export default function AdminTestsPage() {
  const token = getAdminToken();
  const [tests, setTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [testForm, setTestForm] = useState(defaultTestForm);
  const [questionForm, setQuestionForm] = useState(defaultQuestionForm);
  const [editingTestId, setEditingTestId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [aikenRows, setAikenRows] = useState([]);
  const [aikenSummary, setAikenSummary] = useState(null);
  const [aikenText, setAikenText] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [isImportBusy, setIsImportBusy] = useState(false);
  const [activeTag, setActiveTag] = useState('all');
  const publishedCount = tests.filter((test) => test.status === 'published').length;
  const draftsCount = tests.filter((test) => test.status === 'draft').length;
  const allTags = [...new Set(tests.flatMap((test) => (Array.isArray(test.tags) ? test.tags : [])))].sort((a, b) =>
    a.localeCompare(b)
  );
  const visibleTests =
    activeTag === 'all' ? tests : tests.filter((test) => Array.isArray(test.tags) && test.tags.includes(activeTag));

  async function loadTests() {
    const response = await adminApi.tests(token);
    const data = response?.data || [];
    setTests(data);
    if (!selectedTestId && data.length) {
      setSelectedTestId(data[0].id);
    }
  }

  async function loadQuestions(testId) {
    if (!testId) {
      setQuestions([]);
      return;
    }
    const response = await adminApi.testQuestions(token, testId);
    setQuestions(response?.data || []);
  }

  function clearImportState() {
    setAikenRows([]);
    setAikenSummary(null);
    setAikenText('');
    setImportFile(null);
  }

  useEffect(() => {
    loadTests().catch((err) => setError(err.message || 'Failed to load tests'));
  }, []);

  useEffect(() => {
    loadQuestions(selectedTestId).catch((err) => setError(err.message || 'Failed to load questions'));
  }, [selectedTestId]);

  function onTestChange(event) {
    const { name, value, type, checked } = event.target;
    setTestForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function onQuestionChange(event) {
    const { name, value } = event.target;
    setQuestionForm((prev) => ({ ...prev, [name]: value }));
  }

  function onQuestionEditorChange(field, value) {
    setQuestionForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submitTest(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const payload = {
        ...testForm,
        durationMinutes: Number(testForm.durationMinutes),
        passingMarks: Number(testForm.passingMarks || 0),
        maxAttempts: Number(testForm.maxAttempts || 1),
        negativeMarking: Number(testForm.negativeMarking || 0),
        tags: testForm.tagsInput
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      if (editingTestId) {
        await adminApi.updateTest(token, editingTestId, payload);
        setSuccess('Test updated');
      } else {
        await adminApi.createTest(token, payload);
        setSuccess('Test created');
      }
      setEditingTestId(null);
      setTestForm(defaultTestForm);
      await loadTests();
    } catch (err) {
      setError(err.message || 'Failed to save test');
    }
  }

  function editTest(test) {
    setEditingTestId(test.id);
    setTestForm({
      title: test.title || '',
      description: test.description || '',
      subject: test.subject || '',
      category: test.category || '',
      subCategory: test.subCategory || '',
      durationMinutes: test.durationMinutes || 30,
      passingMarks: test.passingMarks || 0,
      maxAttempts: test.maxAttempts || 1,
      negativeMarking: Number(test.negativeMarking || 0),
      shuffleQuestions: !!test.shuffleQuestions,
      shuffleOptions: !!test.shuffleOptions,
      showExplanations: !!test.showExplanations,
      tagsInput: (test.tags || []).join(', '),
      status: test.status || 'draft',
    });
  }

  async function removeTest(testId) {
    if (!window.confirm('Delete this test?')) return;
    setError('');
    try {
      await adminApi.deleteTest(token, testId);
      if (selectedTestId === testId) setSelectedTestId(null);
      await loadTests();
    } catch (err) {
      setError(err.message || 'Failed to delete test');
    }
  }

  async function publish(testId) {
    setError('');
    setSuccess('');
    try {
      const response = await adminApi.publishTest(token, testId);
      const link = response?.data?.publicLink;
      const messageParts = ['Published successfully.'];
      if (link) messageParts.push(`Public link: ${link}`);
      setSuccess(messageParts.join(' '));
      await loadTests();
    } catch (err) {
      setError(err.message || 'Failed to publish test');
    }
  }

  async function addQuestion(event) {
    event.preventDefault();
    if (!selectedTestId) return;
    setError('');
    try {
      if (!stripHtml(questionForm.questionText)) {
        setError('Question text is required');
        return;
      }
      if (!stripHtml(questionForm.explanation)) {
        setError('Explanation is required');
        return;
      }
      const payload = {
        questionText: questionForm.questionText,
        questionImageUrl: questionForm.questionImageUrl || null,
        options: [
          { id: 'A', text: questionForm.optionA },
          { id: 'B', text: questionForm.optionB },
          { id: 'C', text: questionForm.optionC },
          { id: 'D', text: questionForm.optionD },
        ].filter((item) => item.text.trim()),
        correctOption: questionForm.correctOption,
        explanation: questionForm.explanation,
        explanationImageUrl: questionForm.explanationImageUrl || null,
        marks: Number(questionForm.marks || 1),
      };
      await adminApi.createTestQuestion(token, selectedTestId, payload);
      setQuestionForm(defaultQuestionForm);
      await loadQuestions(selectedTestId);
    } catch (err) {
      setError(err.message || 'Failed to add question');
    }
  }

  async function onAikenFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'txt') {
      const content = await file.text();
      setAikenText(content);
    } else {
      setAikenText('');
    }
    setError('');
  }

  async function parseAikenPreview(event) {
    event.preventDefault();
    if (!selectedTestId) return;
    if (!aikenText.trim() && !importFile) {
      setError('Please upload/paste AIKEN or upload Excel/Word file first.');
      return;
    }
    setError('');
    setSuccess('');
    setIsImportBusy(true);
    try {
      const response =
        importFile && !aikenText.trim()
          ? await adminApi.previewImportFile(token, selectedTestId, importFile)
          : await adminApi.previewAikenImport(token, selectedTestId, aikenText);
      const previewItems = (response?.data?.items || []).map((row, index) =>
        validatePreviewRow({
          ...row,
          sourceOrder: row.sourceOrder || index + 1,
        })
      );
      setAikenRows(previewItems);
      setAikenSummary({
        total: previewItems.length,
        valid: previewItems.filter((row) => row.valid).length,
        invalid: previewItems.filter((row) => !row.valid).length,
      });
    } catch (err) {
      setError(err.message || 'Failed to parse AIKEN upload');
    } finally {
      setIsImportBusy(false);
    }
  }

  function updateAikenRow(index, updater) {
    setAikenRows((prev) => {
      const next = [...prev];
      next[index] = validatePreviewRow(updater(next[index]));
      setAikenSummary({
        total: next.length,
        valid: next.filter((row) => row.valid).length,
        invalid: next.filter((row) => !row.valid).length,
      });
      return next;
    });
  }

  function deleteAikenRow(index) {
    setAikenRows((prev) => {
      const next = prev.filter((_, idx) => idx !== index).map((row) => validatePreviewRow(row));
      setAikenSummary({
        total: next.length,
        valid: next.filter((row) => row.valid).length,
        invalid: next.filter((row) => !row.valid).length,
      });
      return next;
    });
  }

  async function confirmAikenSave() {
    if (!selectedTestId) return;
    if (!aikenRows.length) {
      setError('No rows available to import.');
      return;
    }
    if (aikenRows.some((row) => !row.valid)) {
      setError('Fix or delete invalid rows before confirm-save.');
      return;
    }
    setError('');
    setSuccess('');
    setIsImportBusy(true);
    try {
      const payload = aikenRows.map((row, index) => ({
        sourceOrder: row.sourceOrder || index + 1,
        questionText: row.questionText,
        questionImageUrl: row.questionImageUrl || null,
        options: row.options,
        correctOption: row.correctOption,
        explanation: row.explanation,
        explanationImageUrl: row.explanationImageUrl || null,
        marks: Number(row.marks || 1),
        orderIndex: index,
      }));
      const response = await adminApi.confirmAikenImport(token, selectedTestId, payload);
      setSuccess(`Imported ${response?.data?.insertedCount || payload.length} questions successfully.`);
      clearImportState();
      await loadQuestions(selectedTestId);
    } catch (err) {
      setError(err.message || 'Failed to save imported questions');
    } finally {
      setIsImportBusy(false);
    }
  }

  async function removeQuestion(questionId) {
    if (!window.confirm('Delete this question?')) return;
    setError('');
    try {
      await adminApi.deleteTestQuestion(token, selectedTestId, questionId);
      await loadQuestions(selectedTestId);
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    }
  }

  async function copyPublicLink(link) {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setSuccess(`Copied link: ${link}`);
    } catch {
      setError('Could not copy link to clipboard.');
    }
  }

  async function duplicateExistingTest(testId) {
    setError('');
    setSuccess('');
    try {
      await adminApi.duplicateTest(token, testId);
      setSuccess('Test duplicated as draft copy.');
      await loadTests();
    } catch (err) {
      setError(err.message || 'Failed to duplicate test');
    }
  }

  async function downloadResults(testId) {
    setError('');
    try {
      const { blob, filename } = await adminApi.exportTestResults(token, testId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `test-${testId}-results.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download results');
    }
  }

  return (
    <section className="admin-page">
      <section className="admin-grid">
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Total Tests</p>
          <p className="admin-stat-card__value">{tests.length}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Published</p>
          <p className="admin-stat-card__value">{publishedCount}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Drafts</p>
          <p className="admin-stat-card__value">{draftsCount}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Total Questions</p>
          <p className="admin-stat-card__value">{questions.length}</p>
        </article>
      </section>

      <section className="admin-card">
        <h2 className="heading-3">Test Builder Workflow</h2>
        <ol className="admin-workflow-list">
          <li>
            <strong>Adjust settings:</strong> Change test name, duration, tags, and grading behavior.
          </li>
          <li>
            <strong>Edit questions:</strong> Add manual MCQs or bulk import from Aiken/Excel/Word.
          </li>
          <li>
            <strong>Publish & distribute:</strong> Publish and share link with public/private access.
          </li>
          <li>
            <strong>View results:</strong> Track attempts and download per-test Excel report.
          </li>
        </ol>
      </section>

      <section className="admin-card">
        <h2 className="heading-3">{editingTestId ? 'Edit Test' : 'Create Test'}</h2>
        <form className="admin-page" onSubmit={submitTest} style={{ marginTop: '1rem' }}>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" value={testForm.title} onChange={onTestChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="subject">Subject</label>
              <input id="subject" name="subject" value={testForm.subject} onChange={onTestChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="category">Category</label>
              <input id="category" name="category" value={testForm.category} onChange={onTestChange} placeholder="e.g. MDCAT" />
            </div>
            <div className="admin-field">
              <label htmlFor="subCategory">Sub Category</label>
              <input
                id="subCategory"
                name="subCategory"
                value={testForm.subCategory}
                onChange={onTestChange}
                placeholder="e.g. Chemistry"
              />
            </div>
            <div className="admin-field">
              <label htmlFor="tagsInput">Tags (comma separated)</label>
              <input
                id="tagsInput"
                name="tagsInput"
                value={testForm.tagsInput}
                onChange={onTestChange}
                placeholder="e.g. 2026k, Mock, Chapterwise"
              />
            </div>
            <div className="admin-field">
              <label htmlFor="durationMinutes">Duration (minutes)</label>
              <input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={1}
                value={testForm.durationMinutes}
                onChange={onTestChange}
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="passingMarks">Passing Marks</label>
              <input
                id="passingMarks"
                name="passingMarks"
                type="number"
                min={0}
                value={testForm.passingMarks}
                onChange={onTestChange}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="negativeMarking">Negative Marking (per wrong answer)</label>
              <input
                id="negativeMarking"
                name="negativeMarking"
                type="number"
                min={0}
                step="0.25"
                value={testForm.negativeMarking}
                onChange={onTestChange}
              />
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" value={testForm.description} onChange={onTestChange} />
          </div>

          <div className="admin-actions">
            <label>
              <input
                type="checkbox"
                name="shuffleQuestions"
                checked={testForm.shuffleQuestions}
                onChange={onTestChange}
              />{' '}
              Shuffle Questions
            </label>
            <label>
              <input
                type="checkbox"
                name="shuffleOptions"
                checked={testForm.shuffleOptions}
                onChange={onTestChange}
              />{' '}
              Shuffle Options
            </label>
            <label>
              <input
                type="checkbox"
                name="showExplanations"
                checked={testForm.showExplanations}
                onChange={onTestChange}
              />{' '}
              Show Explanations
            </label>
          </div>

          {error ? <p className="admin-error">{error}</p> : null}
          {success ? <p className="admin-success">{success}</p> : null}

          <div className="admin-actions">
            <button className="btn btn--primary" type="submit">
              {editingTestId ? 'Update Test' : 'Create Test'}
            </button>
            {editingTestId ? (
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => {
                  setEditingTestId(null);
                  setTestForm(defaultTestForm);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h2 className="heading-3">Tests</h2>
        <div className="admin-tag-board">
          <button
            className={`admin-tag-chip ${activeTag === 'all' ? 'admin-tag-chip--active' : ''}`}
            type="button"
            onClick={() => setActiveTag('all')}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              className={`admin-tag-chip ${activeTag === tag ? 'admin-tag-chip--active' : ''}`}
              type="button"
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Tags</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Neg Marking</th>
                <th>Public Link</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTests.length ? (
                visibleTests.map((test) => (
                  <tr key={test.id}>
                    <td>{test.title}</td>
                    <td>{test.subject}</td>
                    <td>
                      {[test.category, test.subCategory].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td>{(test.tags || []).join(', ') || '-'}</td>
                    <td>{test.status}</td>
                    <td>{test.durationMinutes} min</td>
                    <td>{Number(test.negativeMarking || 0)}</td>
                    <td>
                      {test.publicLink ? (
                        <div className="admin-row-actions">
                          <a href={test.publicLink} target="_blank" rel="noreferrer">
                            Open Link
                          </a>
                          <button
                            className="btn btn--secondary btn--sm"
                            type="button"
                            onClick={() => copyPublicLink(test.publicLink)}
                          >
                            Copy
                          </button>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="btn btn--secondary btn--sm" onClick={() => setSelectedTestId(test.id)} type="button">
                          Questions
                        </button>
                        <button className="btn btn--secondary btn--sm" onClick={() => editTest(test)} type="button">
                          Edit
                        </button>
                        {test.status !== 'published' ? (
                          <button className="btn btn--secondary btn--sm" onClick={() => publish(test.id)} type="button">
                            Publish
                          </button>
                        ) : null}
                        <button className="btn btn--secondary btn--sm" onClick={() => duplicateExistingTest(test.id)} type="button">
                          Duplicate
                        </button>
                        <button className="btn btn--secondary btn--sm" onClick={() => downloadResults(test.id)} type="button">
                          Download Results
                        </button>
                        <button className="btn btn--secondary btn--sm" onClick={() => removeTest(test.id)} type="button">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No tests for this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <h2 className="heading-3">Question Builder {selectedTestId ? `(Test #${selectedTestId})` : ''}</h2>
        {!selectedTestId ? (
          <p className="body-md" style={{ marginTop: '0.75rem' }}>
            Select a test from the list above to add or manage questions.
          </p>
        ) : (
          <>
            <section className="admin-card admin-import-card">
              <h3 className="heading-4">Bulk Upload (.txt / .xlsx / .docx)</h3>
              <p className="body-sm" style={{ marginTop: '0.5rem' }}>
                Flow: Upload - Parse - Preview - Edit/Delete/Fix - Confirm & Save
              </p>
              <form className="admin-page" style={{ marginTop: '1rem' }} onSubmit={parseAikenPreview}>
                <div className="admin-field">
                  <label htmlFor="aikenFile">Upload Question File</label>
                  <input id="aikenFile" type="file" accept=".txt,.xlsx,.docx,text/plain" onChange={onAikenFileChange} />
                </div>
                <div className="admin-field">
                  <label htmlFor="aikenText">Or paste AIKEN content</label>
                  <textarea
                    id="aikenText"
                    value={aikenText}
                    onChange={(event) => setAikenText(event.target.value)}
                    placeholder={'Question text\nA) Option A\nB) Option B\nANSWER: A'}
                  />
                </div>
                <div className="admin-actions">
                  <button className="btn btn--secondary" type="submit" disabled={isImportBusy}>
                    {isImportBusy ? 'Parsing...' : 'Parse & Preview'}
                  </button>
                  <button className="btn btn--secondary" type="button" onClick={clearImportState}>
                    Clear Preview
                  </button>
                </div>
              </form>

              {aikenSummary ? (
                <p className="body-sm" style={{ marginTop: '0.75rem' }}>
                  Total: {aikenSummary.total} | Valid: {aikenSummary.valid} | Invalid: {aikenSummary.invalid}
                </p>
              ) : null}

              {aikenRows.length ? (
                <div className="admin-import-preview">
                  {aikenRows.map((row, index) => (
                    <article
                      key={`import-row-${row.sourceOrder}-${index}`}
                      className={`admin-import-row ${row.valid ? '' : 'admin-import-row--invalid'}`}
                    >
                      <div className="admin-actions" style={{ justifyContent: 'space-between' }}>
                        <p className="body-sm">
                          Row #{index + 1} (source #{row.sourceOrder})
                        </p>
                        <button className="btn btn--secondary btn--sm" type="button" onClick={() => deleteAikenRow(index)}>
                          Delete
                        </button>
                      </div>
                      <div className="admin-field">
                        <label>Question</label>
                        <RichTextEditor
                          value={row.questionText}
                          onChange={(value) => updateAikenRow(index, (old) => ({ ...old, questionText: value }))}
                          placeholder="Write question..."
                        />
                      </div>
                      <div className="admin-field">
                        <label>Question Image URL (optional)</label>
                        <input
                          value={row.questionImageUrl || ''}
                          onChange={(event) =>
                            updateAikenRow(index, (old) => ({ ...old, questionImageUrl: event.target.value }))
                          }
                          placeholder="https://..."
                        />
                      </div>
                      <div className="admin-form-grid">
                        {row.options.map((option, optionIndex) => (
                          <div className="admin-field" key={`${index}-opt-${optionIndex}`}>
                            <label>{`Option ${option.id || optionIndex + 1}`}</label>
                            <div className="admin-actions">
                              <input
                                value={option.id}
                                maxLength={2}
                                onChange={(event) =>
                                  updateAikenRow(index, (old) => {
                                    const options = [...old.options];
                                    options[optionIndex] = { ...options[optionIndex], id: event.target.value };
                                    return { ...old, options };
                                  })
                                }
                                style={{ width: '72px' }}
                              />
                              <input
                                value={option.text}
                                onChange={(event) =>
                                  updateAikenRow(index, (old) => {
                                    const options = [...old.options];
                                    options[optionIndex] = { ...options[optionIndex], text: event.target.value };
                                    return { ...old, options };
                                  })
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="admin-form-grid">
                        <div className="admin-field">
                          <label>Correct Option</label>
                          <input
                            value={row.correctOption}
                            maxLength={2}
                            onChange={(event) =>
                              updateAikenRow(index, (old) => ({ ...old, correctOption: event.target.value }))
                            }
                          />
                        </div>
                        <div className="admin-field">
                          <label>Marks</label>
                          <input
                            type="number"
                            min={1}
                            value={row.marks || 1}
                            onChange={(event) =>
                              updateAikenRow(index, (old) => ({ ...old, marks: Number(event.target.value || 1) }))
                            }
                          />
                        </div>
                      </div>
                      <div className="admin-field">
                        <label>Explanation</label>
                        <RichTextEditor
                          value={row.explanation || ''}
                          onChange={(value) => updateAikenRow(index, (old) => ({ ...old, explanation: value }))}
                          placeholder="Write explanation..."
                        />
                      </div>
                      <div className="admin-field">
                        <label>Explanation Image URL (optional)</label>
                        <input
                          value={row.explanationImageUrl || ''}
                          onChange={(event) =>
                            updateAikenRow(index, (old) => ({
                              ...old,
                              explanationImageUrl: event.target.value,
                            }))
                          }
                          placeholder="https://..."
                        />
                      </div>
                      {!row.valid ? (
                        <ul className="admin-error-list">
                          {row.errors.map((issue, issueIndex) => (
                            <li key={`${index}-err-${issueIndex}`} className="admin-error">
                              {issue}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}

                  <div className="admin-actions">
                    <button
                      className="btn btn--primary"
                      type="button"
                      disabled={isImportBusy || aikenRows.some((row) => !row.valid)}
                      onClick={confirmAikenSave}
                    >
                      {isImportBusy ? 'Saving...' : 'Confirm & Save Imported Questions'}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <form className="admin-page" onSubmit={addQuestion} style={{ marginTop: '1rem' }}>
              <div className="admin-field">
                <label htmlFor="questionText">Question</label>
                <RichTextEditor
                  value={questionForm.questionText}
                  onChange={(value) => onQuestionEditorChange('questionText', value)}
                  placeholder="Write question..."
                />
              </div>
              <div className="admin-field">
                <label htmlFor="questionImageUrl">Question Image URL (optional)</label>
                <input
                  id="questionImageUrl"
                  name="questionImageUrl"
                  value={questionForm.questionImageUrl}
                  onChange={onQuestionChange}
                  placeholder="https://..."
                />
              </div>
              <div className="admin-form-grid">
                <div className="admin-field">
                  <label htmlFor="optionA">Option A</label>
                  <input id="optionA" name="optionA" value={questionForm.optionA} onChange={onQuestionChange} required />
                </div>
                <div className="admin-field">
                  <label htmlFor="optionB">Option B</label>
                  <input id="optionB" name="optionB" value={questionForm.optionB} onChange={onQuestionChange} required />
                </div>
                <div className="admin-field">
                  <label htmlFor="optionC">Option C</label>
                  <input id="optionC" name="optionC" value={questionForm.optionC} onChange={onQuestionChange} />
                </div>
                <div className="admin-field">
                  <label htmlFor="optionD">Option D</label>
                  <input id="optionD" name="optionD" value={questionForm.optionD} onChange={onQuestionChange} />
                </div>
              </div>
              <div className="admin-form-grid">
                <div className="admin-field">
                  <label htmlFor="correctOption">Correct Option</label>
                  <select
                    id="correctOption"
                    name="correctOption"
                    value={questionForm.correctOption}
                    onChange={onQuestionChange}
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
                <div className="admin-field">
                  <label htmlFor="marks">Marks</label>
                  <input id="marks" name="marks" type="number" min={1} value={questionForm.marks} onChange={onQuestionChange} />
                </div>
              </div>
              <div className="admin-field">
                <label htmlFor="explanation">Explanation</label>
                <RichTextEditor
                  value={questionForm.explanation}
                  onChange={(value) => onQuestionEditorChange('explanation', value)}
                  placeholder="Write explanation..."
                />
              </div>
              <div className="admin-field">
                <label htmlFor="explanationImageUrl">Explanation Image URL (optional)</label>
                <input
                  id="explanationImageUrl"
                  name="explanationImageUrl"
                  value={questionForm.explanationImageUrl}
                  onChange={onQuestionChange}
                  placeholder="https://..."
                />
              </div>
              <button className="btn btn--primary" type="submit">
                Add Question
              </button>
            </form>

            <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Question</th>
                    <th>Correct</th>
                    <th>Marks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.length ? (
                    questions.map((q, idx) => (
                      <tr key={q.id}>
                        <td>{idx + 1}</td>
                        <td>
                          <div dangerouslySetInnerHTML={{ __html: q.questionText }} />
                          {q.questionImageUrl ? (
                            <div style={{ marginTop: '0.5rem' }}>
                              <img src={q.questionImageUrl} alt="Question media" className="admin-inline-image" />
                            </div>
                          ) : null}
                        </td>
                        <td>{q.correctOption}</td>
                        <td>{q.marks}</td>
                        <td>
                          <button
                            className="btn btn--secondary btn--sm"
                            type="button"
                            onClick={() => removeQuestion(q.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>No questions added for this test yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
