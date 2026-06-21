import { useAnimatedStat } from '../../hooks/useAnimatedStat';

export default function StudentAnimatedStat({
  value,
  enabled = true,
  className = '',
  suffix = '',
  decimals = 0,
  as: Tag = 'span',
  inline = false,
}) {
  const { value: display, done, color } = useAnimatedStat(value, { enabled, decimals });

  return (
    <Tag
      className={`${inline ? 'sd-stat-inline' : 'sd-stat sp-stat-card__value'} sd-stat--animated${done ? ' sd-stat--pop' : ''}${className ? ` ${className}` : ''}`}
      style={color && !done ? { color } : undefined}
    >
      {display}
      {suffix}
    </Tag>
  );
}
