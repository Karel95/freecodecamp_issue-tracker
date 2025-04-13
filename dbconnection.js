const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;

// Connect to the database and return the dbClient
async function main() {
  // Use connect method to connect to the server
  try {
    const dbClient = await new MongoClient(MONGO_URI).connect();
    console.log('Connected to database successfully');
    return dbClient;
  } catch (err) {
    console.error('Error when connecting to database: ', err);
    throw new Error('Unable to Connect to Database');
  }
}

// This object is a pseudo-singleton
// DBConnection.getClient instantiates DB connection a single time
const DBConnection = {
  client: null,
  getClient: async function () {
    if (this.client !== null) {
      return this.client;
    }
    this.client = await main();
    return this.client;
  },
};

module.exports = DBConnection;
