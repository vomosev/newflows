const express = require('express');
const {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} = require('../controllers/projectController');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(listProjects));
router.post('/', asyncHandler(createProject));
router.get('/:projectId', asyncHandler(getProject));
router.patch('/:projectId', asyncHandler(updateProject));
router.delete('/:projectId', asyncHandler(deleteProject));

module.exports = router;