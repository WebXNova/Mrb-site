import './Button.css';

export default function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    fullWidth ? 'btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component className={classes} {...rest}>
      {leadingIcon ? <span className="btn__icon">{leadingIcon}</span> : null}
      <span className="btn__label">{children}</span>
      {trailingIcon ? <span className="btn__icon">{trailingIcon}</span> : null}
    </Component>
  );
}
