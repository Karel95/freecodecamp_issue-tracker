const { ObjectId } = require('mongodb');

const DBConnection = require('../dbconnection');
const sampleIssues = require('./sampleIssues.js');

const DB_NAME = process.env.DB_NAME;

module.exports = DBConnection.getClient().then((dbClient) => {
  // Get Issue Collection from DB
  const issueCollection = dbClient.db(DB_NAME).collection('issues');

  // Create TTL index to expire documents after X seconds
  // https://www.mongodb.com/docs/manual/tutorial/expire-data/
  issueCollection.createIndex(
    { expireXSecondsFrom: 1 },
    { expireAfterSeconds: 86400 }, // Expire records after 1 day
  );

  // Insert some sample Issues on every server startup
  issueCollection.insertMany(sampleIssues);

  const issueController = {};

  // Gets all Issues for a given project_name that match all filters
  // Matching Issues are added to res.locals.projectIssues
  issueController.getAllProjectIssues = async (req, res, next) => {
    const project_name = req.params.project;

    if (!project_name) {
      return res
        .status(400)
        .json({ error: 'require project name for issues in URL' });
    }

    // Get any valid field filters if they are present:
    const issueFilters = (({
      _id,
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
      issue_title,
      issue_text,
      created_by,
      assigned_to,
      status_text,
      open,
      created_on,
      updated_on,
    }))(req.query);

    // Remove any undefined keys:
    Object.keys(issueFilters).forEach((key) =>
      issueFilters[key] === undefined ? delete issueFilters[key] : null,
    );

    // Coerce non-string issue filters into the correct types:
    if (issueFilters._id) {
      try {
        issueFilters._id = ObjectId(issueFilters._id);
      } catch (err) {
        return res.status(400).json({
          error: `Invalid _id parameter: ${issueFilters._id}; Please check _id`,
        });
      }
    }
    if (issueFilters.open) {
      if (!['true', 'false'].includes(issueFilters.open)) {
        return res.status(400).json({
          error: `Invalid value given for open filter: ${issueFilters.open}; must be true or false`,
        });
      }
      issueFilters.open = issueFilters.open === 'true' ? true : false;
    }
    if (issueFilters.created_on) {
      const givenValue = issueFilters.created_on;
      issueFilters.created_on = new Date(issueFilters.created_on);
      if (issueFilters.created_on.toString() === 'Invalid Date') {
        return res.status(400).json({
          error: `Invalid value given for created_on filter: ${givenValue}`,
        });
      }
    }
    if (issueFilters.updated_on) {
      const givenValue = issueFilters.updated_on;
      issueFilters.updated_on = new Date(issueFilters.updated_on);
      if (issueFilters.updated_on.toString() === 'Invalid Date') {
        return res.status(400).json({
          error: `Invalid value given for updated_on filter: ${givenValue}`,
        });
      }
    }

    const projectIssues = await issueCollection
      .find({ project_name, ...issueFilters })
      .sort({ updated_on: 1 })
      .toArray();

    res.locals.projectIssues = projectIssues;

    return next();
  };

  // Creates a new issue for the given project
  // Created document is stored in res.locals.issueDoc
  issueController.createNewIssue = async (req, res, next) => {
    const project_name = req.params.project;

    if (!project_name) {
      return res
        .status(400)
        .json({ error: 'require project name for issues in URL' });
    }

    const { issue_title, issue_text, created_by, assigned_to, status_text } =
      req.body;

    const requiredFields = [issue_title, issue_text, created_by];

    // If any required field is missing, return an error
    if (requiredFields.some((field) => field === undefined)) {
      const missingFields = ['issue_title', 'issue_text', 'created_by'].reduce(
        (accum, fieldName) => {
          if (req.body[fieldName] === undefined) {
            accum.push(fieldName);
          }
          return accum;
        },
        [],
      );
      return res
        .status(400)
        .json({ error: 'required field(s) missing', missingFields });
    }

    // No fields are missing, create a new DB document
    try {
      const creationDate = new Date();

      // Create Document in DB
      const issueDocInfo = await issueCollection.insertOne({
        project_name,
        issue_title,
        issue_text,
        created_by,
        assigned_to: assigned_to === undefined ? '' : assigned_to,
        status_text: status_text === undefined ? '' : status_text,
        open: true,
        created_on: creationDate,
        updated_on: creationDate,
        expireXSecondsFrom: creationDate,
      });

      // Get created document (can't seem to be done in a single step...)
      const issueDoc = await issueCollection.findOne({
        _id: issueDocInfo.insertedId,
      });

      res.locals.issueDoc = issueDoc;
      return next();
    } catch (err) {
      console.error(
        'Error in issueController.createNewIssue when trying to create a new Issue: ',
        err,
      );
      return next(err);
    }
  };

  // Update an Issue is the project_name and _id matches an Issue
  // Adds the updated document to res.locals.updateDoc
  issueController.updateIssueByID = async (req, res, next) => {
    const project_name = req.params.project;

    if (!project_name) {
      return res
        .status(400)
        .json({ error: 'require project name for issues in URL' });
    }

    // If no issue _id set, return an error
    const _id = req.body._id;
    if (_id === undefined) {
      // !!! Should probably be 400 code (200 needed for FE)
      return res.status(200).json({
        error: 'missing _id',
        info: 'Valid _id field is required to update a specific issue',
      });
    }

    const issueUpdates = (({
      issue_title,
      issue_text,
      created_by,
      assigned_to,
      status_text,
      open,
    }) => ({
      issue_title,
      issue_text,
      created_by,
      assigned_to,
      status_text,
      open,
    }))(req.body);

    // Remove any undefined or empty string update fields:
    Object.keys(issueUpdates).forEach((key) =>
      [undefined, ''].includes(issueUpdates[key])
        ? delete issueUpdates[key]
        : null,
    );

    // Open can only be set to false to close the issue, otherwise it is ignored
    // !!! Perhaps make only JSON bodies accepted for this route
    // such that boolean values can be passed in directly??
    if (issueUpdates.open !== 'false') {
      delete issueUpdates.open;
    } else {
      issueUpdates.open = false;
    }

    // If we have no fields to be updated, return an error:
    if (Object.keys(issueUpdates).length === 0) {
      return res.status(200).json({
        // !!! Should probably be 400 code (200 needed for FE)
        error: 'no update field(s) sent',
        _id,
        info: 'Minimum of 1 field must be given a value to update',
      });
    }

    // Update the update_on property of the issue
    issueUpdates.updated_on = new Date();

    try {
      // Perform update on document by id
      const updateInfo = await issueCollection.updateOne(
        { project_name, _id: ObjectId(_id) },
        { $set: { ...issueUpdates } },
      );

      if (updateInfo.modifiedCount !== 1) {
        throw new Error('No document found for update');
      }

      const updateDoc = await issueCollection.findOne({ _id: ObjectId(_id) });

      res.locals.updateDoc = updateDoc;
      return next();
    } catch (err) {
      console.error('Error in issueController.updateIssueById: ', err);
      // !!! Should probably be 400 code (200 needed for FE)
      return res.status(200).json({
        error: 'could not update',
        _id,
        info: 'Issue could not be updated. Please check issue _id is valid and project name is correct',
      });
    }
  };

  // Deletes an Issue if given _id and project_name matches
  // Deleted Issue _id is added to res.locals.deletedID
  issueController.deleteIssueByID = async (req, res, next) => {
    const project_name = req.params.project;

    if (!project_name) {
      return res
        .status(400)
        .json({ error: 'require project name for issues in URL' });
    }

    // If no issue _id set, return an error
    const _id = req.body._id;
    if (_id === undefined) {
      // !!! Should probably be 400 code (200 needed for FE)
      return res.status(200).json({
        error: 'missing _id',
        info: 'Valid _id field is required to delete a specific issue',
      });
    }

    // Try to delete the given issue:
    try {
      const deleteInfo = await issueCollection.deleteOne({
        project_name,
        _id: ObjectId(_id),
      });

      if (deleteInfo.deletedCount !== 1) {
        throw new Error('No document found for deletion');
      }

      res.locals.deletedID = _id;
      return next();
    } catch (err) {
      console.error('Error in issueController.updateIssueById: ', err);
      // !!! Should probably be 400 code (200 needed for FE)
      return res.status(200).json({
        error: 'could not delete',
        _id,
        info: 'Issue could not be deleted. Please check issue _id is valid and project name is correct',
      });
    }
  };

  return issueController;
});