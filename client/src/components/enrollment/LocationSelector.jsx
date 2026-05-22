import { useEffect, useMemo, useState } from 'react';
import { locationsApi } from '../../api/locationsApi.js';

const EMPTY_SELECTION = {
  province_id: '',
  division_id: '',
  district_id: '',
  city_id: '',
};

function SelectField({ label, value, onChange, disabled, loading, placeholder, options, error }) {
  return (
    <div className="enrollment-field">
      <label>
        {label} <span>*</span>
      </label>
      <select value={value} onChange={onChange} disabled={disabled}>
        <option value="">{loading ? 'Loading...' : placeholder}</option>
        {options.map((item) => (
          <option key={item.id} value={String(item.id)}>
            {item.name}
          </option>
        ))}
      </select>
      {loading ? (
        <p className="enrollment-field__loading">
          <span className="enrollment-spinner" aria-hidden="true" />
          Loading...
        </p>
      ) : null}
      {error ? <p className="enrollment-field__error">{error}</p> : null}
    </div>
  );
}

export default function LocationSelector({ value = EMPTY_SELECTION, onChange, errors = {} }) {
  const [provinces, setProvinces] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState({
    provinces: false,
    divisions: false,
    districts: false,
    cities: false,
  });
  const [loadError, setLoadError] = useState('');
  const selection = useMemo(
    () => ({
      province_id: value?.province_id || '',
      division_id: value?.division_id || '',
      district_id: value?.district_id || '',
      city_id: value?.city_id || '',
    }),
    [value?.province_id, value?.division_id, value?.district_id, value?.city_id]
  );

  const emitChange = (nextSelection) => {
    if (typeof onChange === 'function') {
      onChange(nextSelection);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading((prev) => ({ ...prev, provinces: true }));
      setLoadError('');
      try {
        const response = await locationsApi.provinces();
        if (cancelled) return;
        setProvinces(response?.data || []);
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Failed to load provinces');
      } finally {
        if (!cancelled) setLoading((prev) => ({ ...prev, provinces: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selection.province_id) {
      setDivisions([]);
      return undefined;
    }
    (async () => {
      setLoading((prev) => ({ ...prev, divisions: true }));
      setLoadError('');
      try {
        const response = await locationsApi.divisions(selection.province_id);
        if (cancelled) return;
        setDivisions(response?.data || []);
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Failed to load divisions');
      } finally {
        if (!cancelled) setLoading((prev) => ({ ...prev, divisions: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection.province_id]);

  useEffect(() => {
    let cancelled = false;
    if (!selection.division_id) {
      setDistricts([]);
      return undefined;
    }
    (async () => {
      setLoading((prev) => ({ ...prev, districts: true }));
      setLoadError('');
      try {
        const response = await locationsApi.districts(selection.division_id);
        if (cancelled) return;
        setDistricts(response?.data || []);
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Failed to load districts');
      } finally {
        if (!cancelled) setLoading((prev) => ({ ...prev, districts: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection.division_id]);

  useEffect(() => {
    let cancelled = false;
    if (!selection.district_id) {
      setCities([]);
      return undefined;
    }
    (async () => {
      setLoading((prev) => ({ ...prev, cities: true }));
      setLoadError('');
      try {
        const response = await locationsApi.cities(selection.district_id);
        if (cancelled) return;
        setCities(response?.data || []);
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Failed to load cities');
      } finally {
        if (!cancelled) setLoading((prev) => ({ ...prev, cities: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection.district_id]);

  const provincePlaceholder = useMemo(() => (loading.provinces ? 'Loading provinces...' : 'Select province'), [loading.provinces]);

  function handleProvinceChange(event) {
    const province_id = event.target.value;
    emitChange({
      province_id,
      division_id: '',
      district_id: '',
      city_id: '',
    });
    setDivisions([]);
    setDistricts([]);
    setCities([]);
  }

  function handleDivisionChange(event) {
    const division_id = event.target.value;
    emitChange({
      ...selection,
      division_id,
      district_id: '',
      city_id: '',
    });
    setDistricts([]);
    setCities([]);
  }

  function handleDistrictChange(event) {
    const district_id = event.target.value;
    emitChange({
      ...selection,
      district_id,
      city_id: '',
    });
    setCities([]);
  }

  function handleCityChange(event) {
    emitChange({
      ...selection,
      city_id: event.target.value,
    });
  }

  return (
    <div className="enrollment-grid enrollment-grid--locations">
      <SelectField
        label="Province"
        value={selection.province_id}
        onChange={handleProvinceChange}
        disabled={loading.provinces}
        loading={loading.provinces}
        placeholder={provincePlaceholder}
        options={provinces}
        error={errors.province_id}
      />

      <SelectField
        label="Division"
        value={selection.division_id}
        onChange={handleDivisionChange}
        disabled={!selection.province_id || loading.divisions}
        loading={loading.divisions}
        placeholder={!selection.province_id ? 'Select Province first' : 'Select division'}
        options={divisions}
        error={errors.division_id}
      />

      <SelectField
        label="District"
        value={selection.district_id}
        onChange={handleDistrictChange}
        disabled={!selection.division_id || loading.districts}
        loading={loading.districts}
        placeholder={!selection.division_id ? 'Select Division first' : 'Select district'}
        options={districts}
        error={errors.district_id}
      />

      <SelectField
        label="City"
        value={selection.city_id}
        onChange={handleCityChange}
        disabled={!selection.district_id || loading.cities}
        loading={loading.cities}
        placeholder={!selection.district_id ? 'Select District first' : 'Select city'}
        options={cities}
        error={errors.city_id}
      />

      {loadError ? <p className="enrollment-field__error enrollment-field__error--full">{loadError}</p> : null}
    </div>
  );
}
