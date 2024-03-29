const QueryEngine = require('@comunica/query-sparql-hdt').QueryEngine;
module.exports = require('./sparql-engine-base.js')(new QueryEngine());
