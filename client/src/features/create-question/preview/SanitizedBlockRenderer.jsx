import { memo } from 'react';
import { resolveImagePreviewSrc } from '../utils/image/imagePreviewUrl.js';

/**
 * Renders parsed preview blocks — no dangerouslySetInnerHTML.
 *
 * @param {{ blocks: import('../utils/preview/parseQuestionPreviewBlocks.js').PreviewBlock[], emptyLabel?: string, className?: string }} props
 */
function SanitizedBlockRenderer({ blocks, emptyLabel = 'Nothing to preview yet', className = '' }) {
  if (!blocks?.length) {
    return <p className="sp-empty">{emptyLabel}</p>;
  }

  return (
    <div className={`sp-blocks ${className}`.trim()} aria-readonly="true">
      {blocks.map((block, index) => {
        if (block.type === 'text') {
          return (
            <p key={`t-${index}`} className="sp-blocks__text">
              {block.text}
            </p>
          );
        }
        if (block.type === 'formula') {
          return (
            <div key={`f-${index}`} className="sp-blocks__formula" aria-label="Formula">
              <span className="sp-blocks__formula-icon" aria-hidden="true">
                ƒ
              </span>
              <code>{block.latex}</code>
            </div>
          );
        }
        if (block.type === 'image') {
          const src = resolveImagePreviewSrc(block.src);
          if (!src) return null;
          return (
            <figure key={`i-${index}`} className="sp-blocks__figure">
              <img
                src={src}
                alt={block.alt || 'Image'}
                className="sp-blocks__img"
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
              />
            </figure>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={`tb-${index}`} className="sp-blocks__table-wrap">
              <table className="sp-blocks__table">
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`r-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`c-${cellIndex}`}>{cell}</td>
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

export default memo(SanitizedBlockRenderer);
