import { mockStudentDashboard } from '../student/data/mockStudentData';

export default function StudentNotificationsPage() {
  return (
    <section className="admin-card">
      <h2 className="heading-3">Notifications</h2>
      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
        {mockStudentDashboard.notifications.map((item) => (
          <article key={item.id} className="admin-import-row">
            <p className="heading-4">{item.title}</p>
            <p className="admin-stat-card__label">{item.message}</p>
            <p className="admin-stat-card__label">{item.time} {item.isRead ? '' : '• Unread'}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
