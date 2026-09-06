'use strict';

const TASK_STATUSES = Object.freeze([
  'backlog',
  'todo',
  'in_progress',
  'done',
]);

const TASK_PRIORITIES = Object.freeze([
  'low',
  'medium',
  'high',
  'urgent',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeInput(input) {
  return isObject(input) ? input : {};
}

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeStatus(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return normalized === 'to_do' ? 'todo' : normalized;
}

function normalizePriority(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function resolvePartialOption(option) {
  if (typeof option === 'boolean') {
    return option;
  }

  return Boolean(option && typeof option === 'object' && option.partial);
}

function createResult(errors, value) {
  const result = { errors, value };
  const isValid = Object.keys(errors).length === 0;

  Object.defineProperties(result, {
    values: {
      enumerable: false,
      value,
    },
    data: {
      enumerable: false,
      value,
    },
    sanitizedValues: {
      enumerable: false,
      value,
    },
    isValid: {
      enumerable: false,
      value: isValid,
    },
    valid: {
      enumerable: false,
      value: isValid,
    },
  });

  return result;
}

function isValidCalendarDate(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const match = DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateSignup(input) {
  const source = normalizeInput(input);
  const errors = {};
  const value = {};

  if (typeof source.name !== 'string') {
    errors.name = 'Name is required.';
  } else {
    const name = normalizeWhitespace(source.name);

    if (name.length < 2) {
      errors.name = 'Name must be at least 2 characters long.';
    } else if (name.length > 100) {
      errors.name = 'Name must not exceed 100 characters.';
    } else {
      value.name = name;
    }
  }

  if (typeof source.email !== 'string') {
    errors.email = 'Email is required.';
  } else {
    const email = source.email.trim().toLowerCase();

    if (!email) {
      errors.email = 'Email is required.';
    } else if (email.length > 255 || !EMAIL_PATTERN.test(email)) {
      errors.email = 'Enter a valid email address.';
    } else {
      value.email = email;
    }
  }

  if (typeof source.password !== 'string') {
    errors.password = 'Password is required.';
  } else if (source.password.length < 8) {
    errors.password = 'Password must be at least 8 characters long.';
  } else if (Buffer.byteLength(source.password, 'utf8') > 72) {
    errors.password = 'Password must not exceed 72 bytes.';
  } else {
    value.password = source.password;
  }

  const confirmationKey = hasOwn(source, 'passwordConfirmation')
    ? 'passwordConfirmation'
    : hasOwn(source, 'confirmPassword')
      ? 'confirmPassword'
      : null;

  if (
    confirmationKey &&
    typeof source[confirmationKey] !== 'string'
  ) {
    errors.passwordConfirmation = 'Password confirmation must be a string.';
  } else if (
    confirmationKey &&
    source[confirmationKey] !== source.password
  ) {
    errors.passwordConfirmation = 'Passwords do not match.';
  }

  return createResult(errors, value);
}

function validateLogin(input) {
  const source = normalizeInput(input);
  const errors = {};
  const value = {};

  if (typeof source.email !== 'string') {
    errors.email = 'Email is required.';
  } else {
    const email = source.email.trim().toLowerCase();

    if (!email) {
      errors.email = 'Email is required.';
    } else if (email.length > 255 || !EMAIL_PATTERN.test(email)) {
      errors.email = 'Enter a valid email address.';
    } else {
      value.email = email;
    }
  }

  if (typeof source.password !== 'string' || source.password.length === 0) {
    errors.password = 'Password is required.';
  } else if (Buffer.byteLength(source.password, 'utf8') > 72) {
    errors.password = 'Password must not exceed 72 bytes.';
  } else {
    value.password = source.password;
  }

  return createResult(errors, value);
}

function validateProject(input, partialOption = false) {
  const source = normalizeInput(input);
  const partial = resolvePartialOption(partialOption);
  const errors = {};
  const value = {};

  if (!partial || hasOwn(source, 'name')) {
    if (typeof source.name !== 'string') {
      errors.name = 'Project name is required.';
    } else {
      const name = normalizeWhitespace(source.name);

      if (!name) {
        errors.name = 'Project name is required.';
      } else if (name.length > 120) {
        errors.name = 'Project name must not exceed 120 characters.';
      } else {
        value.name = name;
      }
    }
  }

  if (!partial || hasOwn(source, 'key')) {
    if (typeof source.key !== 'string') {
      errors.key = 'Project key is required.';
    } else {
      const key = source.key.trim().toUpperCase();

      if (!key) {
        errors.key = 'Project key is required.';
      } else if (!PROJECT_KEY_PATTERN.test(key)) {
        errors.key =
          'Project key must be 2 to 10 characters, start with a letter, and contain only letters and numbers.';
      } else {
        value.key = key;
      }
    }
  }

  if (hasOwn(source, 'description')) {
    if (source.description !== null && typeof source.description !== 'string') {
      errors.description = 'Description must be text.';
    } else {
      const description =
        source.description === null ? '' : source.description.trim();

      if (description.length > 5000) {
        errors.description = 'Description must not exceed 5000 characters.';
      } else {
        value.description = description;
      }
    }
  } else if (!partial) {
    value.description = '';
  }

  if (hasOwn(source, 'color')) {
    if (typeof source.color !== 'string') {
      errors.color = 'Color must be a hexadecimal color value.';
    } else {
      const color = source.color.trim().toLowerCase();

      if (!COLOR_PATTERN.test(color)) {
        errors.color = 'Color must use the format #RRGGBB.';
      } else {
        value.color = color;
      }
    }
  } else if (!partial) {
    value.color = '#4f46e5';
  }

  if (
    partial &&
    Object.keys(value).length === 0 &&
    Object.keys(errors).length === 0
  ) {
    errors.form = 'Provide at least one project field to update.';
  }

  return createResult(errors, value);
}

function validateProjectCreate(input) {
  return validateProject(input, false);
}

function validateProjectUpdate(input) {
  return validateProject(input, true);
}

function validateTask(input, partialOption = false) {
  const source = normalizeInput(input);
  const partial = resolvePartialOption(partialOption);
  const errors = {};
  const value = {};

  if (!partial || hasOwn(source, 'title')) {
    if (typeof source.title !== 'string') {
      errors.title = 'Task title is required.';
    } else {
      const title = normalizeWhitespace(source.title);

      if (!title) {
        errors.title = 'Task title is required.';
      } else if (title.length > 255) {
        errors.title = 'Task title must not exceed 255 characters.';
      } else {
        value.title = title;
      }
    }
  }

  if (hasOwn(source, 'description')) {
    if (source.description !== null && typeof source.description !== 'string') {
      errors.description = 'Description must be text.';
    } else {
      const description =
        source.description === null ? '' : source.description.trim();

      if (description.length > 10000) {
        errors.description = 'Description must not exceed 10000 characters.';
      } else {
        value.description = description;
      }
    }
  } else if (!partial) {
    value.description = '';
  }

  if (hasOwn(source, 'status')) {
    const status = normalizeStatus(source.status);

    if (typeof status !== 'string' || !TASK_STATUSES.includes(status)) {
      errors.status = `Status must be one of: ${TASK_STATUSES.join(', ')}.`;
    } else {
      value.status = status;
    }
  } else if (!partial) {
    value.status = 'backlog';
  }

  if (hasOwn(source, 'priority')) {
    const priority = normalizePriority(source.priority);

    if (
      typeof priority !== 'string' ||
      !TASK_PRIORITIES.includes(priority)
    ) {
      errors.priority = `Priority must be one of: ${TASK_PRIORITIES.join(', ')}.`;
    } else {
      value.priority = priority;
    }
  } else if (!partial) {
    value.priority = 'medium';
  }

  if (hasOwn(source, 'dueDate') || hasOwn(source, 'due_date')) {
    const dueDate = hasOwn(source, 'dueDate')
      ? source.dueDate
      : source.due_date;

    if (dueDate === null || dueDate === '') {
      value.dueDate = null;
    } else if (!isValidCalendarDate(dueDate)) {
      errors.dueDate = 'Due date must be a valid date in YYYY-MM-DD format.';
    } else {
      value.dueDate = dueDate;
    }
  } else if (!partial) {
    value.dueDate = null;
  }

  if (hasOwn(source, 'position')) {
    const rawPosition = source.position;
    const position =
      typeof rawPosition === 'string' && rawPosition.trim() !== ''
        ? Number(rawPosition)
        : rawPosition;

    if (
      typeof position !== 'number' ||
      !Number.isFinite(position) ||
      position < 0
    ) {
      errors.position = 'Position must be a non-negative number.';
    } else {
      value.position = position;
    }
  }

  if (
    partial &&
    Object.keys(value).length === 0 &&
    Object.keys(errors).length === 0
  ) {
    errors.form = 'Provide at least one task field to update.';
  }

  return createResult(errors, value);
}

function validateTaskCreate(input) {
  return validateTask(input, false);
}

function validateTaskUpdate(input) {
  return validateTask(input, true);
}

module.exports = {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUS_VALUES: TASK_STATUSES,
  TASK_PRIORITY_VALUES: TASK_PRIORITIES,
  VALID_TASK_STATUSES: TASK_STATUSES,
  VALID_TASK_PRIORITIES: TASK_PRIORITIES,
  ALLOWED_TASK_STATUSES: TASK_STATUSES,
  ALLOWED_TASK_PRIORITIES: TASK_PRIORITIES,
  validateSignup,
  validateSignupInput: validateSignup,
  validateLogin,
  validateLoginInput: validateLogin,
  validateProject,
  validateProjectInput: validateProject,
  validateProjectCreate,
  validateProjectUpdate,
  validateTask,
  validateTaskInput: validateTask,
  validateTaskCreate,
  validateTaskUpdate,
};