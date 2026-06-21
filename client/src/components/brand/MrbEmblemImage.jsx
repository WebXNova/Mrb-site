export const MRB_LOGO_ICON_SRC = '/brand/mrb-logo-icon.png';
export const MRB_LOGO_WORDMARK_SRC = '/brand/mrb-logo-wordmark.png';

export default function MrbEmblemImage({ className, width, height, alt = '', loading = 'lazy' }) {
  return (
    <img
      src={MRB_LOGO_ICON_SRC}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
    />
  );
}
