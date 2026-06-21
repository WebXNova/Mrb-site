export function getLectureEmbedUrl(url) {
  if (!url) return '';
  const shortMatch = url.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  const watchMatch = url.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  return url.includes('/embed/') ? url : url.replace('watch?v=', 'embed/');
}

export function getLectureYoutubeId(url) {
  if (!url) return '';
  const shortMatch = url.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return shortMatch[1];
  const watchMatch = url.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return watchMatch[1];
  const embedMatch = url.match(/\/embed\/([\w-]{11})/);
  return embedMatch ? embedMatch[1] : '';
}

export function getLectureThumbnailUrl(url) {
  const id = getLectureYoutubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
}
