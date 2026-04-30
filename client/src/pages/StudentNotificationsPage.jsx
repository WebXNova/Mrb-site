const demoNotifications = [
  { id: 1, title: 'Welcome to MRB', message: 'Your dashboard is ready.', time: 'Just now' },
  { id: 2, title: 'Manual Q&A', message: 'Questions are answered from admin panel.', time: 'Today' },
];

export default function StudentNotificationsPage() {
  return (
    <section className="admin-card">
      <h2 className="heading-3">Notifications</h2>
      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
        {demoNotifications.map((item) => (
          <article key={item.id} className="admin-import-row">
            <p className="heading-4">{item.title}</p>
            <p className="admin-stat-card__label">{item.message}</p>
            <p className="admin-stat-card__label">{item.time}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
