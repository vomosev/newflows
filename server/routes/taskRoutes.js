const express = require('express');
const {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
} = require('../controllers/taskController');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.use(requireAuth);

router.get('/projects/:projectId/tasks', asyncHandler(listTasks));
router.post('/projects/:projectId/tasks', asyncHandler(createTask));
router.patch('/tasks/:taskId', asyncHandler(updateTask));
router.delete('/tasks/:taskId', asyncHandler(deleteTask));

module.exports = router;