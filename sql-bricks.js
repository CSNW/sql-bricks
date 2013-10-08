var _ = require('underscore');
var util = require('util');

// sql() wrapper to enable SQL (such as a column name) where a value is expected
function sql(str) {
  if (!(this instanceof sql))
    return new sql(str);
  this.str = str;
}
sql.prototype.toString = function toString() {
  return this.str;
};

sql.views = {};

sql.select = function select() {
  var stmt = new Statement('select');
  return stmt.select.apply(stmt, arguments);
};

sql.update = sql.update = function update(tbl, values) {
  var stmt = new Statement('update');
  stmt.tbls = [expandAlias(tbl)];
  if (values)
    stmt.values(values);
  return stmt;
};

sql.insert = sql.insertInto = function insertInto(tbl, values) {
  var stmt = new Statement('insert');
  stmt.tbls = [expandAlias(tbl)];
  if (values) {
    if (typeof values == 'object' && !_.isArray(values)) {
      stmt.values(values);
    }
    else {
      stmt._split_keys_vals_mode = true;
      stmt._values = {};
      var val_arr = argsToArray(_.toArray(arguments).slice(1));
      val_arr.forEach(function(key) {
        stmt._values[quoteReserved(key)] = null;
      });
    }
  }
  return stmt;
};

sql.delete = function del(tbl) {
  var stmt = new Statement('delete');
  if (tbl)
    stmt.tbls = [expandAlias(tbl)];
  return stmt;
};


// all the statements share a single class to enable
// cloning a statement and changing its type
// this is useful if you want to re-use the same joins on an update and a select
function Statement(type) {
  this.type = type;
};
sql.Statement = Statement;

// SELECT
var proto = Statement.prototype;
proto.select = function select() {
  return this.addColumnArgs(arguments, 'cols');
};

proto.from = function from() {
  var tbls = argsToArray(arguments).map(expandAlias);
  return this.add(tbls, 'tbls');
};

proto.join = proto.innerJoin = function join() {
  if (!this.joins)
    this.joins = [];

  if (typeof arguments[1] == 'object') {
    var tbls = [arguments[0]];
    var on = arguments[1];
    var opts = arguments[2];
  }
  else {
    tbls = argsToArray(arguments);
  }

  tbls.forEach(function(tbl) {
    tbl = expandAlias(tbl);
    var left_tbl = this.last_join || (this.tbls && this.tbls[this.tbls.length - 1]);
    var ctor = getTable(tbl) in sql.views ? ViewJoin : Join;
    this.joins.push(new ctor(tbl, left_tbl, on));
  }.bind(this));

  this.last_join = tbls[tbls.length - 1];
  return this;
};

proto.on = function on() {
  var last_join = this.joins[this.joins.length - 1];
  if (!last_join.on)
    last_join.on = {};
  _.extend(last_join.on, argsToObject(arguments));
  return this;
};

// .where(key, value) / .where({...}) / .where(expr)
proto.and = proto.where = function where() {
  return this.addExpression(arguments, '_where');
};

proto.having = function having() {
  return this.addExpression(arguments, '_having');
}

proto.order = proto.orderBy = function orderBy(cols) {
  return this.addColumnArgs(arguments, 'order_by');
};

proto.group = proto.groupBy = function groupBy(cols) {
  return this.addColumnArgs(arguments, 'group_by');
};

proto.limit = function limit(count) {
  this._limit = count;
  return this;
};

proto.offset = function offset(count) {
  this._offset = count;
  return this;
};

// INSERT & UPDATE
proto.values = function values() {
  if (this._split_keys_vals_mode) {
    var args = arguments;
    Object.keys(this._values).forEach(function(key, ix) {
      this._values[key] = args[ix];
    }.bind(this));
  }
  else {
    this.addToObj(quoteReservedKeys(argsToObject(arguments)), '_values');
  }
  return this;
};

// UPDATE
proto.set = function set() {
  var values = quoteReservedKeys(argsToObject(arguments));
  return this.addToObj(values, '_values');
};

// DELETE
proto.using = function using() {
  return this.add(argsToArray(arguments).map(expandAlias), '_using');
};


// GENERIC
proto.clone = function clone() {
  var stmt = _.extend(new Statement(), this);
  if (stmt._where)
    stmt._where = stmt._where.clone();
  if (stmt.joins)
    stmt.joins = stmt.joins.slice();
  if (stmt._values)
    stmt._values = _.clone(stmt._values);
  return stmt;
};

proto.toParams = function toParams() {
  var opts = {'parameterized': true, 'values': [], 'value_ix': 1};
  var sql = this.toString(opts);
  return {'text': sql, 'values': opts.values};
};

proto.toString = function toString(opts) {
  var sql;
  if (!opts) opts = {};
  
  switch(this.type) {
    case 'select':
      sql = this.selectToString(opts);
      break;
    case 'update':
      sql = this.updateToString(opts);
      break;
    case 'insert':
      sql = this.insertToString(opts);
      break;
    case 'delete':
      sql = this.deleteToString(opts);
      break;
    default:
      throw new Error('Unknown statement type: "' + this.type + '"');
  }

  return sql.trim();
};

proto.selectToString = function selectToString(opts) {
  var cols = this.cols.length ? this.cols : ['*'];
  var result = 'SELECT ' + cols.join(', ') + ' FROM ' + this.tbls.join(', ') + ' ';
  if (this.joins)
    result += this.joins.join(' ') + ' ';

  if (this._where)
    result += this.whereToString(opts);

  var view_joins = this.viewJoins();
  if (view_joins.length) {
    var view_wheres = _.compact(_.pluck(_.pluck(view_joins, 'view'), '_where'));
    view_wheres.forEach(function(view_where, ix) {
      view_where.parens = false;
      if (!this._where && ix == 0)
        result += 'WHERE ';
      else
        result += 'AND ';
      result += view_where.toString(opts) + ' ';
    }.bind(this));
  }

  if (this.group_by)
    result += 'GROUP BY ' + this.group_by.join(', ') + ' ';

  if (this._having)
    result += 'HAVING ' + this.whereToString(opts, this._having);

  if (this.order_by)
    result += 'ORDER BY ' + this.order_by.join(', ') + ' ';

  if (this._limit != null)
    result += 'LIMIT ' + this._limit + ' ';

  if (this._offset != null)
    result += 'OFFSET ' + this._offset + ' ';

  return result;
};

proto.updateToString = function updateToString(opts) {
  var sql = 'UPDATE ' + this.tbls.join(', ') + ' SET ';
  sql += _.map(this._values, function(value, key) {
    return key + ' = ' + quoteValue(value, opts);
  }).join(', ') + ' ';

  if (this._where)
    sql += this.whereToString(opts);
  return sql;
};

proto.insertToString = function insertToString(opts) {
  var keys = Object.keys(this._values).join(', ');
  var values = _.values(this._values).map(function(val) {
    return quoteValue(val, opts);
  }).join(', ');
  return 'INSERT INTO ' + this.tbls.join(', ') + ' (' + keys + ') VALUES (' + values + ')';
};

proto.deleteToString = function deleteToString(opts) {
  var sql = 'DELETE FROM ' + this.tbls[0] + ' ';
  if (this._using)
    sql += 'USING ' + this._using.join(', ') + ' ';
  if (this._where)
    sql += this.whereToString(opts);
  return sql;
};

proto.whereToString = function whereToString(opts, expr) {
  if (!expr)
    expr = this._where;
  expr.parens = false;
  if (expr.expressions && expr.expressions.length == 1)
    expr.expressions[0].parens = false;
  return 'WHERE ' + expr.toString(opts) + ' ';
};

proto.add = function add(arr, name) {
  if (!this[name])
    this[name] = [];
  
  this[name] = this[name].concat(arr);
  return this;
};

proto.addToObj = function addToObj(obj, name) {
  if (!this[name])
    this[name] = {};

  _.extend(this[name], obj);
  return this;
};

proto.addColumnArgs = function addColumnArgs(args, name) {
  var args = argsToArray(args).map(quoteReserved);
  return this.add(args, name);
};

proto.addExpression = function addExpression(args, name) {
  if (!this[name])
    this[name] = sql.and();
  var exprs = argsToExpressions(args);
  this[name].expressions = this[name].expressions.concat(exprs);
  return this;
};

proto.viewJoins = function viewJoins() {
  return (this.joins || []).filter(function(join) {
    return join instanceof ViewJoin;
  });
};


function Join(tbl, left_tbl, on) {
  this.tbl = tbl;
  this.left_tbl = left_tbl;
  this.on = on;
}
sql.Join = Join;
Join.prototype.autoGenerateOn = function autoGenerateOn(tbl, left_tbl) {
  return sql.joinCriteria(getTable(left_tbl), getAlias(left_tbl), getTable(tbl), getAlias(tbl));
};
Join.prototype.toString = function toString() {
  var on = this.on, tbl = this.tbl, left_tbl = this.left_tbl;
  if (!on || _.isEmpty(on)) {
    if (sql.joinCriteria)
      on = this.autoGenerateOn(tbl, left_tbl);
    else
      throw new Error('No join criteria supplied for "' + getAlias(tbl) + '" join');
  }
  on = quoteReservedObj(on);
  return 'INNER JOIN ' + tbl + ' ON ' + Object.keys(on).map(function(key) {
    return key + ' = ' + on[key];
  }).join(', ');
};

function ViewJoin(view, left_tbl, on) {
  var alias = getAlias(view);
  var view_name = getTable(view);
  this.view = sql.views[view_name].clone();

  if (this.view.tbls.length != 1)
    throw new Error('Unsupported number of tables in pseudo-view: ' + this.view.tbl.length);
  
  var tbl = getTable(this.view.tbls[0]) + ' ' + alias;
  ViewJoin.super_.call(this, tbl, left_tbl, on);

  var new_aliases = {};
  new_aliases[getAlias(this.view.tbls[0])] = alias;

  if (this.view.joins) {
    _.pluck(this.view.joins, 'tbl').map(getAlias).forEach(function(join_alias) {
      new_aliases[join_alias] = alias + '_' + join_alias;
    });

    var parent = this;
    this.view.joins = this.view.joins.map(function(join) {
      join = new Join(join.tbl, join.left_tbl, join.on);
      join.autoGenerateOn = _.wrap(join.autoGenerateOn, function(orig_fn) {
        var on = orig_fn.apply(this, _.toArray(arguments).slice(1));
        return parent.namespaceOn(on);
      });
      return join;
    });
  }

  this.new_aliases = new_aliases;
  this.addNamespace();
}

util.inherits(ViewJoin, Join);
sql.ViewJoin = ViewJoin;

ViewJoin.prototype.addNamespace = function addNamespace() {
  var new_aliases = this.new_aliases;
  if (this.view.joins) {
    this.view.joins.forEach(function(join) {
      var join_alias = getAlias(join.tbl);
      var join_tbl = getTable(join.tbl);
      if (join.on)
        join.on = this.namespaceOn(join.on);
      join.tbl = join_tbl + ' ' + new_aliases[join_alias]
    }.bind(this));
  }

  if (this.view._where)
    this.convertExpr(this.view._where);
};

ViewJoin.prototype.convertExpr = function convertExpr(expr) {
  if (expr.col)
    expr.col = this.convert(expr.col);
  if (expr.expressions)
    expr.expressions.forEach(this.convertExpr.bind(this));
};

ViewJoin.prototype.namespaceOn = function namespaceOn(on) {
  var namespaced_on = {};
  for (var key in on)
    namespaced_on[this.convert(key)] = this.convert(on[key]);
  return namespaced_on;
};

ViewJoin.prototype.convert = function convert(col) {
  var col_parts = col.split('.');
  if (col_parts.length == 1)
    return col;
  
  var tbl_ix = col_parts.length - 2;
  var tbl_alias = col_parts[tbl_ix];
  if (tbl_alias in this.new_aliases) {
    col_parts[tbl_ix] = this.new_aliases[tbl_alias];
    return col_parts.join('.');
  }
  else {
    return col;
  }
};

ViewJoin.prototype.autoGenerateOn = function autoGenerateOn() {
  var on = ViewJoin.super_.prototype.autoGenerateOn.apply(this, arguments);
  return this.namespaceOn(on);
};

ViewJoin.prototype.toString = function toString() {
  var sql = ViewJoin.super_.prototype.toString.call(this);
  if (this.view.joins)
    sql += ' '  + this.view.joins.join(' ');
  return sql;
};


// handle an array, a comma-delimited str or separate args
function argsToArray(args) {
  if (Array.isArray(args[0]))
    return args[0];
  else if (typeof args[0] == 'string' && args[0].indexOf(',') > -1)
    return _.invoke(args[0].split(','), 'trim');
  else
    return _.toArray(args);
}

function argsToObject(args) {
  if (typeof args[0] == 'object')
    return args[0];
  
  var obj = {};
  obj[args[0]] = args[1];
  return obj;
}

function argsToExpressions(args) {
  if (typeof args[0] != 'object' && (typeof args[1] != 'object' || args[1] instanceof sql)) {
    return [sql.equal(args[0], args[1])];
  }
  else {
    var exprs = [];
    _.each(args, function(expr) {
      if (isExpr(expr))
        exprs.push(expr);
      else
        exprs = exprs.concat(objToEquals(expr));
    });
    return exprs;
  }
}

sql._aliases = {};
sql.aliasExpansions = function aliasExpansions(aliases) {
  sql._aliases = aliases;
}
function expandAlias(tbl) {
  return tbl in sql._aliases ? sql._aliases[tbl] + ' ' + tbl : tbl;
}

sql.defineView = function defineView(view_name, tbl) {
  return sql.views[view_name] = new Statement('select').from(tbl);
};

// SQL Expression language

sql.and = function and() { return new Group('AND', _.toArray(arguments)); };
sql.or = function or() { return new Group('OR', _.toArray(arguments)); };

function Group(op, expressions) {
  this.op = op;
  this.expressions = [];
  expressions.forEach(function(expr) {
    if (isExpr(expr))
      this.expressions.push(expr);
    else
      this.expressions = this.expressions.concat(objToEquals(expr));
  }.bind(this));
}
Group.prototype.clone = function clone() {
  return new Group(this.op, _.invoke(this.expressions, 'clone'));
};
Group.prototype.toString = function toString(opts) {
  var sql = this.expressions.map(function(expr) {
    return expr.toString(opts);
  }).join(' ' + this.op + ' ');
  if (this.expressions.length > 1 && this.parens !== false)
    sql = '(' + sql + ')';
  return sql;
};

sql.not = function not(expr) {
  return new Not(expr);
};
function Not(expr) {
  if (!isExpr(expr))
    this.expressions = [sql.and(expr)];
  else
    this.expressions = [expr];
}
Not.prototype.clone = function clone() {
  return new Not(this.expressions[0].clone());
};
Not.prototype.toString = function toString(opts) {
  return 'NOT ' + this.expressions[0].toString(opts);
};

sql.like = function like(col, val) { return new Binary('LIKE', col, val); };
sql.eq = sql.equal = function equal(col, val) { return new Binary('=', col, val); };
sql.lt = function lt(col, val) { return new Binary('<', col, val); };
sql.lte = function lte(col, val) { return new Binary('<=', col, val); };
sql.gt = function gt(col, val) { return new Binary('>', col, val); };
sql.gte = function gte(col, val) { return new Binary('>=', col, val); };

function Binary(op, col, val) {
  this.op = op;
  this.col = col;
  this.val = val;
}
Binary.prototype.clone = function clone() {
  return new Binary(this.op, this.col, this.val);
};
Binary.prototype.toString = function toString(opts) {
  return quoteReserved(this.col) + ' ' + this.op + ' ' + quoteValue(this.val, opts);
}

sql.isNull = function isNull(col) { return new Unary('IS NULL', col); };
sql.isNotNull = function isNotNull(col) { return new Unary('IS NOT NULL', col); };

function Unary(op, col) {
  this.op = op;
  this.col = col;
}
Unary.prototype.clone = function clone() {
  return new Unary(this.op, this.col);
};
Unary.prototype.toString = function toString(opts) {
  return quoteReserved(this.col) + ' ' + this.op;
};

sql['in'] = function(col, list) { return new In(col, list); };

function In(col, list) {
  this.col = col;
  this.list = list;
}
In.prototype.clone = function clone() {
  return new In(this.col, this.list.slice());
};
In.prototype.toString = function toString(opts) {
  return quoteReserved(this.col) + ' IN (' + this.list.map(function(val) {
    return quoteValue(val, opts);
  }).join(', ') + ')';
};


function getAlias(tbl) {
  var separator = ' AS ';
  var sep_ix = tbl.indexOf(separator);
  if (sep_ix == -1) {
    separator = ' ';
    sep_ix = tbl.indexOf(separator);
  }
  if (sep_ix > -1)
    return tbl.slice(sep_ix + separator.length);
  return tbl;
}
function getTable(tbl) {
  var space_ix = tbl.indexOf(' ');
  if (space_ix > -1)
    return tbl.slice(0, space_ix);
  return tbl;
}

function isExpr(expr) {
  return expr instanceof Group || expr instanceof Not || expr instanceof Binary || expr instanceof Unary || expr instanceof In;
}

// raw objects default to equals
// {first_name: 'Fred', last_name = 'Flintstone'} ->
//   [equals('first_name', 'Fred'), equals('last_name', 'Flintstone')]
function objToEquals(obj) {
  var expressions = [];
  for (var col in obj) {
    expressions.push(sql.equal(col, obj[col]));
  }
  return expressions;
}

// quoteValue() must be called as the SQL is constructed
// in the exact order it is constructed
function quoteValue(val, opts) {
  if (val instanceof sql)
    return val.toString();

  if (opts.parameterized) {
    opts.values.push(val);
    return '$' + opts.value_ix++;
  }
  else {
    return (typeof val == 'string') ? "'" + val.replace(/'/g, "''") + "'" : val;
  }
}

// PostgreSQL reserved words from Table C-1 of http://www.postgresql.org/docs/9.3/static/sql-keywords-appendix.html
var reserved = ['all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric', 'authorization', 'both', 'case', 'cast', 'check', 'collate', 'collation', 'column', 'constraint', 'create', 'cross', 'current_catalog', 'current_date', 'current_role', 'current_time', 'current_timestamp', 'current_user', 'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant', 'group', 'having', 'ilike', 'in', 'initially', 'inner', 'intersect', 'into', 'is', 'isnull', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime', 'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only', 'or', 'order', 'outer', 'over', 'overlaps', 'placing', 'primary', 'references', 'returning', 'right', 'select', 'session_user', 'similar', 'some', 'symmetric', 'table', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose', 'when', 'where', 'window', 'with', ]
reserved = _.object(reserved, reserved);

function quoteReservedObj(obj) {
  obj = quoteReservedKeys(obj);
  for (var col in obj)
    obj[col] = quoteReserved(obj[col]);
  return obj;
}

function quoteReservedKeys(obj) {
  var quoted_obj = {};
  for (var col in obj)
    quoted_obj[quoteReserved(col)] = obj[col];
  return quoted_obj;
}

// handles prefixes before a '.' and suffixes after a ' '
// for example: 'tbl.order AS tbl_order' -> 'tbl."order" AS tbl_order'
function quoteReserved(expr) {
  var prefix = '';
  var dot_ix = expr.lastIndexOf('.');
  if (dot_ix > -1) {
    prefix = expr.slice(0, dot_ix + 1);
    expr = expr.slice(dot_ix + 1);
  }

  var suffix = '';
  var space_ix = expr.indexOf(' ');
  if (space_ix > -1) {
    suffix = expr.slice(space_ix);
    expr = expr.slice(0, space_ix);
  }

  if (expr.toLowerCase() in reserved)
    expr = '"' + expr + '"';
  
  return prefix + expr + suffix;
}

module.exports = sql;
