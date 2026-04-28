import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';

const defaultTestForm = {
  title: '',
  description: '',
  subject: '',
  durationMinutes: 30,
  passingMarks: 0,
  maxAttempts: 1,
  shuffleQuestions: false,
  shuffleOptions: false,
  showExplanations: true,
  status: 'draft',
};

const defaultQuestionForm = {
  questionText: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctOption: 'A',
  explanation: '',
  marks: 1,
};

export default function AdminTestsPage() {
  const token = localStorage.getItem('admin_access_token');
  const [tests, setTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [testForm, setTestForm] = useState(defaultTestForm);
  const [questionForm, setQuestionForm] = useState(defaultQuestionForm);
  const [editingTestId, setEditingTestId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      durationMinutes: test.durationMinutes || 30,
      passingMarks: test.passingMarks || 0,
      maxAttempts: test.maxAttempts || 1,
      shuffleQuestions: !!test.shuffleQuestions,
      shuffleOptions: !!test.shuffleOptions,
      showExplanations: !!test.showExplanations,
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
    try {
      await adminApi.publishTest(token, testId);
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
      const payload = {
        questionText: questionForm.questionText,
        options: [
          { id: 'A', text: questionForm.optionA },
          { id: 'B', text: questionForm.optionB },
          { id: 'C', text: questionForm.optionC },
          { id: 'D', text: questionForm.optionD },
        ].filter((item) => item.text.trim()),
        correctOption: questionForm.correctOption,
        explanation: questionForm.explanation,
        marks: Number(questionForm.marks || 1),
      };
      await adminApi.createTestQuestion(token, selectedTestId, payload);
      setQuestionForm(defaultQuestionForm);
      await loadQuestions(selectedTestId);
    } catch (err) {
      setError(err.message || 'Failed to add question');
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

  return (
    <section className="admin-page">
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
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tests.length ? (
                tests.map((test) => (
                  <tr key={test.id}>
                    <td>{test.title}</td>
                    <td>{test.subject}</td>
                    <td>{test.status}</td>
                    <td>{test.durationMinutes} min</td>
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
                        <button className="btn btn--secondary btn--sm" onClick={() => removeTest(test.id)} type="button">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No tests yet.</td>
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
            <form className="admin-page" onSubmit={addQuestion} style={{ marginTop: '1rem' }}>
              <div className="admin-field">
                <label htmlFor="questionText">Question</label>
                <textarea
                  id="questionText"
                  name="questionText"
                  value={questionForm.questionText}
                  onChange={onQuestionChange}
                  required
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
                <textarea
                  id="explanation"
                  name="explanation"
                  value={questionForm.explanation}
                  onChange={onQuestionChange}
                  required
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
                        <td>{q.questionText}</td>
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
