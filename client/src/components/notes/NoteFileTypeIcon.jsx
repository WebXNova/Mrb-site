import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import './note-file-type.css';

function resolveIcon(fileType) {
  if (fileType === 'pdf') return PictureAsPdfOutlinedIcon;
  if (fileType === 'docx') return DescriptionOutlinedIcon;
  return ImageOutlinedIcon;
}

function resolveModifier(fileType) {
  if (fileType === 'pdf') return 'pdf';
  if (fileType === 'docx') return 'docx';
  return 'image';
}

export default function NoteFileTypeIcon({ fileType, size = 'md', className = '' }) {
  const Icon = resolveIcon(fileType);
  const mod = resolveModifier(fileType);
  return (
    <span
      className={`note-file-type note-file-type--${mod} note-file-type--${size}${className ? ` ${className}` : ''}`}
      aria-hidden
    >
      <Icon fontSize="inherit" />
    </span>
  );
}
