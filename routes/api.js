'use strict';

var expect = require('chai').expect;
var mongoose = require('mongoose')
var objectId = mongoose.Types.ObjectId

// Not setting default on created so that updated is in sync
var issueSchema = new mongoose.Schema({
  project    : { type: String, required: true, select: false },
  issue_title: { type: String, required: true },
  issue_text : { type: String, required: true },
  created_by : { type: String, required: true },
  assigned_to: { type: String, default: '' },
  status_text: { type: String, default: '' },
  open       : { type: Boolean, default: true },
  created_on : String,
  updated_on : String
})

issueSchema.pre('save', function(next) {
  if (!this.created_on) {
    this.created_on = new Date().toISOString()
  }
  this.updated_on = new Date().toISOString()
  next()
})

var Issue = mongoose.model('issues', issueSchema)

function required(issue, requiredFields) {
  let errors = []
  
  requiredFields.forEach(field => {
    if (!issue[field]) { errors.push(field) }
  })
  
  if (errors.length) {
    return 'Missing required fields: ' + errors.join(', ')
  }
  // return false
}

function populate(source, fields, obj={}) {  
  fields.forEach(field => {
    if (source[field]) {
      obj[field] = source[field]
    }  
  })
  return obj
}

module.exports = function (app) {

  app.route('/api/issues/:project')
    // GET
    .get(function (req, res){      
      let fields = ['issue_title', 'issue_text', 'created_by', 'assigned_to', 'status_text', 'open', 'created_on', 'updated_on']
      let query = populate(req.query, fields)
      query.project = req.params.project
      if (req.query._id) {
        query._id = objectId(req.query._id)
      }
      
      Issue.find(query, (err, issues) => {
        if (err) { res.status(500).json(err) }
        res.json(issues)
      })
    })
    
    // POST
    .post(function (req, res) {
      // TODO: check fields to make sure they are valid?
      req.body.project = req.params.project

      let errors = required(req.body, ['project', 'issue_title', 'issue_text', 'created_by'])
      if (errors) {
        res.status(400).send(errors)
        return
      }
      let fields = ['project', 'issue_title', 'issue_text', 'created_by', 'assigned_to', 'status_text']
      let newIssue = new Issue(populate(req.body, fields))
      newIssue.save((err, issue) => {
        if (err) { res.status(500).json(err) }
        res.json(issue)
      })
    })
    
    // PUT
    .put(function (req, res) {
      let project = req.params.project;
      let _id = req.body._id
      if (!_id) {
        return res.status(400).send('_id error')
      }
      _id = objectId(_id)
    
      // TODO: check how mongoose handles invalid fields
      let fields = ['issue_title', 'issue_text', 'created_by', 'assigned_to', 'status_text', 'open']
      let query = populate(req.body, fields)
      
      if (!Object.keys(query).length) {
        return res.status(400).send('no updated field sent')
      }
    
      Issue.findById(_id)
        .then(issue => {
          if (!issue) {
            throw 'could not update ' + _id
          }
          issue = populate(query, fields, issue)
          return issue.save()
        })
        .then(saved => {
          res.send('successfully updated')
        })
        .catch(err => {
          res.status(500).send('could not update ' + _id)
        })
      
    })
    
    // DELETE
    .delete(function (req, res){
      let project = req.params.project;
      let _id = req.body._id
      if (!_id) {
        res.status(400).send('no _id')
        return
      }
      _id = objectId(_id)
      Issue.findByIdAndRemove(_id, (err, issue) => {
        if (err) {
          res.status(500).send('could not delete ' + _id)
        } else {
          res.send('deleted ' + _id)
        }
      })
    });
    
};