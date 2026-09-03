import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import EnrollmentSwitchModal from './EnrollmentSwitchModal';
import {
  ENROLLMENT_BUTTON_STATE,
  buildCourseEnrollmentCtaFromState,
  buildGuestEnrollmentCtaFromAdmission,
} from '../../course/courseEnrollmentCta';
import { isCatalogCourseFree } from '../../course/courseDiscovery';
import { useEnrollmentState } from '../../hooks/useEnrollmentState';
import './CourseEnrollmentCtaButton.css';

export default function CourseEnrollmentCtaButton({
  courseId,
  courseTitle = '',
  isFreeCourse = false,
  labelContext = 'card',
  size = 'lg',
  fullWidth = false,
  variant,
  className = '',
  labelOverride,
  enrollmentState: enrollmentStateProp = null,
  courseAdmission = null,
  course = null,
  ...rest
}) {
  const navigate = useNavigate();
  const { state: fetchedState, loading } = useEnrollmentState(enrollmentStateProp ? null : courseId);
  const enrollmentState = enrollmentStateProp ?? fetchedState;
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const freeCourse = isFreeCourse || isCatalogCourseFree(course);
  const ctaOptions = {
    courseId,
    labelContext,
    isFreeCourse: freeCourse,
    isGuest: !enrollmentState,
    targetCourseName: courseTitle || course?.title || '',
  };

  const cta = enrollmentState
    ? buildCourseEnrollmentCtaFromState(enrollmentState, ctaOptions)
    : buildGuestEnrollmentCtaFromAdmission(courseAdmission, ctaOptions);

  const switchMode =
    cta.buttonState === ENROLLMENT_BUTTON_STATE.UPGRADE_COURSE ? 'upgrade' : 'change';

  function handleClick(event) {
    if (!cta.requiresSwitchConfirmation || confirming) return;
    event.preventDefault();
    setPendingTarget(cta.to);
    setShowSwitchConfirm(true);
  }

  function handleConfirmSwitch() {
    if (confirming) return;
    setConfirming(true);
    const target = pendingTarget || cta.to;
    if (typeof target === 'string') {
      const url = new URL(target, window.location.origin);
      if (!url.searchParams.has('confirmSwitch')) {
        url.searchParams.set('confirmSwitch', '1');
      }
      if (courseId && !url.searchParams.has('targetCourseId')) {
        url.searchParams.set('targetCourseId', String(courseId));
      }
      navigate(`${url.pathname}${url.search}`);
    } else if (target?.pathname) {
      const params = new URLSearchParams(target.search || '');
      params.set('confirmSwitch', '1');
      if (courseId) params.set('targetCourseId', String(courseId));
      navigate({ ...target, search: `?${params.toString()}` });
    }
    setShowSwitchConfirm(false);
    setPendingTarget(null);
    setConfirming(false);
  }

  function handleCancel() {
    if (confirming) return;
    setShowSwitchConfirm(false);
    setPendingTarget(null);
  }

  if (loading && !enrollmentState) {
    return (
      <Button variant="secondary" size={size} fullWidth={fullWidth} disabled className={className}>
        Loading…
      </Button>
    );
  }

  return (
    <>
      <Button
        as={cta.disabled ? 'button' : Link}
        to={cta.disabled ? undefined : cta.to}
        variant={variant ?? cta.variant}
        size={size}
        fullWidth={fullWidth}
        disabled={cta.disabled}
        className={className}
        onClick={cta.requiresSwitchConfirmation ? handleClick : undefined}
        aria-disabled={cta.disabled || undefined}
        title={cta.tooltip || undefined}
        {...rest}
      >
        {labelOverride ?? cta.label}
      </Button>
      <EnrollmentSwitchModal
        open={showSwitchConfirm}
        mode={switchMode}
        currentCourseName={cta.enrolledCourseName}
        targetCourseName={cta.targetCourseName}
        confirming={confirming}
        onConfirm={handleConfirmSwitch}
        onCancel={handleCancel}
      />
    </>
  );
}
