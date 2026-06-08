/**
 * Button with loading state — preserves existing btn classes.
 */
export default function AdminLoadingButton({
  isLoading = false,
  loadingLabel = 'Saving…',
  children,
  className = 'btn btn--primary',
  disabled,
  type = 'button',
  ...rest
}) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      className={`${className}${isLoading ? ' btn--loading' : ''}`}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? (
        <>
          <span className="admin-spinner admin-spinner--sm" aria-hidden />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
