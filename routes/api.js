'use strict';

const removeUnneededIssueFields = ({
  _id,
  project_name,
  issue_title,
  issue_text,
  created_by,
  assigned_to,
  status_text,
  open,
  created_on,
  updated_on,
}) => ({
  _id,
  project_name,
  issue_title,
  issue_text,
  created_by,
  assigned_to,
  status_text,
  open,
  created_on,
  updated_on,
});

module.exports = async function (app) {
  // Get issueController middleware (requires waiting for DB connection)

  const {
    getAllProjectIssues,
    createNewIssue,
    updateIssueByID,
    deleteIssueByID,
  } = await require('../controllers/issueController');

  app
    .route('/api/issues/:project')

    // GET route to return all issues for a project
    .get(getAllProjectIssues, (req, res) => {
      return res.json(
        res.locals.projectIssues.map((issue) =>
          removeUnneededIssueFields(issue),
        ),
      );
    })

    // POST route to handle creating a new issue for a project
    .post(createNewIssue, (req, res) => {
      // Return issue-related document fields:
      return res.json(removeUnneededIssueFields(res.locals.issueDoc));
    })

    .put(updateIssueByID, (req, res) => {
      const updateDoc = removeUnneededIssueFields(res.locals.updateDoc);
      updateDoc.result = 'successfully updated';
      return res.status(200).json(updateDoc);
    })

    .delete(deleteIssueByID, (req, res) => {
      return res.json({
        result: 'successfully deleted',
        _id: res.locals.deletedID,
      });
    });
};