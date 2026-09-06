'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AppHeader from '../../../components/AppHeader';
import ProjectForm from '../../../components/ProjectForm';
import TaskBoard from '../../../components/TaskBoard';
import { projectApi } from '../../../lib/api';

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallbackMessage;
}

function extractProject(payload) {
  return payload?.project ?? payload?.data?.project ?? payload;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawProjectId = params?.projectId;
  const projectId = Array.isArray(rawProjectId)
    ? rawProjectId[0]
    : rawProjectId;

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadProject = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setLoadError('A valid project identifier is required.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');

    try {
      const response = await projectApi.get(projectId);
      const selectedProject = extractProject(response);

      if (!selectedProject || typeof selectedProject !== 'object') {
        throw new Error('The project response was invalid.');
      }

      setProject(selectedProject);
    } catch (error) {
      setProject(null);
      setLoadError(
        getErrorMessage(error, 'Unable to load this project. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;

    async function fetchProject() {
      if (!projectId) {
        if (active) {
          setProject(null);
          setLoadError('A valid project identifier is required.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setLoadError('');

      try {
        const response = await projectApi.get(projectId);
        const selectedProject = extractProject(response);

        if (!selectedProject || typeof selectedProject !== 'object') {
          throw new Error('The project response was invalid.');
        }

        if (active) {
          setProject(selectedProject);
        }
      } catch (error) {
        if (active) {
          setProject(null);
          setLoadError(
            getErrorMessage(
              error,
              'Unable to load this project. Please try again.'
            )
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchProject();

    return () => {
      active = false;
    };
  }, [projectId]);

  async function handleUpdate(values) {
    if (!projectId || submitting) {
      return;
    }

    setSubmitting(true);
    setActionError('');

    try {
      const response = await projectApi.update(projectId, values);
      const updatedProject = extractProject(response);

      if (
        updatedProject &&
        typeof updatedProject === 'object' &&
        (updatedProject.id || updatedProject.name)
      ) {
        setProject((currentProject) => ({
          ...currentProject,
          ...updatedProject,
        }));
      } else {
        await loadProject();
      }

      setEditing(false);
    } catch (error) {
      setActionError(
        getErrorMessage(
          error,
          'Unable to update the project. Please review the details and try again.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!projectId || deleting) {
      return;
    }

    setDeleting(true);
    setActionError('');

    try {
      await projectApi.delete(projectId);
      setConfirmingDelete(false);
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      setActionError(
        getErrorMessage(
          error,
          'Unable to delete the project. Please try again.'
        )
      );
      setDeleting(false);
    }
  }

  const projectKey =
    project?.key ?? project?.projectKey ?? project?.project_key ?? '';
  const projectColor = project?.color || '#4f46e5';

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <AppHeader />

        <main className="page-container project-page">
          {loading ? (
            <section className="loading-state" aria-live="polite">
              <div className="loading-spinner" aria-hidden="true" />
              <p>Loading project…</p>
            </section>
          ) : loadError ? (
            <section className="error-state" role="alert">
              <h1>Project unavailable</h1>
              <p>{loadError}</p>
              <div className="button-group">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={loadProject}
                >
                  Try again
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => router.push('/dashboard')}
                >
                  Return to dashboard
                </button>
              </div>
            </section>
          ) : project ? (
            <>
              <section className="project-detail-header">
                <div className="project-heading">
                  <span
                    className="project-color"
                    style={{ backgroundColor: projectColor }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="project-key">{projectKey}</div>
                    <h1>{project.name}</h1>
                    {project.description ? (
                      <p className="project-description">
                        {project.description}
                      </p>
                    ) : (
                      <p className="project-description muted">
                        No project description has been added.
                      </p>
                    )}
                  </div>
                </div>

                <div className="project-actions" aria-label="Project actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setActionError('');
                      setEditing(true);
                    }}
                  >
                    Edit project
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      setActionError('');
                      setConfirmingDelete(true);
                    }}
                  >
                    Delete project
                  </button>
                </div>
              </section>

              <TaskBoard
                key={`${projectId}:${projectKey}`}
                projectId={projectId}
              />
            </>
          ) : null}
        </main>

        {editing && project ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-project-title"
            >
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Project settings</p>
                  <h2 id="edit-project-title">Edit project</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close project editor"
                  onClick={() => {
                    if (!submitting) {
                      setEditing(false);
                      setActionError('');
                    }
                  }}
                  disabled={submitting}
                >
                  ×
                </button>
              </div>

              {actionError ? (
                <div className="form-error" role="alert">
                  {actionError}
                </div>
              ) : null}

              <ProjectForm
                initialProject={project}
                submitLabel="Save changes"
                onSubmit={handleUpdate}
                onCancel={() => {
                  setEditing(false);
                  setActionError('');
                }}
                submitting={submitting}
              />
            </section>
          </div>
        ) : null}

        {confirmingDelete && project ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="modal confirmation-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-project-title"
              aria-describedby="delete-project-description"
            >
              <div className="modal-header">
                <div>
                  <p className="eyebrow danger-text">Permanent action</p>
                  <h2 id="delete-project-title">Delete project?</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close deletion confirmation"
                  onClick={() => {
                    if (!deleting) {
                      setConfirmingDelete(false);
                      setActionError('');
                    }
                  }}
                  disabled={deleting}
                >
                  ×
                </button>
              </div>

              <p id="delete-project-description">
                Deleting <strong>{project.name}</strong> will permanently remove
                the project and all of its tasks. This action cannot be undone.
              </p>

              {actionError ? (
                <div className="form-error" role="alert">
                  {actionError}
                </div>
              ) : null}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setConfirmingDelete(false);
                    setActionError('');
                  }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting project…' : 'Delete project'}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}