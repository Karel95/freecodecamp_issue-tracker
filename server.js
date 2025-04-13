'use strict';

// .env file can hold PORT variable if desired
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const DBConnection = require('./dbconnection.js');
const apiRoutes = require('./routes/api.js');
const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner');

const app = express();

// Log incoming requests in development:
if (process.env.RUN_MODE === 'development') {
  app.use((req, res, next) => {
    console.log(
      `${req.method} ${req.path}; IP=${req.ip}; https?=${req.secure}`,
    );
    next();
  });
}

// Serve static files from /public folder on any request to /public
app.use('/public', express.static(process.cwd() + '/public'));

app.use(cors({ origin: '*' })); // For FCC testing purposes only

// Parse request JSON and url encoded bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to DB before connecting app routes:
DBConnection.getClient()
  .then(async (dbClient) => {
    // Front end for specific project issues:
    app.route('/:project/').get(function (req, res) {
      res.sendFile(__dirname + '/views/issue.html');
    });

    // Serve index.html page on get request to '/'
    app.route('/').get(function (req, res) {
      res.sendFile(__dirname + '/views/index.html');
    });

    // For FCC testing purposes
    fccTestingRoutes(app);

    // Routing for API
    await apiRoutes(app);

    // 404 page not found:
    app.get('*', (req, res) => {
      console.log('HIT 404 ROUTE');
      // Redirect to index
      res.redirect('/');
    });
  })
  .catch((err) => {
    // If an error occurs, respond to requests with error message
    console.error('Error when trying to set up routes with DB: ', err);
    app.use('*', (req, res) => res.send('Database connection error!'));
  });

// Internal Error Handler:
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal Server error: See Server Logs');
});

// Have server listen on PORT or default to 3000
// http://localhost:3000/
// If NODE_ENV='test' then tests will be run on startup
const listener = app.listen(process.env.PORT || 3000, function () {
  console.log('Your app is listening on port ' + listener.address().port);
  if (process.env.NODE_ENV === 'test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (e) {
        console.log('Tests are not valid:');
        console.error(e);
      }
    }, 3500);
  }
});

module.exports = app; //for testing