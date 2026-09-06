export const TASK_STATUSES = Object.freeze([
  Object.freeze({ value: "backlog", label: "Backlog" }),
  Object.freeze({ value: "todo", label: "To Do" }),
  Object.freeze({ value: "in_progress", label: "In Progress" }),
  Object.freeze({ value: "done", label: "Done" }),
]);

export const TASK_PRIORITIES = Object.freeze([
  Object.freeze({ value: "low", label: "Low" }),
  Object.freeze({ value: "medium", label: "Medium" }),
  Object.freeze({ value: "high", label: "High" }),
  Object.freeze({ value: "urgent", label: "Urgent" }),
]);

export const TASK_STATUS_VALUES = Object.freeze(
  TASK_STATUSES.map(({ value }) => value),
);

export const TASK_PRIORITY_VALUES = Object.freeze(
  TASK_PRIORITIES.map(({ value }) => value),
);

export const TASK_STATUS_LABELS = Object.freeze(
  Object.fromEntries(
    TASK_STATUSES.map(({ value, label }) => [value, label]),
  ),
);

export const TASK_PRIORITY_LABELS = Object.freeze(
  Object.fromEntries(
    TASK_PRIORITIES.map(({ value, label }) => [value, label]),
  ),
);

export const STATUS_OPTIONS = TASK_STATUSES;
export const PRIORITY_OPTIONS = TASK_PRIORITIES;
export const STATUS_LABELS = TASK_STATUS_LABELS;
export const PRIORITY_LABELS = TASK_PRIORITY_LABELS;

function normalizeLookupValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getStatusDefinition(value) {
  const normalizedValue = normalizeLookupValue(value);
  return (
    TASK_STATUSES.find((status) => status.value === normalizedValue) ?? null
  );
}

export function getPriorityDefinition(value) {
  const normalizedValue = normalizeLookupValue(value);
  return (
    TASK_PRIORITIES.find(
      (priority) => priority.value === normalizedValue,
    ) ?? null
  );
}

export function getStatusLabel(value, fallback = "Unknown status") {
  return getStatusDefinition(value)?.label ?? fallback;
}

export function getPriorityLabel(value, fallback = "Unknown priority") {
  return getPriorityDefinition(value)?.label ?? fallback;
}

export function isValidTaskStatus(value) {
  return getStatusDefinition(value) !== null;
}

export function isValidTaskPriority(value) {
  return getPriorityDefinition(value) !== null;
}