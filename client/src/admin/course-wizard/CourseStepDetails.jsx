import PremiumFormField from '../components/courses/PremiumFormField';
import AdminToggleSwitch from '../components/courses/AdminToggleSwitch';
import ThumbnailDropzone from '../components/courses/ThumbnailDropzone';

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export default function CourseStepDetails({
  course,
  onChange,
  shortDescriptionLen,
  descriptionLen,
  titleLen,
  fieldErrors,
  imageUploading,
  imageInputRef,
  onImageChange,
  onClearImage,
}) {
  return (
    <div className="admin-course-wizard-step">
      <div className="premium-form-grid premium-form-grid--2col">
        <PremiumFormField
          id="wiz_title"
          label="Course title"
          required
          counter={`${titleLen} / 180`}
          counterWarn={titleLen > 160}
          error={fieldErrors.title}
          hint="A clear, descriptive name shown across the catalog and student dashboard."
          className="premium-form-grid__span-2"
        >
          <input
            id="wiz_title"
            className="premium-field__input"
            name="title"
            value={course.title}
            onChange={onChange}
            autoComplete="off"
            placeholder="e.g. Physics from zero to hero"
            aria-invalid={Boolean(fieldErrors.title)}
            maxLength={180}
          />
        </PremiumFormField>

        <PremiumFormField
          id="wiz_level"
          label="Difficulty level"
          required
          hint="Helps students find courses matched to their experience."
        >
          <select id="wiz_level" className="premium-field__select" name="level" value={course.level} onChange={onChange}>
            {LEVEL_OPTIONS.map((lvl) => (
              <option key={lvl.value} value={lvl.value}>
                {lvl.label}
              </option>
            ))}
          </select>
        </PremiumFormField>

        <PremiumFormField id="wiz_visibility" label="Catalog visibility">
          <AdminToggleSwitch
            id="wiz_visibility"
            name="is_active"
            checked={!!course.is_active}
            onChange={onChange}
            label="Active in catalog when published"
            hint="Inactive courses stay hidden from public listings."
          />
        </PremiumFormField>

        <PremiumFormField
          id="wiz_short"
          label="Short description"
          counter={`${shortDescriptionLen} / 512`}
          hint="Optional summary for course cards and search results."
          className="premium-form-grid__span-2"
        >
          <textarea
            id="wiz_short"
            className="premium-field__textarea"
            name="short_description"
            value={course.short_description ?? ''}
            onChange={onChange}
            rows={3}
            maxLength={512}
            placeholder="Brief overview students see before enrolling"
          />
        </PremiumFormField>

        <PremiumFormField
          id="wiz_desc"
          label="Full description"
          required
          counter={`${descriptionLen} characters (min 30)`}
          counterWarn={descriptionLen > 0 && descriptionLen < 30}
          error={fieldErrors.description}
          hint="Detailed overview of outcomes, syllabus highlights, and who this course is for."
          className="premium-form-grid__span-2"
        >
          <textarea
            id="wiz_desc"
            className="premium-field__textarea"
            name="description"
            value={course.description}
            onChange={onChange}
            rows={8}
            placeholder="Describe what students will learn, prerequisites, and course structure…"
            aria-invalid={Boolean(fieldErrors.description)}
          />
        </PremiumFormField>

        <PremiumFormField
          id="wiz_thumb"
          label="Course thumbnail"
          required
          hint="Required before publish. Use a high-quality image (16:9 works best)."
          className="premium-form-grid__span-2"
        >
          <ThumbnailDropzone
            id="wiz_thumb"
            inputRef={imageInputRef}
            imageUrl={course.thumbnail_url}
            uploading={imageUploading}
            onFileChange={onImageChange}
            onClear={onClearImage}
          />
        </PremiumFormField>
      </div>
    </div>
  );
}
