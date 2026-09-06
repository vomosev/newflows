"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as taskConstants from "../lib/taskConstants";

const FALLBACK_STATUSES = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

const FALLBACK_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function humanize(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function resolveLabel(value, type, definition) {
  if (definition && typeof definition === "object") {
    const directLabel =
      definition.label ?? definition.name ?? definition.title ?? definition.text;

    if (typeof directLabel === "string" && directLabel.trim()) {
      return directLabel.trim();
    }
  }

  const lookup =
    type === "status"
      ? taskConstants.STATUS_LABELS ?? taskConstants.TASK_STATUS_LABELS
      : taskConstants.PRIORITY_LABELS ?? taskConstants.TASK_PRIORITY_LABELS;

  if (lookup && typeof lookup === "object" && lookup[value]) {
    return String(lookup[value]);
  }

  const labelHelper =
    type === "status"
      ? taskConstants.getStatusLabel
      : taskConstants.getPriorityLabel;

  if (typeof labelHelper === "function") {
    try {
      const label = labelHelper(value);
      if (typeof label === "string" && label.trim()) {
        return label.trim();
      }
    } catch {
      // Fall back to a human-readable value.
    }
  }

  return humanize(value);
}

function normalizeOptions(source, type, fallback) {
  let entries = [];

  if (Array.isArray(source)) {
    entries = source.map((definition) => [null, definition]);
  } else if (source && typeof source === "object") {
    entries = Object.entries(source);
  }

  const options = entries
    .map(([key, definition]) => {
      if (typeof definition === "string") {
        if (key && !/^\d+$/.test(key)) {
          return {
            value: key,
            label: definition,
          };
        }

        return {
          value: definition,
          label: resolveLabel(definition, type),
        };
      }

      if (!definition || typeof definition !== "object") {
        return null;
      }

      const value =
        definition.value ??
        definition.id ??
        definition.key ??
        definition.status ??
        definition.priority ??
        key;

      if (value === undefined || value === null || String(value).trim() === "") {
        return null;
      }

      const normalizedValue = String(value).trim();

      return {
        value: normalizedValue,
        label: resolveLabel(normalizedValue, type, definition),
      };
    })
    .filter(Boolean);

  return options.length > 0 ? options : fallback;
}

const statusSource =
  taskConstants.TASK_STATUSES ??
  taskConstants.TASK_STATUS_DEFINITIONS ??
  taskConstants.STATUS_DEFINITIONS ??
  taskConstants.STATUS_OPTIONS ??
  taskConstants.ALLOWED_TASK_STATUSES ??
  taskConstants.STATUSES;

const prioritySource =
  taskConstants.TASK_PRIORITIES ??
  taskConstants.TASK_PRIORITY_DEFINITIONS ??
  taskConstants.PRIORITY_DEFINITIONS ??
  taskConstants.PRIORITY_OPTIONS ??
  taskConstants.ALLOWED_TASK_PRIORITIES ??
  taskConstants.PRIORITIES;

const STATUS_OPTIONS = normalizeOptions(
  statusSource,
  "status",
  FALLBACK_STATUSES,
);

const PRIORITY_OPTIONS = normalizeOptions(
  prioritySource,
  "priority",
  FALLBACK_PRIORITIES,
);

function findAllowedValue(value, options, preferredFallback) {
  const normalizedValue =
    value === undefined || value === null ? "" : String(value).trim();

  const exactMatch = options.find(
    (option) => option.value === normalizedValue,
  );

  if (exactMatch) {
    return exactMatch.value;
  }

  const caseInsensitiveMatch = options.find(
    (option) =>
      option.value.toLowerCase() === normalizedValue.toLowerCase(),
  );

  if (caseInsensitiveMatch) {
    return caseInsensitiveMatch.value;
  }

  const preferred = options.find(
    (option) =>
      option.value.toLowerCase() === preferredFallback.toLowerCase(),
  );

  return preferred?.value ?? options[0]?.value ?? "";
}

function formatDateInput(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnlyMatch) {
      return dateOnlyMatch[1];
    }
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function createInitialValues(initialTask) {
  return {
    title: initialTask?.title ?? "",
    description: initialTask?.description ?? "",
    status: findAllowedValue(
      initialTask?.status,
      STATUS_OPTIONS,
      "backlog",
    ),
    priority: findAllowedValue(
      initialTask?.priority,
      PRIORITY_OPTIONS,
      "medium",
    ),
    dueDate: formatDateInput(
      initialTask?.dueDate ?? initialTask?.due_date,
    ),
  };
}

export default function TaskForm({
  initialTask = null,
  onSubmit,
  onCancel,
  submitting = false,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const priorityId = useId();
  const dueDateId = useId();
  const dialogTitleId = useId();

  const formRef = useRef(null);
  const titleRef = useRef(null);

  const [values, setValues] = useState(() =>
    createInitialValues(initialTask),
  );
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [locallySubmitting, setLocallySubmitting] = useState(false);

  const isEditing = Boolean(initialTask);
  const isBusy = submitting || locallySubmitting;

  const statusValues = useMemo(
    () => new Set(STATUS_OPTIONS.map((option) => option.value)),
    [],
  );
  const priorityValues = useMemo(
    () => new Set(PRIORITY_OPTIONS.map((option) => option.value)),
    [],
  );

  useEffect(() => {
    setValues(createInitialValues(initialTask));
    setErrors({});
    setSubmitError("");
  }, [initialTask]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      titleRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !isBusy) {
        event.preventDefault();
        onCancel?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isBusy, onCancel]);

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((current) => ({
      ...current,
      [name]: value,
    }));

    setErrors((current) => {
      if (!current[name]) {
        return current;
      }

      const next = { ...current };
      delete next[name];
      return next;
    });

    setSubmitError("");
  }

  function validate() {
    const nextErrors = {};
    const title = values.title.trim();
    const description = values.description.trim();

    if (!title) {
      nextErrors.title = "Enter a task title.";
    } else if (title.length > 255) {
      nextErrors.title = "The title must be 255 characters or fewer.";
    }

    if (description.length > 5000) {
      nextErrors.description =
        "The description must be 5,000 characters or fewer.";
    }

    if (!statusValues.has(values.status)) {
      nextErrors.status = "Select a valid task status.";
    }

    if (!priorityValues.has(values.priority)) {
      nextErrors.priority = "Select a valid task priority.";
    }

    if (values.dueDate && !isValidDateInput(values.dueDate)) {
      nextErrors.dueDate = "Enter a valid due date.";
    }

    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isBusy) {
      return;
    }

    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError("");

    const firstInvalidField = Object.keys(nextErrors)[0];

    if (firstInvalidField) {
      window.requestAnimationFrame(() => {
        formRef.current
          ?.querySelector(`[name="${firstInvalidField}"]`)
          ?.focus();
      });
      return;
    }

    if (typeof onSubmit !== "function") {
      setSubmitError("The task could not be saved. Please try again.");
      return;
    }

    const payload = {
      title: values.title.trim(),
      description: values.description.trim(),
      status: values.status,
      priority: values.priority,
      dueDate: values.dueDate || null,
    };

    setLocallySubmitting(true);

    try {
      await onSubmit(payload);
    } catch (error) {
      setSubmitError(
        error?.message || "The task could not be saved. Please try again.",
      );
    } finally {
      setLocallySubmitting(false);
    }
  }

  function handleBackdropMouseDown(event) {
    if (event.target === event.currentTarget && !isBusy) {
      onCancel?.();
    }
  }

  return (
    <div
      className="modal-backdrop modal-overlay"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="modal task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">{isEditing ? "Update work" : "Plan work"}</p>
            <h2 id={dialogTitleId}>
              {isEditing ? "Edit task" : "Create task"}
            </h2>
          </div>

          <button
            type="button"
            className="modal-close button button-ghost"
            onClick={onCancel}
            disabled={isBusy}
            aria-label="Close task form"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          {submitError ? (
            <div className="error-message form-alert" role="alert">
              {submitError}
            </div>
          ) : null}

          <div className="form-group form-field">
            <label className="form-label" htmlFor={titleId}>
              Title
            </label>
            <input
              ref={titleRef}
              id={titleId}
              className="form-control"
              type="text"
              name="title"
              value={values.title}
              onChange={handleChange}
              maxLength={255}
              placeholder="What needs to be done?"
              autoComplete="off"
              disabled={isBusy}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${titleId}-error` : undefined}
              required
            />
            {errors.title ? (
              <span
                id={`${titleId}-error`}
                className="form-error field-error"
              >
                {errors.title}
              </span>
            ) : null}
          </div>

          <div className="form-group form-field">
            <div className="form-label-row">
              <label className="form-label" htmlFor={descriptionId}>
                Description
              </label>
              <span className="character-count">
                {values.description.length}/5000
              </span>
            </div>
            <textarea
              id={descriptionId}
              className="form-control"
              name="description"
              value={values.description}
              onChange={handleChange}
              rows={5}
              maxLength={5000}
              placeholder="Add context, acceptance criteria, or useful notes…"
              disabled={isBusy}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description ? `${descriptionId}-error` : undefined
              }
            />
            {errors.description ? (
              <span
                id={`${descriptionId}-error`}
                className="form-error field-error"
              >
                {errors.description}
              </span>
            ) : null}
          </div>

          <div className="form-grid">
            <div className="form-group form-field">
              <label className="form-label" htmlFor={statusId}>
                Status
              </label>
              <select
                id={statusId}
                className="form-control"
                name="status"
                value={values.status}
                onChange={handleChange}
                disabled={isBusy}
                aria-invalid={Boolean(errors.status)}
                aria-describedby={
                  errors.status ? `${statusId}-error` : undefined
                }
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              {errors.status ? (
                <span
                  id={`${statusId}-error`}
                  className="form-error field-error"
                >
                  {errors.status}
                </span>
              ) : null}
            </div>

            <div className="form-group form-field">
              <label className="form-label" htmlFor={priorityId}>
                Priority
              </label>
              <select
                id={priorityId}
                className="form-control"
                name="priority"
                value={values.priority}
                onChange={handleChange}
                disabled={isBusy}
                aria-invalid={Boolean(errors.priority)}
                aria-describedby={
                  errors.priority ? `${priorityId}-error` : undefined
                }
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
              {errors.priority ? (
                <span
                  id={`${priorityId}-error`}
                  className="form-error field-error"
                >
                  {errors.priority}
                </span>
              ) : null}
            </div>
          </div>

          <div className="form-group form-field">
            <label className="form-label" htmlFor={dueDateId}>
              Due date <span className="optional-label">(optional)</span>
            </label>
            <input
              id={dueDateId}
              className="form-control"
              type="date"
              name="dueDate"
              value={values.dueDate}
              onChange={handleChange}
              disabled={isBusy}
              aria-invalid={Boolean(errors.dueDate)}
              aria-describedby={
                errors.dueDate ? `${dueDateId}-error` : undefined
              }
            />
            {errors.dueDate ? (
              <span
                id={`${dueDateId}-error`}
                className="form-error field-error"
              >
                {errors.dueDate}
              </span>
            ) : null}
          </div>

          <div className="modal-actions form-actions">
            <button
              type="button"
              className="button button-secondary btn btn-secondary"
              onClick={onCancel}
              disabled={isBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary btn btn-primary"
              disabled={isBusy}
            >
              {isBusy
                ? isEditing
                  ? "Saving…"
                  : "Creating…"
                : isEditing
                  ? "Save changes"
                  : "Create task"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}