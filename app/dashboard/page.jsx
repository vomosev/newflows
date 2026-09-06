'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppHeader from '../../components/AppHeader';
import ProjectForm from '../../components/ProjectForm';
import ProtectedRoute from '../../components/ProtectedRoute';
import { projectApi } from '../../lib/api';

function normalizeProjects(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.projects)) {
    return response.projects;
  }

  return [];
}

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function readCount(project, keys) {
  const sources = [
    project,
    project?.counts,
    project?.taskCounts,
    project?.task_counts,
    project?.statusCounts,
    project?.status_counts,
  ];

  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    for (const key of keys) {
      const value = Number(source[key]);

      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }
  }

  return null;
}

function getProjectCounts(project) {
  const backlog = readCount(project, [
    'backlogCount',
    'backlog_count',
    'backlogTasks',
    'backlog_tasks',
    'backlog',
  ]);
  const todo = readCount(project, [
    'todoCount',
    'todo_count',
    'todoTasks',
    'todo_tasks',
    'toDoCount',
    'to_do_count',
    'todo',
  ]);
  const inProgress = readCount(project, [
    'inProgressCount',
    'in_progress_count',
    'inProgressTasks',
    'in_progress_tasks',
    'in_progress',
  ]);
  const done = readCount(project, [
    'doneCount',
    'done_count',
    'doneTasks',
    'done_tasks',
    'completedCount',
    'completed_count',
    'done',
  ]);

  const totalFromProject = readCount(project, [
    'taskCount',
    'task_count',
    'totalTasks',
    'total_tasks',
    'total',
  ]);

  const knownStatusCounts = [backlog, todo, inProgress, done].filter(
    (value) => value !== null,
  );

  return {
    total:
      totalFromProject ??
      knownStatusCounts.reduce((sum, value) => sum + value, 0),
    backlog: backlog ?? 0,
    todo: todo ?? 0,
    inProgress: inProgress ?? 0,
    done: done ?? 0,
  };
}

function getProjectKey(project) {
  return project.projectKey || project.project_key || project.key || 'PROJECT';
}

function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function ProjectCard({ project }) {
  const counts = getProjectCounts(project);
  const projectKey = getProjectKey(project);
  const updatedAt = formatDate(
    project.updatedAt || project.updated_at || project.createdAt || project.created_at,
  );

  return (
    <article className="project-card">
      <div
        className="project-card-accent"
        style={{ backgroundColor: project.color || '#5b67f1' }}
        aria-hidden="true"
      />

      <div className="project-card-content">
        <div className="project-card-header">
          <span className="project-key">{projectKey}</span>
          <span className="project-task-total">
            {counts.total} {counts.total === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        <div className="project-card-body">
          <h2 className="project-card-title">
            <Link href={`/projects/${project.id}`}>{project.name}</Link>
          </h2>

          <p className="project-card-description">
            {project.description?.trim() || 'No project description yet.'}
          </p>
        </div>

        <dl className="project-counts" aria-label={`Task counts for ${project.name}`}>
          <div className="project-count">
            <dt>Backlog</dt>
            <dd>{counts.backlog}</dd>
          </div>
          <div className="project-count">
            <dt>To do</dt>
            <dd>{counts.todo}</dd>
          </div>
          <div className="project-count">
            <dt>In progress</dt>
            <dd>{counts.inProgress}</dd>
          </div>
          <div className="project-count">
            <dt>Done</dt>
            <dd>{counts.done}</dd>
          </div>
        </dl>

        <div className="project-card-footer">
          {updatedAt ? (
            <span className="project-updated-date">Updated {updatedAt}</span>
          ) : (
            <span />
          )}
          <Link
            href={`/projects/${project.id}`}
            className="button secondary-button project-open-button"
            aria-label={`Open ${project.name}`}
          >
            Open board
          </Link>
        </div>
      </div>
    </article>
  );
}

function DashboardContent() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadProjects = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    setLoadError('');

    try {
      const response = await projectApi.list();
      setProjects(normalizeProjects(response));
      return true;
    } catch (error) {
      setLoadError(
        getErrorMessage(error, 'Unable to load your projects. Please try again.'),
      );
      return false;
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const fetchProjects = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const response = await projectApi.list();

        if (active) {
          setProjects(normalizeProjects(response));
        }
      } catch (error) {
        if (active) {
          setLoadError(
            getErrorMessage(
              error,
              'Unable to load your projects. Please try again.',
            ),
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchProjects();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showCreateForm) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) {
        setShowCreateForm(false);
        setCreateError('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCreateForm, submitting]);

  const openCreateForm = () => {
    setCreateError('');
    setShowCreateForm(true);
  };

  const closeCreateForm = () => {
    if (submitting) {
      return;
    }

    setCreateError('');
    setShowCreateForm(false);
  };

  const handleCreateProject = async (values) => {
    setSubmitting(true);
    setCreateError('');

    try {
      await projectApi.create(values);
      setShowCreateForm(false);
      await loadProjects(false);
    } catch (error) {
      setCreateError(
        getErrorMessage(error, 'Unable to create the project. Please try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader />

      <main className="page-container dashboard-page">
        <section className="page-header dashboard-header">
          <div>
            <p className="eyebrow">Your workspace</p>
            <h1>Projects</h1>
            <p className="page-subtitle">
              Plan work, track progress, and keep every task moving forward.
            </p>
          </div>

          <button
            type="button"
            className="button primary-button"
            onClick={openCreateForm}
          >
            Create project
          </button>
        </section>

        {loadError ? (
          <div className="error-banner" role="alert">
            <div>
              <strong>Projects could not be loaded</strong>
              <p>{loadError}</p>
            </div>
            <button
              type="button"
              className="button secondary-button"
              onClick={() => loadProjects(true)}
              disabled={loading}
            >
              {loading ? 'Retrying…' : 'Try again'}
            </button>
          </div>
        ) : null}

        {loading && projects.length === 0 ? (
          <section className="loading-state" aria-live="polite" aria-busy="true">
            <div className="loading-spinner" aria-hidden="true" />
            <h2>Loading your projects</h2>
            <p>Gathering your latest tasks and progress.</p>
          </section>
        ) : null}

        {!loading && !loadError && projects.length === 0 ? (
          <section className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">
              NF
            </div>
            <h2>Create your first project</h2>
            <p>
              Projects give your team one place to organize tasks, priorities,
              due dates, and workflow status.
            </p>
            <button
              type="button"
              className="button primary-button"
              onClick={openCreateForm}
            >
              Create a project
            </button>
          </section>
        ) : null}

        {projects.length > 0 ? (
          <section
            className="project-grid"
            aria-label="Your projects"
            aria-busy={loading}
          >
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </section>
        ) : null}
      </main>

      {showCreateForm ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateForm();
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">New workspace</p>
                <h2 id="create-project-title">Create a project</h2>
              </div>
              <button
                type="button"
                className="icon-button modal-close-button"
                onClick={closeCreateForm}
                disabled={submitting}
                aria-label="Close project form"
              >
                ×
              </button>
            </div>

            {createError ? (
              <div className="error-message" role="alert">
                {createError}
              </div>
            ) : null}

            <ProjectForm
              submitLabel="Create project"
              onSubmit={handleCreateProject}
              onCancel={closeCreateForm}
              submitting={submitting}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}