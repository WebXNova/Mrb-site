export default function TeacherSubjectChips({ subjects = [], maxVisible = 3 }) {
  const list = Array.isArray(subjects) ? subjects.filter(Boolean) : [];
  if (!list.length) {
    return <span className="admin-teacher-subjects admin-teacher-subjects--empty">—</span>;
  }

  const visible = list.slice(0, maxVisible);
  const overflow = list.length - visible.length;

  return (
    <div className="admin-teacher-subjects">
      {visible.map((subject) => (
        <span key={subject} className="admin-teacher-subjects__chip">
          {subject}
        </span>
      ))}
      {overflow > 0 ? <span className="admin-teacher-subjects__more">+{overflow}</span> : null}
    </div>
  );
}
