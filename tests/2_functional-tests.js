// controllers/issueController.js
const { ObjectId } = require('mongodb');

const DBConnection = require('../dbconnection');
const sampleIssues = require('./sampleIssues.js');

const DB_NAME = process.env.DB_NAME;

module.exports = DBConnection.getClient().then((dbClient) => {
  const issueCollection = dbClient.db(DB_NAME).collection('issues');

  issueCollection.createIndex(
    { expireXSecondsFrom: 1 },
    { expireAfterSeconds: 86400 }, // Expire after 1 day
  );

  issueCollection.insertMany(sampleIssues);

  const issueController = {};

  issueController.getAllProjectIssues = async (req, res, next) => {
    const project_name = req.params.project;
    if (!project_name) {
      return res
        .status(400)
        .json({ error: 'require project name for issues in URL' });
    }

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

    Object.keys(issueFilters).forEach((key) =>
      issueFilters[key] === undefined ? delete issueFilters[key] : null,
    );

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
      issueFilters.open = issueFilters.open === 'true';
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

    if (requiredFields.some((field) => field === undefined)) {
      return res
        .status(400)
        .json({ error: 'required field(s) missing' });
    }

    try {
      const creationDate = new Date();
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

  issueController.updateIssueByID = async (req, res, next) => {
    const project_name = req.params.project;
    if (!project_name) {
      return res
        .status(400)
        .json({ error: 'require project name for issues in URL' });
    }

    const _id = req.body._id;
    if (_id === undefined) {
      return res.status(200).json({
        error: 'missing _id',
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

    Object.keys(issueUpdates).forEach((key) =>
      [undefined, ''].includes(issueUpdates[key])
        ? delete issueUpdates[key]
        : null,
    );

    if (issueUpdates.open !== 'false') {
      delete issueUpdates.open;
    } else {
      issueUpdates.open = false;
    }

    if (Object.keys(issueUpdates).length === 0) {
      return res.status(200).json({
        error: 'no update field(s) sent',
        _id,
      });
    }

    issueUpdates.updated_on = new Date();

    try {
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
      return res.status(200).json({
        error: 'could not update',
        _id,
      });
    }
  };

  issueController.deleteIssueByID = async (req, res, next) => {
    const project_name = req.params.project;
    if (!project_name) {
      return res
        .status(400)
        .json({ error: 'require project name for issues in URL' });
    }

    const _id = req.body._id;
    if (_id === undefined) {
      return res.status(200).json({
        error: 'missing _id',
      });
    }

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
      return res.status(200).json({
        error: 'could not delete',
        _id,
      });
    }
  };

  return issueController;
});
