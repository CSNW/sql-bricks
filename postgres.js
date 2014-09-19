// Postgres extension for SQLBricks
function PostgresBricks(sql) {
  // default namespace for node & browser
  if (!sql) {
    if (typeof exports != 'undefined')
      sql = require('./limit-offset.js')();
    else
      sql = window.LimitOffsetBricks();
  }

  var Insert = sql.insert;
  var Update = sql.update;
  var Delete = sql.delete;

  Insert.prototype.returning = 
    Update.prototype.returning = 
    Delete.prototype.returning = function() {
      return this._addListArgs(arguments, '_returning');
    };
  
  Delete.prototype.using = function() {
    return this._addListArgs(arguments, '_using');
  };

  var returning_tmpl = '{{#if _returning}}RETURNING {{columns _returning}}{{/if}}';
  Insert.defineClause('returning', returning_tmpl, {after: 'values'});
  Update.defineClause('returning', returning_tmpl, {after: 'where'});
  Delete.defineClause('returning', returning_tmpl, {after: 'where'});
  
  Delete.defineClause('using', '{{#if _using}}USING {{tables _using}}{{/if}}', {after: 'delete'});

  return sql;
}

if (typeof exports != 'undefined')
  module.exports = PostgresBricks;
