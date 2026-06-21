import { mockStudentDashboard } from '../student/data/mockStudentData';

export default function StudentNotificationsPage() {
  return (
    <section className="admin-card">
      <h2 className="heading-3">Notifications</h2>
      <div className="student-notifications-list">
        {mockStudentDashboard.notifications.map((item) => (
          <article key={item.id} className="student-notifications-list__item">
            <div className="student-notifications-list__head">
              <p className="student-notifications-list__title">{item.title}</p>
              {!item.isRead ? <span className="student-notifications-list__badge">New</span> : null}
            </div>
            <p className="student-notifications-list__message">{item.message}</p>
            <p className="student-notifications-list__time">{item.time}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
