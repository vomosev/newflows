const { pool } = require('../config/db');
const { validateProject } = require('../utils/validation');
const { HttpError } = require('../middleware/errors');

const PROJECT_SELECT = `
  SELECT
    p.id,
    p.user_id AS user_id,
    p.name,
    p.project_key AS project_key,
    p.description,
    p.color,
    p.next_issue_number AS next_issue_number,
    p.created_at AS created_at,
    p.updated_at AS updated_at,
    COALESCE(task_counts.task_count, 0) AS task_count,
    COALESCE(task_counts.backlog_count, 0) AS backlog_count,
    COALESCE(task_counts.todo_count, 0) AS todo_count,
    COALESCE(task_counts.in_progress_count, 0) AS in_progress_count,
    COALESCE(task_counts.done_count, 0) AS done_count
  FROM projects p
  LEFT JOIN (
    SELECT
      project_id,
      COUNT(*) AS task_count,
      SUM(CASE WHEN status = 'backlog' THEN 1 ELSE 0 END) AS backlog_count,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_count
    FROM tasks
    GROUP BY project_id
  ) AS task_counts ON task_counts.project_id = p.id
`;

function hasValidationErrors(errors) {
  if (!errors) {
    return false;
  }

  if (Array.isArray(errors)) {
    return errors.length > 0;
  }

  return typeof errors === 'object' && Object.keys(errors).length > 0;
}

function getValidatedProjectValues(input, partial = false) {
  const result = partial
    ? validateProject(input, { partial: true, isUpdate: true })
    : validateProject(input);

  if (!result || typeof result !== 'object') {
    throw new HttpError(400, 'Invalid project data');
  }

  const errors = result.errors || result.fieldErrors;
  const explicitlyInvalid = result.isValid === false || result.valid === false;

  if (explicitlyInvalid || hasValidationErrors(errors)) {
    throw new HttpError(400, 'Please correct the highlighted project fields', errors || {});
  }

  return (
    result.value ||
    result.values ||
    result.data ||
    result.sanitized ||
    result.sanitizedValues ||
    result
  );
}

function normalizeProjectValues(values) {
  return {
    name: values.name,
    projectKey:
      values.projectKey !== undefined ? values.projectKey : values.project_key,
    description: values.description,
    color: values.color
  };
}

function serializeProject(row) {
  const taskCount = Number(row.task_count) || 0;
  const backlogCount = Number(row.backlog_count) || 0;
  const todoCount = Number(row.todo_count) || 0;
  const inProgressCount = Number(row.in_progress_count) || 0;
  const doneCount = Number(row.done_count) || 0;

  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: row.name,
    projectKey: row.project_key,
    description: row.description,
    color: row.color,
    nextIssueNumber: Number(row.next_issue_number),
    taskCount,
    backlogCount,
    todoCount,
    inProgressCount,
    doneCount,
    statusCounts: {
      backlog: backlogCount,
      todo: todoCount,
      inProgress: inProgressCount,
      done: doneCount
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isDuplicateEntryError(error) {
  return (
    error &&
    (error.code === 'ER_DUP_ENTRY' ||
      error.errno === 1062 ||
      error.sqlState === '23000')
  );
}

async function findOwnedProject(projectId, userId) {
  const [rows] = await pool.execute(
    `${PROJECT_SELECT}
     WHERE p.id = ? AND p.user_id = ?
     LIMIT 1`,
    [projectId, userId]
  );

  return rows.length > 0 ? serializeProject(rows[0]) : null;
}

async function listProjects(req, res) {
  const [rows] = await pool.execute(
    `${PROJECT_SELECT}
     WHERE p.user_id = ?
     ORDER BY p.updated_at DESC, p.id DESC`,
    [req.session.userId]
  );

  res.status(200).json({
    projects: rows.map(serializeProject)
  });
}

async function createProject(req, res) {
  const validated = normalizeProjectValues(
    getValidatedProjectValues(req.body, false)
  );

  const description =
    validated.description === undefined || validated.description === ''
      ? null
      : validated.description;
  const color = validated.color || '#4f46e5';

  try {
    const [result] = await pool.execute(
      `INSERT INTO projects
        (user_id, name, project_key, description, color)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.session.userId,
        validated.name,
        validated.projectKey,
        description,
        color
      ]
    );

    const project = await findOwnedProject(
      result.insertId,
      req.session.userId
    );

    if (!project) {
      throw new HttpError(500, 'The project was created but could not be loaded');
    }

    res.status(201).json({ project });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new HttpError(
        409,
        'A project with that project key already exists',
        { projectKey: 'Project keys must be unique' }
      );
    }

    throw error;
  }
}

async function getProject(req, res) {
  const project = await findOwnedProject(
    req.params.projectId,
    req.session.userId
  );

  if (!project) {
    throw new HttpError(404, 'Project not found');
  }

  res.status(200).json({ project });
}

async function updateProject(req, res) {
  const existingProject = await findOwnedProject(
    req.params.projectId,
    req.session.userId
  );

  if (!existingProject) {
    throw new HttpError(404, 'Project not found');
  }

  const validated = normalizeProjectValues(
    getValidatedProjectValues(req.body, true)
  );

  const assignments = [];
  const parameters = [];

  if (validated.name !== undefined) {
    assignments.push('name = ?');
    parameters.push(validated.name);
  }

  if (validated.projectKey !== undefined) {
    assignments.push('project_key = ?');
    parameters.push(validated.projectKey);
  }

  if (validated.description !== undefined) {
    assignments.push('description = ?');
    parameters.push(
      validated.description === '' ? null : validated.description
    );
  }

  if (validated.color !== undefined) {
    assignments.push('color = ?');
    parameters.push(validated.color);
  }

  if (assignments.length === 0) {
    throw new HttpError(
      400,
      'At least one project field must be provided for an update'
    );
  }

  assignments.push('updated_at = CURRENT_TIMESTAMP');
  parameters.push(req.params.projectId, req.session.userId);

  try {
    const [result] = await pool.execute(
      `UPDATE projects
       SET ${assignments.join(', ')}
       WHERE id = ? AND user_id = ?`,
      parameters
    );

    if (result.affectedRows === 0) {
      throw new HttpError(404, 'Project not found');
    }

    const project = await findOwnedProject(
      req.params.projectId,
      req.session.userId
    );

    if (!project) {
      throw new HttpError(404, 'Project not found');
    }

    res.status(200).json({ project });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new HttpError(
        409,
        'A project with that project key already exists',
        { projectKey: 'Project keys must be unique' }
      );
    }

    throw error;
  }
}

async function deleteProject(req, res) {
  const [result] = await pool.execute(
    `DELETE FROM projects
     WHERE id = ? AND user_id = ?`,
    [req.params.projectId, req.session.userId]
  );

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Project not found');
  }

  res.status(200).json({
    message: 'Project deleted successfully'
  });
}

module.exports = {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject
};