import { adminRoute } from '../../config/adminPaths';
import { Link } from 'react-router-dom';
import { getAdminToken } from '../../auth/session';
import QuestionContentSection from '../components/QuestionContentSection';
import QuestionInformationSection from '../components/QuestionInformationSection';
import { useQuestionContentForm } from '../hooks/useQuestionContentForm';
import { useQuestionInformationForm } from '../hooks/useQuestionInformationForm';
import { adminApi } from '../../api/adminApi';
import { PHASE_1_QUESTION_TYPE } from '../constants/questionBank.constants';

export default function AdminCreateQuestionPage() {
  const token = getAdminToken();
  const {
    form,
    courses,
    subjects,
    isLoadingCourses,
    coursesError,
    isLoadingSubjects,
    subjectsError,
    getFieldError,
    showError,
    onChange,
    onBlur,
  } = useQuestionInformationForm(token);

  const {
    form: contentForm,
    imageUrlDraft,
    imageUrlDraftError,
    getFieldError: getContentFieldError,
    showError: showContentError,
    onQuestionTextChange,
    onQuestionTextBlur,
    onImageUrlDraftChange,
    applyImageUrlDraft,
    setUploadedImageUrl,
    removeQuestionImage,
    beginReplaceImage,
  } = useQuestionContentForm();

  async function handleUploadQuestionImage(file) {
    const response = await adminApi.uploadQuestionBankImage(token, file);
    const url = response?.data?.url;
    if (!url) {
      throw new Error('Image upload did not return a URL.');
    }
    const ok = setUploadedImageUrl(url);
    if (!ok) {
      throw new Error('Uploaded image URL was rejected.');
    }
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <div className="admin-row-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="heading-3">Create Question</h2>
            <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
              Question Bank · Phase 1 single-choice MCQ ({PHASE_1_QUESTION_TYPE})
            </p>
          </div>
          <Link className="btn btn--secondary btn--sm" to={adminRoute()}>
            Back to dashboard
          </Link>
        </div>
      </section>

      <QuestionInformationSection
        form={form}
        courses={courses}
        subjects={subjects}
        isLoadingCourses={isLoadingCourses}
        coursesError={coursesError}
        isLoadingSubjects={isLoadingSubjects}
        subjectsError={subjectsError}
        getFieldError={getFieldError}
        showError={showError}
        onChange={onChange}
        onBlur={onBlur}
      />

      <QuestionContentSection
        form={contentForm}
        imageUrlDraft={imageUrlDraft}
        imageUrlDraftError={imageUrlDraftError}
        getFieldError={getContentFieldError}
        showError={showContentError}
        onQuestionTextChange={onQuestionTextChange}
        onQuestionTextBlur={onQuestionTextBlur}
        onImageUrlDraftChange={onImageUrlDraftChange}
        onApplyImageUrl={applyImageUrlDraft}
        onUploadImage={handleUploadQuestionImage}
        onRemoveImage={removeQuestionImage}
        onReplaceImage={beginReplaceImage}
      />
    </section>
  );
}
