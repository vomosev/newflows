'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TaskCard from './TaskCard';
import TaskForm from './TaskForm';
import { taskApi } from '../lib/api';
import * as taskConstants from '../lib/taskConstants';

const FALLBACK_STATUSES = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

const FALLBACK_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function getOptionValue(option) {
  if (typeof option === 'string') {
    return option;
  }

  return option?.value ?? option?.id ?? option?.key ?? option?.status ?? option?.priority;
}

function humanize(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeOptions(options, fallback, labelMap, labelGetter) {
  const source = Array.isArray(options) && options.length > 0 ? options : fallback;

  return source
    .map((option) => {
      const value = getOptionValue(option);

      if (!value) {
        return null;
      }

      let label;

      if (typeof option === 'object' && option !== null) {
        label = option.label ?? option.name ?? option.title;
      }

      if (!label && typeof labelGetter === 'function') {
        label = labelGetter(value);
      }

      if (!label && labelMap && typeof labelMap === 'object') {
        label = labelMap[value];
      }

      return {
        value: String(value),
        label: label || humanize(value),
      };
    })
    .filter(Boolean);
}

const STATUS_OPTIONS = normalizeOptions(
  taskConstants.TASK_STATUSES ??
    taskConstants.STATUS_DEFINITIONS ??
    taskConstants.STATUSES,
  FALLBACK_STATUSES,
  taskConstants.STATUS_LABELS,
  taskConstants.getStatusLabel,
);

const PRIORITY_OPTIONS = normalizeOptions(
  taskConstants.TASK_PRIORITIES ??
    taskConstants.PRIORITY_DEFINITIONS ??
    taskConstants.PRIORITIES,
  FALLBACK_PRIORITIES,
  taskConstants.PRIORITY_LABELS,
  taskConstants.getPriorityLabel,
);

function extractTasks(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.tasks)) {
    return response.tasks;
  }

  if (Array.isArray(response?.data?.tasks)) {
    return response.data.tasks;
  }

  return [];
}

function extractTask(response) {
  return response?.task ?? response?.data?.task ?? response?.data ?? response;
}

function getErrorMessage(error, fallback) {
  return error?.message || fallback;
}

function sameId(first, second) {
  return String(first) === String(second);
}

function compareTasks(first, second) {
  const firstPosition = Number(first.position);
  const secondPosition = Number(second.position);
  const normalizedFirst = Number.isFinite(firstPosition) ? firstPosition : 0;
  const normalizedSecond = Number.isFinite(secondPosition) ? secondPosition : 0;

  if (normalizedFirst !== normalizedSecond) {
    return normalizedFirst - normalizedSecond;
  }

  const firstIssue = Number(first.issue_number ?? first.issueNumber);
  const secondIssue = Number(second.issue_number ?? second.issueNumber);

  if (Number.isFinite(firstIssue) && Number.isFinite(secondIssue)) {
    return firstIssue - secondIssue;
  }

  return String(first.title || '').localeCompare(String(second.title || ''));
}

function reorderTasks(tasks, taskId, destinationStatus, destinationIndex) {
  const draggedTask = tasks.find((task) => sameId(task.id, taskId));

  if (!draggedTask) {
    return tasks;
  }

  const remainingTasks = tasks.filter((task) => !sameId(task.id, taskId));
  const sourceStatus = draggedTask.status;
  const destinationTasks = remainingTasks
    .filter((task) => task.status === destinationStatus)
    .sort(compareTasks);

  const safeIndex = Math.max(
    0,
    Math.min(Number(destinationIndex) || 0, destinationTasks.length),
  );

  destinationTasks.splice(safeIndex, 0, {
    ...draggedTask,
    status: destinationStatus,
  });

  const positionsById = new Map();

  destinationTasks.forEach((task, index) => {
    positionsById.set(String(task.id), {
      status: destinationStatus,
      position: index,
    });
  });

  if (sourceStatus !== destinationStatus) {
    remainingTasks
      .filter((task) => task.status === sourceStatus)
      .sort(compareTasks)
      .forEach((task, index) => {
        positionsById.set(String(task.id), {
          status: sourceStatus,
          position: index,
        });
      });
  }

  return tasks.map((task) => {
    const update = positionsById.get(String(task.id));

    if (sameId(task.id, taskId)) {
      return {
        ...task,
        status: destinationStatus,
        position: safeIndex,
      };
    }

    return update ? { ...task, ...update } : task;
  });
}

export default function TaskBoard({ projectId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [formMode, setFormMode] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [movingTaskId, setMovingTaskId] = useState(null);

  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const draggedTaskIdRef = useRef(null);

  const loadTasks = useCallback(
    async ({ showLoading = true } = {}) => {
      const requestId = ++requestIdRef.current;

      if (showLoading) {
        setLoading(true);
      }

      setLoadError('');

      try {
        const response = await taskApi.list(projectId);

        if (mountedRef.current && requestId === requestIdRef.current) {
          setTasks(extractTasks(response));
        }

        return true;
      } catch (error) {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setLoadError(getErrorMessage(error, 'Unable to load tasks.'));
        }

        return false;
      } finally {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [projectId],
  );

  useEffect(() => {
    mountedRef.current = true;
    setTasks([]);
    setFormMode(null);
    setEditingTask(null);
    setActionError('');
    setSearchQuery('');
    setPriorityFilter('all');
    loadTasks();

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const issueNumber = task.issue_number ?? task.issueNumber ?? '';
      const projectKey = task.project_key ?? task.projectKey ?? '';
      const searchableText = [
        task.title,
        task.description,
        projectKey && issueNumber ? `${projectKey}-${issueNumber}` : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [tasks, searchQuery, priorityFilter]);

  const tasksByStatus = useMemo(() => {
    const groupedTasks = Object.fromEntries(
      STATUS_OPTIONS.map((status) => [status.value, []]),
    );

    filteredTasks.forEach((task) => {
      if (!groupedTasks[task.status]) {
        groupedTasks[task.status] = [];
      }

      groupedTasks[task.status].push(task);
    });

    Object.values(groupedTasks).forEach((statusTasks) => {
      statusTasks.sort(compareTasks);
    });

    return groupedTasks;
  }, [filteredTasks]);

  const allTasksByStatus = useMemo(() => {
    const groupedTasks = {};

    tasks.forEach((task) => {
      if (!groupedTasks[task.status]) {
        groupedTasks[task.status] = [];
      }

      groupedTasks[task.status].push(task);
    });

    Object.values(groupedTasks).forEach((statusTasks) => {
      statusTasks.sort(compareTasks);
    });

    return groupedTasks;
  }, [tasks]);

  const filtersActive = searchQuery.trim() !== '' || priorityFilter !== 'all';

  function openCreateForm() {
    setActionError('');
    setEditingTask(null);
    setFormMode('create');
  }

  function openEditForm(task) {
    setActionError('');
    setEditingTask(task);
    setFormMode('edit');
  }

  function closeForm() {
    if (submitting) {
      return;
    }

    setFormMode(null);
    setEditingTask(null);
  }

  async function handleFormSubmit(values) {
    setSubmitting(true);
    setActionError('');

    try {
      if (formMode === 'edit' && editingTask) {
        const response = await taskApi.update(editingTask.id, values);
        const updatedTask = extractTask(response);

        if (updatedTask?.id !== undefined) {
          setTasks((currentTasks) =>
            currentTasks.map((task) =>
              sameId(task.id, updatedTask.id) ? updatedTask : task,
            ),
          );
        }
      } else {
        const response = await taskApi.create(projectId, values);
        const createdTask = extractTask(response);

        if (createdTask?.id !== undefined) {
          setTasks((currentTasks) => [...currentTasks, createdTask]);
        }
      }

      setFormMode(null);
      setEditingTask(null);
      await loadTasks({ showLoading: false });
    } catch (error) {
      setActionError(
        getErrorMessage(
          error,
          formMode === 'edit'
            ? 'Unable to update the task.'
            : 'Unable to create the task.',
        ),
      );
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }

  async function handleDelete(task) {
    const issueNumber = task.issue_number ?? task.issueNumber;
    const projectKey = task.project_key ?? task.projectKey;
    const issueKey =
      projectKey && issueNumber ? `${projectKey}-${issueNumber}` : task.title;

    if (
      !window.confirm(
        `Delete ${issueKey}? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingTaskId(task.id);
    setActionError('');

    try {
      await taskApi.delete(task.id);
      setTasks((currentTasks) =>
        currentTasks.filter((currentTask) => !sameId(currentTask.id, task.id)),
      );

      if (editingTask && sameId(editingTask.id, task.id)) {
        setEditingTask(null);
        setFormMode(null);
      }
    } catch (error) {
      setActionError(getErrorMessage(error, 'Unable to delete the task.'));
    } finally {
      if (mountedRef.current) {
        setDeletingTaskId(null);
      }
    }
  }

  function handleDragStart(event, task) {
    if (movingTaskId !== null || deletingTaskId !== null) {
      event.preventDefault();
      return;
    }

    draggedTaskIdRef.current = task.id;
    setDraggedTaskId(task.id);
    setActionError('');

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'application/x-newflows-task',
      String(task.id),
    );
    event.dataTransfer.setData('text/plain', String(task.id));
  }

  function handleDragEnd() {
    draggedTaskIdRef.current = null;
    setDraggedTaskId(null);
    setDragOverStatus(null);
  }

  function getDraggedTaskId(event) {
    return (
      draggedTaskIdRef.current ||
      event.dataTransfer.getData('application/x-newflows-task') ||
      event.dataTransfer.getData('text/plain')
    );
  }

  async function moveTask(taskId, destinationStatus, destinationIndex) {
    const draggedTask = tasks.find((task) => sameId(task.id, taskId));

    if (!draggedTask || movingTaskId !== null) {
      return;
    }

    const currentStatusTasks = (allTasksByStatus[draggedTask.status] || []).filter(
      (task) => !sameId(task.id, taskId),
    );
    const originalIndex = (allTasksByStatus[draggedTask.status] || []).findIndex(
      (task) => sameId(task.id, taskId),
    );
    const boundedIndex = Math.max(
      0,
      Math.min(
        destinationIndex,
        (allTasksByStatus[destinationStatus] || []).filter(
          (task) => !sameId(task.id, taskId),
        ).length,
      ),
    );

    if (
      draggedTask.status === destinationStatus &&
      originalIndex === boundedIndex
    ) {
      handleDragEnd();
      return;
    }

    const previousTasks = tasks;
    const optimisticTasks = reorderTasks(
      tasks,
      taskId,
      destinationStatus,
      boundedIndex,
    );

    setTasks(optimisticTasks);
    setMovingTaskId(taskId);
    setActionError('');
    handleDragEnd();

    try {
      const response = await taskApi.update(taskId, {
        status: destinationStatus,
        position: boundedIndex,
      });
      const updatedTask = extractTask(response);

      if (updatedTask?.id !== undefined) {
        setTasks((currentTasks) =>
          currentTasks.map((task) =>
            sameId(task.id, updatedTask.id)
              ? { ...task, ...updatedTask }
              : task,
          ),
        );
      }

      await loadTasks({ showLoading: false });
    } catch (error) {
      setTasks(previousTasks);
      setActionError(getErrorMessage(error, 'Unable to move the task.'));
    } finally {
      if (mountedRef.current) {
        setMovingTaskId(null);
      }
    }

    void currentStatusTasks;
  }

  function handleColumnDragOver(event, status) {
    if (!getDraggedTaskId(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }

  function handleColumnDrop(event, status) {
    event.preventDefault();
    const taskId = getDraggedTaskId(event);

    if (!taskId) {
      handleDragEnd();
      return;
    }

    const destinationTasks = (allTasksByStatus[status] || []).filter(
      (task) => !sameId(task.id, taskId),
    );

    moveTask(taskId, status, destinationTasks.length);
  }

  function handleCardDrop(event, status, targetTask) {
    event.preventDefault();
    event.stopPropagation();

    const taskId = getDraggedTaskId(event);

    if (!taskId || sameId(taskId, targetTask.id)) {
      handleDragEnd();
      return;
    }

    const destinationTasks = (allTasksByStatus[status] || []).filter(
      (task) => !sameId(task.id, taskId),
    );
    const targetIndex = destinationTasks.findIndex((task) =>
      sameId(task.id, targetTask.id),
    );

    if (targetIndex < 0) {
      moveTask(taskId, status, destinationTasks.length);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const dropAfter = event.clientY > bounds.top + bounds.height / 2;
    moveTask(taskId, status, targetIndex + (dropAfter ? 1 : 0));
  }

  function clearFilters() {
    setSearchQuery('');
    setPriorityFilter('all');
  }

  if (loading) {
    return (
      <section className="task-board" aria-busy="true">
        <div className="loading-state" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <p>Loading tasks…</p>
        </div>
      </section>
    );
  }

  if (loadError && tasks.length === 0) {
    return (
      <section className="task-board">
        <div className="error-state" role="alert">
          <h2>Tasks could not be loaded</h2>
          <p>{loadError}</p>
          <button
            type="button"
            className="button btn btn-primary"
            onClick={() => loadTasks()}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="task-board" aria-busy={movingTaskId !== null}>
      <div className="task-board-header">
        <div>
          <h2>Task board</h2>
          <p className="task-board-summary">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </p>
        </div>

        <button
          type="button"
          className="button btn btn-primary"
          onClick={openCreateForm}
          disabled={submitting}
        >
          <span aria-hidden="true">+</span>
          New task
        </button>
      </div>

      <div className="task-filters" aria-label="Task filters">
        <div className="form-field filter-search">
          <label htmlFor={`task-search-${projectId}`}>Search tasks</label>
          <input
            id={`task-search-${projectId}`}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, description, or issue key"
          />
        </div>

        <div className="form-field filter-priority">
          <label htmlFor={`priority-filter-${projectId}`}>Priority</label>
          <select
            id={`priority-filter-${projectId}`}
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">All priorities</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
        </div>

        {filtersActive && (
          <button
            type="button"
            className="button btn btn-secondary filter-clear"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}
      </div>

      {(loadError || actionError) && (
        <div className="alert alert-error" role="alert">
          <span>{actionError || loadError}</span>
          <button
            type="button"
            className="alert-dismiss"
            aria-label="Dismiss error"
            onClick={() => {
              setActionError('');
              setLoadError('');
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="board-columns board-grid">
        {STATUS_OPTIONS.map((status) => {
          const visibleStatusTasks = tasksByStatus[status.value] || [];
          const totalStatusTasks = (allTasksByStatus[status.value] || []).length;
          const isDragTarget = dragOverStatus === status.value;

          return (
            <section
              key={status.value}
              className={`board-column status-${status.value}${
                isDragTarget ? ' is-drag-over drag-over' : ''
              }`}
              aria-labelledby={`column-${projectId}-${status.value}`}
              onDragOver={(event) => handleColumnDragOver(event, status.value)}
              onDragEnter={(event) => handleColumnDragOver(event, status.value)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDragOverStatus((currentStatus) =>
                    currentStatus === status.value ? null : currentStatus,
                  );
                }
              }}
              onDrop={(event) => handleColumnDrop(event, status.value)}
            >
              <header className="board-column-header column-header">
                <h3 id={`column-${projectId}-${status.value}`}>
                  {status.label}
                </h3>
                <span
                  className="task-count"
                  aria-label={`${totalStatusTasks} tasks`}
                >
                  {filtersActive
                    ? `${visibleStatusTasks.length}/${totalStatusTasks}`
                    : totalStatusTasks}
                </span>
              </header>

              <div className="board-column-content task-list">
                {visibleStatusTasks.map((task) => {
                  const isDragging = sameId(draggedTaskId, task.id);
                  const isMoving = sameId(movingTaskId, task.id);
                  const isDeleting = sameId(deletingTaskId, task.id);

                  return (
                    <div
                      key={task.id}
                      className={`task-card-drop-zone${
                        isDragging ? ' is-dragging dragging' : ''
                      }${isMoving ? ' is-moving' : ''}`}
                      draggable={!isMoving && !isDeleting}
                      onDragStart={(event) => handleDragStart(event, task)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOverStatus(status.value);
                      }}
                      onDrop={(event) =>
                        handleCardDrop(event, status.value, task)
                      }
                    >
                      <TaskCard
                        task={task}
                        onEdit={() => openEditForm(task)}
                        onDelete={() => handleDelete(task)}
                        deleting={isDeleting}
                        disabled={isMoving || isDeleting}
                        isDragging={isDragging}
                      />
                    </div>
                  );
                })}

                {visibleStatusTasks.length === 0 && (
                  <div className="column-empty-state">
                    <p>
                      {filtersActive && totalStatusTasks > 0
                        ? 'No matching tasks'
                        : 'No tasks in this status'}
                    </p>
                    {!filtersActive && status.value === STATUS_OPTIONS[0]?.value && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={openCreateForm}
                      >
                        Create a task
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {formMode && (
        <TaskForm
          initialTask={formMode === 'edit' ? editingTask : null}
          onSubmit={handleFormSubmit}
          onCancel={closeForm}
          submitting={submitting}
          error={actionError}
        />
      )}
    </section>
  );
}