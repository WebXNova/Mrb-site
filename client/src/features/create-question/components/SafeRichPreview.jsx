import { resolveImagePreviewSrc } from '../utils/image/imagePreviewUrl.js';
import { parseQuestionPreviewBlocks } from '../utils/preview/parseQuestionPreviewBlocks.js';

/**
 * Renders sanitized question content as safe preview blocks.
 * Never uses dangerouslySetInnerHTML — only validated text and image URLs.
 */
export default function SafeRichPreview({ sanitizedHtml, emptyLabel = 'No question text yet' }) {
  const blocks = parseQuestionPreviewBlocks(sanitizedHtml);

  if (blocks.length === 0) {
    return <p className="cq-preview__empty">{emptyLabel}</p>;
  }

  return (
    <div className="qaw-safe-preview" aria-readonly="true">
      {blocks.map((block, index) => {
        if (block.type === 'text') {
          return (
            <p key={`text-${index}`} className="qaw-safe-preview__text">
              {block.text}
            </p>
          );
        }
        if (block.type === 'formula') {
          return (
            <div key={`formula-${index}`} className="qaw-safe-preview__formula" aria-label="Formula">
              <span className="qaw-safe-preview__formula-label">ƒ</span>
              <code>{block.latex}</code>
            </div>
          );
        }
        if (block.type === 'image') {
          const src = resolveImagePreviewSrc(block.src);
          if (!src) return null;
          return (
            <figure key={`img-${index}`} className="qaw-safe-preview__figure">
              <img
                src={src}
                alt={block.alt || 'Question image'}
                className="qaw-safe-preview__img"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            </figure>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={`table-${index}`} className="qaw-safe-preview__table-wrap">
              <table className="qaw-safe-preview__table">
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
