export default function OfflineBanner({ isOnline }) {
  if (isOnline) return null;

  return (
    <div className="tt-offline-banner" role="status" aria-live="polite">
      You are offline. Answers will sync when your connection is restored.
    </div>
  );
}
