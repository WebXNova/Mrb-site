import { useCallback, useEffect, useRef, useState } from 'react';
import { enrollmentApi } from '../api/enrollmentApi';

/**
 * Load and apply enrollment prefill data for the registration form.
 * @param {{ targetCourseId: number|null, enabled?: boolean }} options
 */
export function useEnrollmentPrefill({ targetCourseId, enabled = true }) {
  const [loading, setLoading] = useState(false);
  const [sourceCourseName, setSourceCourseName] = useState('');
  const [sourceEnrollmentId, setSourceEnrollmentId] = useState(null);
  const [availableSources, setAvailableSources] = useState([]);
  const [prefillFields, setPrefillFields] = useState({});
  const [prefilledFieldNames, setPrefilledFieldNames] = useState([]);
  const [discardedFields, setDiscardedFields] = useState([]);
  const [hasPrefill, setHasPrefill] = useState(false);
  const requestIdRef = useRef(0);

  const loadPrefill = useCallback(
    async (selectedSourceEnrollmentId = null) => {
      if (!enabled || !targetCourseId) {
        setPrefillFields({});
        setPrefilledFieldNames([]);
        setDiscardedFields([]);
        setHasPrefill(false);
        return { fields: {}, applied: false };
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);

      try {
        const response = await enrollmentApi.getPrefillData({
          targetCourseId,
          sourceEnrollmentId: selectedSourceEnrollmentId,
        });
        if (requestId !== requestIdRef.current) return { fields: {}, applied: false };

        const data = response?.data ?? {};
        const fields = data.fields && typeof data.fields === 'object' ? data.fields : {};
        const names = Array.isArray(data.prefilledFieldNames)
          ? data.prefilledFieldNames
          : Object.keys(fields);

        setAvailableSources(Array.isArray(data.availableSources) ? data.availableSources : []);
        setSourceCourseName(data.sourceCourseName || '');
        setSourceEnrollmentId(data.sourceEnrollmentId ?? selectedSourceEnrollmentId ?? null);
        setPrefillFields(fields);
        setPrefilledFieldNames(names);
        setDiscardedFields(Array.isArray(data.discardedFields) ? data.discardedFields : []);
        setHasPrefill(Boolean(data.hasPrefill) || names.length > 0);

        return { fields, applied: names.length > 0 };
      } catch {
        if (requestId !== requestIdRef.current) return { fields: {}, applied: false };
        setAvailableSources([]);
        setSourceCourseName('');
        setSourceEnrollmentId(null);
        setPrefillFields({});
        setPrefilledFieldNames([]);
        setDiscardedFields([]);
        setHasPrefill(false);
        return { fields: {}, applied: false };
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [enabled, targetCourseId]
  );

  useEffect(() => {
    if (!enabled || !targetCourseId) return undefined;
    loadPrefill(null);
    return () => {
      requestIdRef.current += 1;
    };
  }, [enabled, targetCourseId, loadPrefill]);

  const clearPrefillState = useCallback(() => {
    setPrefillFields({});
    setPrefilledFieldNames([]);
    setDiscardedFields([]);
    setHasPrefill(false);
    setSourceCourseName('');
  }, []);

  return {
    loading,
    sourceCourseName,
    sourceEnrollmentId,
    availableSources,
    prefillFields,
    prefilledFieldNames,
    discardedFields,
    hasPrefill,
    loadPrefill,
    clearPrefillState,
  };
}
