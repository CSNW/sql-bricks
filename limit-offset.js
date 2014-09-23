// This extension adds LIMIT ... OFFSET, which is (nearly) identical in SQLite, MySQL and Postgres.

// The SQL:2008 standard is different (OFFSET 2 ROWS FETCH NEXT 1 ROWS ONLY)
// and is supported by MS SQL Server 2012 and Oracle 12c.
// More details here: http://www.jooq.org/doc/3.1/manual/sql-building/sql-statements/select-statement/limit-clause/

function LimitOffsetBricks(sql) {
  "use strict";
  
  // default namespace in node & browser
  if (!sql) {
    if (typeof exports != 'undefined')
      sql = require('./sql-bricks.js')();
    else
      sql = window.SqlBricks();
  }
  
  var Select = sql.select;

  // TODO: shouldn't LIMIT/OFFSET use handleValue()? Otherwise isn't it vulnerable to SQL Injection?
  Select.prototype.limit = function(val) {
    this._limit = val;
    return this;
  };
  Select.prototype.offset = function(val) {
    this._offset = val;
    return this;
  };

  Select.defineClause(
    'limit',
    '{{#ifNotNull _limit}}LIMIT {{_limit}}{{/ifNotNull}}',
    {after: 'orderBy'}
  );

  Select.defineClause(
    'offset',
    '{{#ifNotNull _offset}}OFFSET {{_offset}}{{/ifNotNull}}',
    {after: 'limit'}
  );

  return sql;
}

if (typeof exports != 'undefined')
  module.exports = LimitOffsetBricks;
