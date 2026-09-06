'use client';

import { useEffect, useId, useState } from 'react';

const DEFAULT_COLOR = '#4F46E5';
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

function getInitialValues(project) {
  return {
    name: project?.name ?? '',
    projectKey: project?.projectKey ?? project?.key ?? '',
    description: project?.description ?? '',
    color: project?.color ?? DEFAULT_COLOR,
  };
}

export default function ProjectForm({
  initialProject = null,
  submitLabel = 'Save project',
  onSubmit,
  onCancel,
  submitting = false,
}) {
  const formId = useId();
  const [values, setValues] = useState(() => getInitialValues(initialProject));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    setValues(getInitialValues(initialProject));
    setErrors({});
    setSubmitError('');
  }, [
    initialProject?.id,
    initialProject?.name,
    initialProject?.projectKey,
    initialProject?.key,
    initialProject?.description,
    initialProject?.color,
  ]);

  function updateField(field, value) {
    const nextValue = field === 'projectKey' ? value.toUpperCase() : value;

    setValues((current) => ({
      ...current,
      [field]: nextValue,
    }));

    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });

    setSubmitError('');
  }

  function validate() {
    const nextErrors = {};
    const name = values.name.trim();
    const projectKey = values.projectKey.trim().toUpperCase();
    const description = values.description.trim();
    const color = values.color.trim().toUpperCase();

    if (!name) {
      nextErrors.name = 'Project name is required.';
    } else if (name.length > 120) {
      nextErrors.name = 'Project name must be 120 characters or fewer.';
    }

    if (!projectKey) {
      nextErrors.projectKey = 'Project key is required.';
    } else if (!PROJECT_KEY_PATTERN.test(projectKey)) {
      nextErrors.projectKey =
        'Use 2–10 uppercase letters or numbers, beginning with a letter.';
    }

    if (description.length > 1000) {
      nextErrors.description = 'Description must be 1,000 characters or fewer.';
    }

    if (!HEX_COLOR_PATTERN.test(color)) {
      nextErrors.color = 'Choose a valid project color.';
    }

    setErrors(nextErrors);

    return {
      valid: Object.keys(nextErrors).length === 0,
      data: {
        name,
        projectKey,
        description,
        color,
      },
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');

    const result = validate();

    if (!result.valid) {
      return;
    }

    if (typeof onSubmit !== 'function') {
      setSubmitError('Unable to save the project. Please try again.');
      return;
    }

    try {
      await onSubmit(result.data);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : 'Unable to save the project. Please try again.',
      );
    }
  }

  function handleCancel() {
    if (!submitting && typeof onCancel === 'function') {
      onCancel();
    }
  }

  const nameId = `${formId}-name`;
  const keyId = `${formId}-key`;
  const descriptionId = `${formId}-description`;
  const colorId = `${formId}-color`;

  return (
    <form
      className="project-form"
      onSubmit={handleSubmit}
      noValidate
      aria-busy={submitting}
    >
      {submitError && (
        <div className="error-message form-error" role="alert">
          {submitError}
        </div>
      )}

      <div className="form-group form-field">
        <label className="form-label" htmlFor={nameId}>
          Project name
        </label>
        <input
          id={nameId}
          className="form-input"
          type="text"
          value={values.name}
          onChange={(event) => updateField('name', event.target.value)}
          maxLength={120}
          autoComplete="off"
          disabled={submitting}
          required
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
          placeholder="Website redesign"
        />
        {errors.name && (
          <p id={`${nameId}-error`} className="field-error form-error">
            {errors.name}
          </p>
        )}
      </div>

      <div className="form-group form-field">
        <label className="form-label" htmlFor={keyId}>
          Project key
        </label>
        <input
          id={keyId}
          className="form-input"
          type="text"
          value={values.projectKey}
          onChange={(event) => updateField('projectKey', event.target.value)}
          minLength={2}
          maxLength={10}
          pattern="[A-Z][A-Z0-9]{1,9}"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          disabled={submitting}
          required
          aria-invalid={Boolean(errors.projectKey)}
          aria-describedby={`${keyId}-hint${
            errors.projectKey ? ` ${keyId}-error` : ''
          }`}
          placeholder="WEB"
        />
        <p id={`${keyId}-hint`} className="form-hint">
          2–10 letters or numbers, beginning with a letter. Keys are converted
          to uppercase.
        </p>
        {errors.projectKey && (
          <p id={`${keyId}-error`} className="field-error form-error">
            {errors.projectKey}
          </p>
        )}
      </div>

      <div className="form-group form-field">
        <label className="form-label" htmlFor={descriptionId}>
          Description <span className="optional-label">(optional)</span>
        </label>
        <textarea
          id={descriptionId}
          className="form-input form-textarea"
          value={values.description}
          onChange={(event) => updateField('description', event.target.value)}
          maxLength={1000}
          rows={4}
          disabled={submitting}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={
            errors.description ? `${descriptionId}-error` : undefined
          }
          placeholder="Describe the purpose and goals of this project."
        />
        {errors.description && (
          <p id={`${descriptionId}-error`} className="field-error form-error">
            {errors.description}
          </p>
        )}
      </div>

      <div className="form-group form-field">
        <label className="form-label" htmlFor={colorId}>
          Project color
        </label>
        <div className="color-field">
          <input
            id={colorId}
            className="color-input"
            type="color"
            value={
              HEX_COLOR_PATTERN.test(values.color)
                ? values.color
                : DEFAULT_COLOR
            }
            onChange={(event) => updateField('color', event.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(errors.color)}
            aria-describedby={errors.color ? `${colorId}-error` : undefined}
          />
          <span className="color-value" aria-hidden="true">
            {values.color.toUpperCase()}
          </span>
        </div>
        {errors.color && (
          <p id={`${colorId}-error`} className="field-error form-error">
            {errors.color}
          </p>
        )}
      </div>

      <div className="form-actions">
        {typeof onCancel === 'function' && (
          <button
            className="button btn button-secondary btn-secondary"
            type="button"
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button
          className="button btn button-primary btn-primary"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}