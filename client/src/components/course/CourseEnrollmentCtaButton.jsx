import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import {
  buildCourseEnrollmentCtaFromState,
  buildGuestEnrollmentCtaFromAdmission,
} from '../../course/courseEnrollmentCta';
import { useEnrollmentState } from '../../hooks/useEnrollmentState';
import './CourseEnrollmentCtaButton.css';

function SwitchConfirmationModal({ open, enrolledCourseName, actionLabel, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="enrollment-switch-modal" role="dialog" aria-modal="true" aria-labelledby="switch-modal-title">
      <div className="enrollment-switch-modal__backdrop" onClick={onCancel} aria-hidden="true" />
      <div className="enrollment-switch-modal__panel">
        <h2 id="switch-modal-title" className="heading-3">
          Confirm course change
        </h2>
        <p>
          You are currently enrolled in <strong>{enrolledCourseName || 'another course'}</strong>.
          {actionLabel === 'Upgrade Course'
            ? ' Upgrading will replace your current course access with this premium course.'
            : ' Switching will replace your current course access.'}
        </p>
        <p className="enrollment-switch-modal__warning">
          This action cannot be undone automatically. Your previous course access will be deactivated.
        </p>
        <div className="enrollment-switch-modal__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="accent" onClick={onConfirm}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CourseEnrollmentCtaButton({
  courseId,
  labelContext = 'card',
  size = 'lg',
  fullWidth = false,
  variant,
  className = '',
  labelOverride,
  enrollmentState: enrollmentStateProp = null,
  courseAdmission = null,
  ...rest
}) {
  const navigate = useNavigate();
  const { state: fetchedState, loading } = useEnrollmentState(enrollmentStateProp ? null : courseId);
  const enrollmentState = enrollmentStateProp ?? fetchedState;
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);

  const cta = enrollmentState
    ? buildCourseEnrollmentCtaFromState(enrollmentState, {
        courseId,
        labelContext,
      })
    : buildGuestEnrollmentCtaFromAdmission(courseAdmission, {
        courseId,
        labelContext,
      });

  function handleClick(event) {
    if (!cta.requiresSwitchConfirmation) return;

    event.preventDefault();
    setPendingTarget(cta.to);
    setShowSwitchConfirm(true);
  }

  function handleConfirmSwitch() {
    setShowSwitchConfirm(false);
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
      <SwitchConfirmationModal
        open={showSwitchConfirm}
        enrolledCourseName={cta.enrolledCourseName}
        actionLabel={cta.label}
        onConfirm={handleConfirmSwitch}
        onCancel={() => {
          setShowSwitchConfirm(false);
          setPendingTarget(null);
        }}
      />
    </>
  );
}
