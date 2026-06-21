import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';

/**
 * Shared AddAPhoto icon for ribbon and image upload UI.
 */
export default function AddPhotoIcon({ className = '', titleAccess }) {
  return (
    <AddAPhotoIcon
      className={className}
      fontSize="inherit"
      titleAccess={titleAccess}
      aria-hidden={titleAccess ? undefined : true}
    />
  );
}
