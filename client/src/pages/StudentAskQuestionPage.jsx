import { useState } from 'react';

export default function StudentAskQuestionPage() {
  const [subject, setSubject] = useState('physics');
  const [question, setQuestion] = useState('');

  return (
    <section className="admin-card">
      <h2 className="heading-3">Ask a Question</h2>
      <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
        Questions are answered manually by admin support from the admin panel.
      </p>

      <form
        className="admin-form-grid"
        style={{ marginTop: '1rem' }}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="admin-field">
          <label htmlFor="subject">Subject</label>
          <select id="subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option value="physics">Physics</option>
            <option value="chemistry">Chemistry</option>
            <option value="biology">Biology</option>
          </select>
        </div>

        <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="question">Your Question</label>
          <textarea
            id="question"
            placeholder="Write your full question here..."
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </div>

        <div className="admin-actions" style={{ gridColumn: '1 / -1' }}>
          <button className="btn btn--primary btn--sm" type="submit">Submit Question</button>
          <span className="admin-stat-card__label">Submission API will be connected in Phase 4.</span>
        </div>
      </form>
    </section>
  );
}
