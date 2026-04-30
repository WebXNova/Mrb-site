export default function StudentLecturesPage({ lectures = [] }) {
  return (
    <section className="admin-card">
      <h2 className="heading-3">Lectures</h2>
      <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Course</th><th>Title</th><th>Topic</th><th>Watch</th></tr>
          </thead>
          <tbody>
            {lectures.length ? lectures.map((lecture) => (
              <tr key={lecture.id}>
                <td>{lecture.courseTitle}</td>
                <td>{lecture.title}</td>
                <td>{lecture.topic || '-'}</td>
                <td><a href={lecture.youtubeUrl} target="_blank" rel="noreferrer">Open</a></td>
              </tr>
            )) : <tr><td colSpan={4}>No lectures available.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
