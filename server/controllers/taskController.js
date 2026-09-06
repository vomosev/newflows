const { pool } = require('../config/db');
const { validateTask } = require('../utils/validation');
const { HttpError } = require('../middleware/errors');

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

function parseId(value, fieldName) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, `Invalid ${fieldName}`, {
      [fieldName]: `A valid ${fieldName} is required`
    });
  }

  return id;
}

function hasValidationErrors(errors) {
  if (!errors) {
    return false;
  }

  if (Array.isArray(errors)) {
    return errors.length > 0;
  }

  if (typeof errors === 'object') {
    return Object.keys(errors).length > 0;
  }

  return Boolean(errors);
}

function validateTaskPayload(payload, isUpdate) {
  const result = validateTask(payload, isUpdate);

  if (!result || typeof result !== 'object') {
    throw new HttpError(400, 'Invalid task data');
  }

  if (hasValidationErrors(result.errors)) {
    throw new HttpError(400, 'Validation failed', result.errors);
  }

  if (result.valid === false || result.isValid === false) {
    throw new HttpError(400, 'Validation failed');
  }

  const values =
    result.values ||
    result.data ||
    result.value ||
    result.sanitized ||
    result.sanitizedValues ||
    result;

  return values && typeof values === 'object' ? values : {};
}

function getValidatedValue(values, payload, field, alternateField) {
  if (hasOwn(values, field)) {
    return values[field];
  }

  if (alternateField && hasOwn(values, alternateField)) {
    return values[alternateField];
  }

  if (hasOwn(payload, field)) {
    return payload[field];
  }

  if (alternateField && hasOwn(payload, alternateField)) {
    return payload[alternateField];
  }

  return undefined;
}

function normalizePosition(value) {
  const position = Number(value);

  if (!Number.isSafeInteger(position) || position < 0) {
    throw new HttpError(400, 'Validation failed', {
      position: 'Position must be a non-negative integer'
    });
  }

  return position;
}

function normalizeTaskRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    projectId: Number(row.projectId),
    projectKey: row.projectKey,
    issueNumber: Number(row.issueNumber),
    title: row.title,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate || null,
    position: Number(row.position),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function selectTaskById(executor, taskId, userId, forUpdate = false) {
  const lockingClause = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await executor.query(
    `SELECT
       t.id,
       t.project_id AS projectId,
       p.project_key AS projectKey,
       t.issue_number AS issueNumber,
       t.title,
       t.description,
       t.status,
       t.priority,
       DATE_FORMAT(t.due_date, '%Y-%m-%d') AS dueDate,
       t.position,
       t.created_at AS createdAt,
       t.updated_at AS updatedAt
     FROM tasks AS t
     INNER JOIN projects AS p ON p.id = t.project_id
     WHERE t.id = ? AND p.user_id = ?
     LIMIT 1${lockingClause}`,
    [taskId, userId]
  );

  return rows[0] || null;
}

async function reorderTask(
  connection,
  currentTask,
  desiredStatus,
  desiredPosition,
  positionWasProvided
) {
  const projectId = Number(currentTask.projectId);
  const currentStatus = currentTask.status;
  const statuses = [...new Set([currentStatus, desiredStatus])];
  const placeholders = statuses.map(() => '?').join(', ');

  const [rows] = await connection.query(
    `SELECT id, status, position
     FROM tasks
     WHERE project_id = ? AND status IN (${placeholders})
     ORDER BY status ASC, position ASC, id ASC
     FOR UPDATE`,
    [projectId, ...statuses]
  );

  const groupedTasks = new Map(statuses.map((status) => [status, []]));

  for (const row of rows) {
    if (Number(row.id) === Number(currentTask.id)) {
      continue;
    }

    if (!groupedTasks.has(row.status)) {
      groupedTasks.set(row.status, []);
    }

    groupedTasks.get(row.status).push({
      id: Number(row.id),
      status: row.status,
      position: Number(row.position)
    });
  }

  const destinationTasks = groupedTasks.get(desiredStatus) || [];
  const insertionIndex = positionWasProvided
    ? Math.min(desiredPosition, destinationTasks.length)
    : destinationTasks.length;

  destinationTasks.splice(insertionIndex, 0, {
    id: Number(currentTask.id),
    status: desiredStatus,
    position: Number(currentTask.position)
  });
  groupedTasks.set(desiredStatus, destinationTasks);

  for (const [status, tasks] of groupedTasks.entries()) {
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];

      if (task.status !== status || task.position !== index) {
        await connection.query(
          `UPDATE tasks
           SET status = ?, position = ?
           WHERE id = ? AND project_id = ?`,
          [status, index, task.id, projectId]
        );
      }
    }
  }
}

async function listTasks(req, res) {
  const projectId = parseId(req.params.projectId, 'projectId');
  const userId = Number(req.session.userId);

  const [projectRows] = await pool.query(
    `SELECT id
     FROM projects
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [projectId, userId]
  );

  if (projectRows.length === 0) {
    throw new HttpError(404, 'Project not found');
  }

  const [rows] = await pool.query(
    `SELECT
       t.id,
       t.project_id AS projectId,
       p.project_key AS projectKey,
       t.issue_number AS issueNumber,
       t.title,
       t.description,
       t.status,
       t.priority,
       DATE_FORMAT(t.due_date, '%Y-%m-%d') AS dueDate,
       t.position,
       t.created_at AS createdAt,
       t.updated_at AS updatedAt
     FROM tasks AS t
     INNER JOIN projects AS p ON p.id = t.project_id
     WHERE p.id = ? AND p.user_id = ?
     ORDER BY t.status ASC, t.position ASC, t.id ASC`,
    [projectId, userId]
  );

  res.status(200).json({
    tasks: rows.map(normalizeTaskRecord)
  });
}

async function createTask(req, res) {
  const projectId = parseId(req.params.projectId, 'projectId');
  const userId = Number(req.session.userId);
  const payload = req.body || {};
  const values = validateTaskPayload(payload, false);

  const titleValue = getValidatedValue(values, payload, 'title');
  const title = typeof titleValue === 'string' ? titleValue.trim() : '';

  if (!title) {
    throw new HttpError(400, 'Validation failed', {
      title: 'Title is required'
    });
  }

  const descriptionValue = getValidatedValue(
    values,
    payload,
    'description'
  );
  const statusValue = getValidatedValue(values, payload, 'status');
  const priorityValue = getValidatedValue(values, payload, 'priority');
  const dueDateValue = getValidatedValue(
    values,
    payload,
    'dueDate',
    'due_date'
  );

  const description =
    descriptionValue === undefined || descriptionValue === null
      ? ''
      : String(descriptionValue);
  const status =
    statusValue === undefined ? 'backlog' : String(statusValue);
  const priority =
    priorityValue === undefined ? 'medium' : String(priorityValue);
  const dueDate =
    dueDateValue === undefined ||
    dueDateValue === null ||
    dueDateValue === ''
      ? null
      : dueDateValue;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [projectRows] = await connection.query(
      `SELECT p.id, p.project_key, p.issue_counter
       FROM projects AS p
       WHERE p.id = ? AND p.user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [projectId, userId]
    );

    if (projectRows.length === 0) {
      throw new HttpError(404, 'Project not found');
    }

    const project = projectRows[0];
    const issueNumber = Number(project.issue_counter) + 1;

    const [positionRows] = await connection.query(
      `SELECT COALESCE(MAX(position), -1) AS maxPosition
       FROM tasks
       WHERE project_id = ? AND status = ?`,
      [projectId, status]
    );

    const position = Number(positionRows[0].maxPosition) + 1;

    await connection.query(
      `UPDATE projects
       SET issue_counter = ?
       WHERE id = ?`,
      [issueNumber, projectId]
    );

    const [insertResult] = await connection.query(
      `INSERT INTO tasks
         (
           project_id,
           issue_number,
           title,
           description,
           status,
           priority,
           due_date,
           position
         )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        issueNumber,
        title,
        description,
        status,
        priority,
        dueDate,
        position
      ]
    );

    const taskRow = await selectTaskById(
      connection,
      insertResult.insertId,
      userId
    );

    await connection.commit();

    res.status(201).json({
      task: normalizeTaskRecord(taskRow)
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back task creation transaction:', rollbackError);
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function updateTask(req, res) {
  const taskId = parseId(req.params.taskId, 'taskId');
  const userId = Number(req.session.userId);
  const payload = req.body || {};
  const values = validateTaskPayload(payload, true);

  const supportedFields = [
    'title',
    'description',
    'status',
    'priority',
    'dueDate',
    'due_date',
    'position'
  ];

  if (!supportedFields.some((field) => hasOwn(payload, field))) {
    throw new HttpError(400, 'Validation failed', {
      task: 'At least one task field must be provided'
    });
  }

  const positionWasProvided = hasOwn(payload, 'position');
  const desiredPosition = positionWasProvided
    ? normalizePosition(
        getValidatedValue(values, payload, 'position')
      )
    : null;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const currentRow = await selectTaskById(
      connection,
      taskId,
      userId,
      true
    );

    if (!currentRow) {
      throw new HttpError(404, 'Task not found');
    }

    const currentTask = normalizeTaskRecord(currentRow);
    const statusWasProvided = hasOwn(payload, 'status');
    const desiredStatus = statusWasProvided
      ? String(getValidatedValue(values, payload, 'status'))
      : currentTask.status;

    if (
      desiredStatus !== currentTask.status ||
      positionWasProvided
    ) {
      await reorderTask(
        connection,
        currentTask,
        desiredStatus,
        desiredPosition,
        positionWasProvided
      );
    }

    const assignments = [];
    const parameters = [];

    if (hasOwn(payload, 'title')) {
      const titleValue = getValidatedValue(values, payload, 'title');
      const title =
        typeof titleValue === 'string' ? titleValue.trim() : '';

      if (!title) {
        throw new HttpError(400, 'Validation failed', {
          title: 'Title is required'
        });
      }

      assignments.push('title = ?');
      parameters.push(title);
    }

    if (hasOwn(payload, 'description')) {
      const descriptionValue = getValidatedValue(
        values,
        payload,
        'description'
      );

      assignments.push('description = ?');
      parameters.push(
        descriptionValue === undefined || descriptionValue === null
          ? ''
          : String(descriptionValue)
      );
    }

    if (hasOwn(payload, 'priority')) {
      assignments.push('priority = ?');
      parameters.push(
        String(getValidatedValue(values, payload, 'priority'))
      );
    }

    if (hasOwn(payload, 'dueDate') || hasOwn(payload, 'due_date')) {
      const dueDateValue = getValidatedValue(
        values,
        payload,
        'dueDate',
        'due_date'
      );

      assignments.push('due_date = ?');
      parameters.push(
        dueDateValue === undefined ||
          dueDateValue === null ||
          dueDateValue === ''
          ? null
          : dueDateValue
      );
    }

    if (
      statusWasProvided &&
      desiredStatus === currentTask.status &&
      !positionWasProvided
    ) {
      assignments.push('status = ?');
      parameters.push(desiredStatus);
    }

    if (assignments.length > 0) {
      parameters.push(taskId, currentTask.projectId);

      await connection.query(
        `UPDATE tasks
         SET ${assignments.join(', ')}
         WHERE id = ? AND project_id = ?`,
        parameters
      );
    }

    const updatedRow = await selectTaskById(
      connection,
      taskId,
      userId
    );

    await connection.commit();

    res.status(200).json({
      task: normalizeTaskRecord(updatedRow)
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back task update transaction:', rollbackError);
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function deleteTask(req, res) {
  const taskId = parseId(req.params.taskId, 'taskId');
  const userId = Number(req.session.userId);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const taskRow = await selectTaskById(
      connection,
      taskId,
      userId,
      true
    );

    if (!taskRow) {
      throw new HttpError(404, 'Task not found');
    }

    const task = normalizeTaskRecord(taskRow);

    await connection.query(
      `DELETE FROM tasks
       WHERE id = ? AND project_id = ?`,
      [taskId, task.projectId]
    );

    await connection.query(
      `UPDATE tasks
       SET position = position - 1
       WHERE project_id = ?
         AND status = ?
         AND position > ?`,
      [task.projectId, task.status, task.position]
    );

    await connection.commit();

    res.status(200).json({
      message: 'Task deleted successfully'
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Failed to roll back task deletion transaction:', rollbackError);
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask
};