/**
 * Word-style document canvas — continuous authoring surface.
 */
export default function DocumentCanvas({ children }) {
  return (
    <article className="qaw-canvas" aria-label="Question authoring document">
      <div className="qaw-canvas__paper">{children}</div>
    </article>
  );
}
