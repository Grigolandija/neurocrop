type Props = {
  className?: string
}

export default function SoonBadge({ className = '' }: Props) {
  return <span className={`nc-soon-badge ${className}`.trim()}>Soon</span>
}
