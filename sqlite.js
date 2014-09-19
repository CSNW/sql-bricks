// SQLite extension for SQLBricks
function SQLiteBricks(sql) {
  // default namespace in node & browser
  if (!sql) {
    if (typeof exports != 'undefined')
      sql = require('./limit-offset.js')();
    else
      sql = window.LimitOffsetBricks();
  }

  var Update = sql.update;
  var Insert = sql.insert;

  // Insert & Update OR clauses (SQLite dialect)
  Update.defineClause('or', '{{#if _or}}OR {{_or}}{{/if}}', {after: 'update'});
  Insert.defineClause('or', '{{#if _or}}OR {{_or}}{{/if}}', {after: 'insert'});

  var or_methods = {
    'orReplace': 'REPLACE', 'orRollback': 'ROLLBACK',
    'orAbort': 'ABORT', 'orFail': 'FAIL'
  };
  Object.keys(or_methods).forEach(function(method) {
    Insert.prototype[method] = Update.prototype[method] = function() {
      this._or = or_methods[method]; return this;
    };
  });

  return sql;
}

if (typeof exports != 'undefined')
  module.exports = SQLiteBricks;
