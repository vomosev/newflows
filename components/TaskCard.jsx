'use client';

import { getPriorityLabel } from '../lib/taskConstants';

const DESCRIPTION_LIMIT = 160;

function truncateDescription(description) {
  const normalized = String(description || '').replace(/\s+/g, ' ').trim();

  if (normalized.length <= DESCRIPTION_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`;
}

function normalizeClassName(value) {
  return String(value || 'none')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
}

function parseDueDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const dateOnlyMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDueDateDetails(value, status) {
  const dueDate = parseDueDate(value);

  if (!dueDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const comparableDueDate = new Date(dueDate);
  comparableDueDate.setHours(0, 0, 0, 0);

  const normalizedStatus = String(status || '').toLowerCase();
  const isComplete = ['done', 'completed', 'closed'].includes(normalizedStatus);
  const difference = comparableDueDate.getTime() - today.getTime();

  let state = 'upcoming';
  let stateLabel = 'Due';

  if (isComplete) {
    state = 'complete';
    stateLabel = 'Completed, due';
  } else if (difference < 0) {
    state = 'overdue';
    stateLabel = 'Overdue';
  } else if (difference === 0) {
    state = 'today';
    stateLabel = 'Due today';
  }

  return {
    dateTime: [
      comparableDueDate.getFullYear(),
      String(comparableDueDate.getMonth() + 1).padStart(2, '0'),
      String(comparableDueDate.getDate()).padStart(2, '0'),
    ].join('-'),
    formatted: new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year:
        comparableDueDate.getFullYear() !== today.getFullYear()
          ? 'numeric'
          : undefined,
    }).format(comparableDueDate),
    state,
    stateLabel,
  };
}

export default function TaskCard({
  task,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  isDragging = false,
}) {
  if (!task) {
    return null;
  }

  const issueKey =
    task.issueKey ||
    task.issue_key ||
    (task.projectKey || task.project_key
      ? `${task.projectKey || task.project_key}-${task.issueNumber || task.issue_number}`
      : `Task ${task.issueNumber || task.issue_number || task.id}`);

  const priority = task.priority || 'medium';
  const priorityLabel = getPriorityLabel(priority) || priority;
  const description = truncateDescription(task.description);
  const dueDate = getDueDateDetails(
    task.dueDate || task.due_date,
    task.status,
  );

  const handleEdit = (event) => {
    event.stopPropagation();
    onEdit?.(task);
  };

  const handleDelete = (event) => {
    event.stopPropagation();
    onDelete?.(task);
  };

  const handleDragStart = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(task.id));
    onDragStart?.(event, task);
  };

  const handleDragEnd = (event) => {
    onDragEnd?.(event, task);
  };

  return (
    <article
      className={`task-card priority-${normalizeClassName(priority)}${
        isDragging ? ' dragging is-dragging' : ''
      }`}
      data-task-id={task.id}
      draggable
      aria-label={`${issueKey}: ${task.title}`}
      aria-grabbed={isDragging}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="task-card-header">
        <span className="task-key issue-key">{issueKey}</span>

        <div className="task-card-actions" aria-label={`Actions for ${issueKey}`}>
          <button
            type="button"
            className="icon-button task-edit-button"
            aria-label={`Edit ${issueKey}`}
            title={`Edit ${issueKey}`}
            draggable="false"
            onClick={handleEdit}
          >
            <span aria-hidden="true">Edit</span>
          </button>

          <button
            type="button"
            className="icon-button danger task-delete-button"
            aria-label={`Delete ${issueKey}`}
            title={`Delete ${issueKey}`}
            draggable="false"
            onClick={handleDelete}
          >
            <span aria-hidden="true">Delete</span>
          </button>
        </div>
      </div>

      <h3 className="task-card-title">{task.title}</h3>

      {description ? (
        <p
          className="task-card-description"
          title={String(task.description || '').trim()}
        >
          {description}
        </p>
      ) : null}

      <div className="task-card-footer">
        <span
          className={`badge priority-badge priority-${normalizeClassName(
            priority,
          )}`}
        >
          {priorityLabel}
        </span>

        {dueDate ? (
          <time
            className={`due-date task-due-date due-${dueDate.state} ${dueDate.state}`}
            dateTime={dueDate.dateTime}
            title={`${dueDate.stateLabel} ${dueDate.formatted}`}
          >
            <span className="due-date-label">{dueDate.stateLabel}</span>{' '}
            <span className="due-date-value">{dueDate.formatted}</span>
          </time>
        ) : null}
      </div>
    </article>
  );
}