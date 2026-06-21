import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';

let registered = false;

export function ensureHistoryChartsRegistered() {
  if (registered) return;
  ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);
  registered = true;
}

/** @param {CanvasRenderingContext2D} ctx @param {string} from @param {string} to */
export function createBarGradient(ctx, from, to) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  return gradient;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} maxWidth
 * @param {number} lineHeight
 */
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;

  const lines = [];
  let line = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  lines.push(line);

  const offsetY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((ln, index) => {
    ctx.fillText(ln, x, offsetY + index * lineHeight);
  });
}

/**
 * Donut center label — title, large value, and sublabel sized to the hole.
 *
 * @param {{ title?: string, value?: string, sublabel?: string } | string} configOrLabel
 * @param {string} [legacySublabel]
 */
export function createCenterTextPlugin(configOrLabel, legacySublabel = '') {
  let title = '';
  let value = '';
  let sublabel = '';

  if (typeof configOrLabel === 'string') {
    const label = configOrLabel.trim();
    const passRateMatch = label.match(/^Overall Pass Rate\s+(.+)$/i);
    if (passRateMatch) {
      title = 'Overall Pass Rate';
      value = passRateMatch[1].trim();
    } else {
      title = label;
    }
    sublabel = String(legacySublabel || '').trim();
  } else {
    title = String(configOrLabel?.title || '').trim();
    value = String(configOrLabel?.value || '').trim();
    sublabel = String(configOrLabel?.sublabel || '').trim();
  }

  return {
    id: 'historyCenterText',
    afterDraw(chart) {
      try {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;

        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;

        const meta = chart.getDatasetMeta(0);
        const arc = meta?.data?.[0];
        const chartMin = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
        let maxTextWidth = chartMin * 0.36;
        if (arc && typeof arc.innerRadius === 'number' && arc.innerRadius > 0) {
          maxTextWidth = Math.min(maxTextWidth, arc.innerRadius * 1.85);
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const hasTitle = Boolean(title);
        const hasValue = Boolean(value);
        const hasSublabel = Boolean(sublabel);

        if (hasTitle) {
          ctx.fillStyle = '#94A3B8';
          ctx.font = `500 ${Math.min(12, Math.max(10, maxTextWidth / 10))}px system-ui, sans-serif`;
          const titleY = hasValue ? centerY - (hasSublabel ? 18 : 12) : centerY;
          drawWrappedText(ctx, title, centerX, titleY, maxTextWidth, 13);
        }

        if (hasValue) {
          ctx.fillStyle = '#FFFFFF';
          const valueFontSize = Math.min(26, Math.max(15, maxTextWidth / 2.8));
          ctx.font = `700 ${valueFontSize}px system-ui, sans-serif`;
          const valueY = hasTitle ? centerY + 2 : centerY - (hasSublabel ? 6 : 0);
          ctx.fillText(value, centerX, valueY);
        }

        if (hasSublabel) {
          ctx.fillStyle = '#94A3B8';
          ctx.font = '500 11px system-ui, sans-serif';
          const subY = hasValue ? centerY + 20 : centerY + 12;
          drawWrappedText(ctx, sublabel, centerX, subY, maxTextWidth, 12);
        }

        ctx.restore();
      } catch {
        // Never break chart rendering if center text fails.
      }
    },
  };
}
