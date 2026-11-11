export function PinButton({
  label,
  pinned,
  onClick,
}: {
  label: string;
  pinned: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={pinned ? 'pin-button pinned' : 'pin-button'}
      aria-pressed={pinned}
      aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label}`}
      title={pinned ? 'Unpin' : 'Pin'}
      onClick={onClick}
    >
      {pinned ? '★' : '☆'}
    </button>
  );
}
