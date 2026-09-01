export default function ExamFocusNote() {
  return (
    <section className="ti-card ti-card--wide" aria-labelledby="ti-focus-heading">
      <h2 className="ti-section-title" id="ti-focus-heading">
        During the test
      </h2>
      <ul className="ti-instructions__list">
        <li>Stay on the test page. Leaving or switching away is treated as suspicious activity.</li>
        <li>
          You can enter fullscreen to focus. If this exam requires fullscreen, stay in that view.
          The first two times you leave, you will be warned. The
          third time, this test is locked for you only — your account and other tests are not banned.
        </li>
        <li>If the page reloads, your saved answers can usually be restored. Use Continue if you are asked.</li>
      </ul>
    </section>
  );
}
