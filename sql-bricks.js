(function() {

var global = this;
var _ = global._ || require('underscore');

// sql() wrapper to enable SQL (such as a column name) where a value is expected
function sql(str) {
  if (!(this instanceof sql))
    return new sql(str);
  this.str = str;
}
sql.prototype.toString = function toString() {
  return this.str;
};
sql.val = val;
function val(_val) {
  if (!(this instanceof val))
    return new val(_val);
  this.val = _val;
}

sql.select = inherits(Select, Statement);
function Select() {
  if (!(this instanceof Select))
    return new Select(argsToArray(arguments));
  
  Select.super_.call(this, 'select');
  return this.select.apply(this, arguments);
}
Select.prototype.select = function select() {
  return this._addListArgs(arguments, 'cols');
};
Select.prototype.into = Select.prototype.intoTable = function into(tbl) {
  this._into = tbl;
  return this;
};
Select.prototype.intoTemp = Select.prototype.intoTempTable = function intoTemp(tbl) {
  this._into_temp = true;
  return this.into(tbl);
};

Select.prototype.distinct = function distinct() {
  this._distinct = true;
  return this._addListArgs(arguments, 'cols');
};

Select.prototype.from = function from() {
  var tbls = _.map(argsToArray(arguments), expandAlias);
  return this._add(tbls, 'tbls');
};
Select.prototype.join = Select.prototype.innerJoin = function join() {
  return this._addJoins(arguments, 'INNER');
};
Select.prototype.leftJoin = Select.prototype.leftOuterJoin = function join() {
  return this._addJoins(arguments, 'LEFT');
};
Select.prototype.rightJoin = Select.prototype.rightOuterJoin = function join() {
  return this._addJoins(arguments, 'RIGHT');
};
Select.prototype.fullJoin = Select.prototype.fullOuterJoin = function join() {
  return this._addJoins(arguments, 'FULL');
};
Select.prototype.crossJoin = function join() {
  return this._addJoins(arguments, 'CROSS');
};
Select.prototype.on = function on() {
  var last_join = this.joins[this.joins.length - 1];
  if (!last_join.on)
    last_join.on = {};
  _.extend(last_join.on, argsToObject(arguments));
  return this;
};

Select.prototype.where = Select.prototype.and = function where() {
  return this._addExpression(arguments, '_where');
};

Select.prototype.group = Select.prototype.groupBy = function groupBy(cols) {
  return this._addListArgs(arguments, 'group_by');
};

Select.prototype.having = function having() {
  return this._addExpression(arguments, '_having');
}

Select.prototype.order = Select.prototype.orderBy = function orderBy(cols) {
  return this._addListArgs(arguments, 'order_by');
};

Select.prototype.limit = function limit(count) {
  this._limit = count;
  return this;
};
Select.prototype.offset = function offset(count) {
  this._offset = count;
  return this;
};

var compounds = {
  'union': 'UNION', 'unionAll': 'UNION ALL',
  'intersect': 'INTERSECT', 'intersectAll': 'INTERSECT ALL',
  'minus': 'MINUS', 'minusAll': 'MINUS ALL',
  'except': 'EXCEPT', 'exceptAll': 'EXCEPT ALL'
};
_.forEach(compounds, function(value, key) {
  Select.prototype[key] = function() {
    var stmts = argsToArray(arguments);
    if (!stmts.length) {
      var stmt = new Select();
      stmt.prev_stmt = this;
      stmts = [stmt];
    }

    this._add(stmts, '_' + key);
    
    if (stmt)
      return stmt;
    else
      return this;
  };
});

Select.prototype.forUpdate = Select.prototype.forUpdateOf = function forUpdate() {
  this.for_update = true;
  this._addListArgs(arguments, 'for_update_tbls');
  return this;
};
Select.prototype.noWait = function noWait() {
  this.no_wait = true;
  return this;
};
Select.prototype._toString = function _toString(opts) {
  var cols = this.cols.length ? this.cols : ['*'];
  var result = 'SELECT ';
  if (this._distinct)
    result += 'DISTINCT ';
  result += _.map(cols, handleCol).join(', ') + ' ';
  if (this._into) {
    result += 'INTO ';
    if (this._into_temp)
      result += 'TEMP ';
    result += this._into + ' ';
  }
  if (this.tbls)
    result += 'FROM ' + this.tbls.join(', ') + ' ';
  if (this.joins) {
    result += _.map(this.joins, function(join) {
      return join.toString(opts);
    }).join(' ') + ' ';
  }

  if (this._where)
    result += 'WHERE ' + this._exprToString(opts);

  if (this.group_by)
    result += 'GROUP BY ' + _.map(this.group_by, handleCol).join(', ') + ' ';

  if (this._having)
    result += 'HAVING ' + this._exprToString(opts, this._having);

  if (this.order_by)
    result += 'ORDER BY ' + _.map(this.order_by, handleCol).join(', ') + ' ';

  if (this._limit != null)
    result += 'LIMIT ' + this._limit + ' ';

  if (this._offset != null)
    result += 'OFFSET ' + this._offset + ' ';

  _.forEach(compounds, function(value, key) {
    var arr = this['_' + key];
    if (arr) {
      result += value + ' ';
      result += arr.map(function(stmt) {
        return stmt._toString(opts);
      }).join(' ' + value + ' ');
    }
  }.bind(this));

  if (this.for_update) {
    result += 'FOR UPDATE ';
    if (this.for_update_tbls)
      result += this.for_update_tbls.join(', ') + ' ';
    if (this.no_wait)
      result += 'NO WAIT ';
  }
  return result.trim();

  function handleCol(expr) {
    return handleColumn(expr, opts);
  }
};


sql.insert = sql.insertInto = inherits(Insert, Statement);
function Insert(tbl, values) {
  if (!(this instanceof Insert)) {
    if (typeof values == 'object' && !_.isArray(values))
      return new Insert(tbl, values);
    else
      return new Insert(tbl, argsToArray(_.toArray(arguments).slice(1)));
  }

  Insert.super_.call(this, 'insert');
  return this.into.apply(this, arguments);
};
Insert.prototype.orReplace = function orReplace() { this._or = 'REPLACE'; return this; };
Insert.prototype.orRollback = function orRollback() { this._or = 'ROLLBACK'; return this; };
Insert.prototype.orAbort = function orAbort() { this._or = 'ABORT'; return this; };
Insert.prototype.orFail = function orFail() { this._or = 'FAIL'; return this; };
Insert.prototype.orIgnore = function orIgnore() { this._or = 'IGNORE'; return this; };
Insert.prototype.into = function into(tbl, values) {
  if (tbl)
    this.tbls = [expandAlias(tbl)];

  if (values) {
    if (typeof values == 'object' && !_.isArray(values)) {
      this.values(values);
    }
    else if (values.length) {
      this._split_keys_vals_mode = true;
      this._values = {};
      var val_arr = argsToArray(_.toArray(arguments).slice(1));
      _.forEach(val_arr, function(key) {
        this._values[key] = null;
      }.bind(this));
    }
  }
  return this;
};
Insert.prototype.values = function values() {
  if (this._split_keys_vals_mode) {
    var args = arguments;
    _.forEach(_.keys(this._values), function(key, ix) {
      this._values[key] = args[ix];
    }.bind(this));
  }
  else {
    this._addToObj(argsToObject(arguments), '_values');
  }
  return this;
};
Insert.prototype.select = function select() {
  this._select = sql.select.apply(null, arguments);
  this._select.prev_stmt = this;
  return this._select;
};
Insert.prototype.returning = function returning() {
  this._addListArgs(arguments, '_returning');
  return this;
};
Insert.prototype._toString = function _toString(opts) {
  var keys = _.map(_.keys(this._values), function(col) {
    return handleColumn(col, opts);
  }).join(', ');
  var values = _.map(_.values(this._values), function(val) {
    return handleValue(val, opts);
  }).join(', ');
  var sql = 'INSERT ';
  if (this._or)
    sql += 'OR ' + this._or + ' '; 
  sql += 'INTO ' + this.tbls.join(', ') + ' (' + keys + ') ';

  if (this._select)
    sql += this._select._toString(opts) + ' ';
  else
    sql += 'VALUES (' + values + ')';

  if (this._returning) {
    sql += 'RETURNING ' + _.map(this._returning, function(col) {
      return handleColumn(col, opts);
    }).join(', ');
  }

  return sql.trim();
};


sql.update = inherits(Update, Statement);
function Update(tbl, values) {
  if (!(this instanceof Update))
    return new Update(tbl, argsToObject(_.toArray(arguments).slice(1)));

  Update.super_.call(this, 'update');
  this.tbls = [expandAlias(tbl)];
  if (values)
    this.values(values);
  return this;
};
Update.prototype.orReplace = Insert.prototype.orReplace;
Update.prototype.orRollback = Insert.prototype.orRollback;
Update.prototype.orAbort = Insert.prototype.orAbort;
Update.prototype.orFail = Insert.prototype.orFail;
Update.prototype.orIgnore = Insert.prototype.orIgnore;
Update.prototype.set = Update.prototype.values = function set() {
  return this._addToObj(argsToObject(arguments), '_values');
};
Update.prototype.where = Update.prototype.and = Select.prototype.where;
Update.prototype._toString = function _toString(opts) {
  var sql = 'UPDATE ';
  if (this._or)
    sql += 'OR ' + this._or + ' ';
  sql += this.tbls[0] + ' SET ';
  sql += _.map(this._values, function(value, key) {
    return handleColumn(key, opts) + ' = ' + handleValue(value, opts);
  }).join(', ') + ' ';

  if (this._where)
    sql += 'WHERE ' + this._exprToString(opts);
  return sql.trim();
};


sql.delete = sql.deleteFrom = inherits(Delete, Statement);
function Delete(tbl) {
  if (!(this instanceof Delete))
    return new Delete(tbl);

  Delete.super_.call(this, 'delete');
  if (tbl)
    this.tbls = [expandAlias(tbl)];
  return this;
}
Delete.prototype.from = Select.prototype.from;
Delete.prototype.using = function using() {
  return this._add(_.map(argsToArray(arguments), expandAlias), '_using');
};
Delete.prototype.where = Delete.prototype.and = Select.prototype.where;
Delete.prototype._toString = function _toString(opts) {
  var sql = 'DELETE FROM ' + this.tbls[0] + ' ';
  if (this._using)
    sql += 'USING ' + this._using.join(', ') + ' ';
  if (this._where)
    sql += 'WHERE ' + this._exprToString(opts);
  return sql.trim();
};


sql.Statement = Statement;
function Statement(type) {
  this.type = type;
};

Statement.prototype.clone = function clone() {
  var ctor = _.find([Select, Insert, Update, Delete], function(ctor) {
    return this instanceof ctor;
  }.bind(this));

  var stmt = _.extend(new ctor(), this);
  if (stmt._where)
    stmt._where = stmt._where.clone();
  if (stmt.joins)
    stmt.joins = stmt.joins.slice();
  if (stmt._values)
    stmt._values = _.clone(stmt._values);
  return stmt;
};

Statement.prototype.toParams = function toParams(opts) {
  if (this.prev_stmt)
    return this.prev_stmt.toParams(opts);

  if (!opts)
    opts = {};
  _.extend(opts, {'parameterized': true, 'values': [], 'value_ix': 1});
  var sql = this._toString(opts);
  return {'text': sql, 'values': opts.values};
};

Statement.prototype.toString = function toString() {
  if (this.prev_stmt)
    return this.prev_stmt.toString();
  else
    return this._toString({}).trim();
};


Statement.prototype._exprToString = function _exprToString(opts, expr) {
  if (!expr)
    expr = this._where;
  expr.parens = false;
  if (expr.expressions && expr.expressions.length == 1)
    expr.expressions[0].parens = false;
  return expr.toString(opts) + ' ';
};

Statement.prototype._add = function _add(arr, name) {
  if (!this[name])
    this[name] = [];
  
  this[name] = this[name].concat(arr);
  return this;
};

Statement.prototype._addToObj = function _addToObj(obj, name) {
  if (!this[name])
    this[name] = {};

  _.extend(this[name], obj);
  return this;
};

Statement.prototype._addListArgs = function _addListArgs(args, name) {
  return this._add(argsToArray(args), name);
};

Statement.prototype._addExpression = function _addExpression(args, name) {
  if (!this[name])
    this[name] = sql.and();
  var exprs = argsToExpressions(args);
  this[name].expressions = this[name].expressions.concat(exprs);
  return this;
};

Statement.prototype._addJoins = function _addJoins(args, type) {
  if (!this.joins)
    this.joins = [];

  if (typeof args[1] == 'object') {
    var tbls = [args[0]];
    var on = args[1];
    var opts = args[2];
  }
  else {
    tbls = argsToArray(args);
  }

  _.forEach(tbls, function(tbl) {
    tbl = expandAlias(tbl);
    var left_tbl = this.last_join || (this.tbls && this.tbls[this.tbls.length - 1]);
    this.joins.push(new Join(tbl, left_tbl, on, type));
  }.bind(this));

  this.last_join = tbls[tbls.length - 1];
  return this;
};


function Join(tbl, left_tbl, on, type) {
  this.tbl = tbl;
  this.left_tbl = left_tbl;
  this.on = on;
  this.type = type;
}
sql.Join = Join;
Join.prototype.autoGenerateOn = function autoGenerateOn(tbl, left_tbl) {
  return sql._joinCriteria(getTable(left_tbl), getAlias(left_tbl), getTable(tbl), getAlias(tbl));
};
Join.prototype.toString = function toString(opts) {
  var on = this.on, tbl = this.tbl, left_tbl = this.left_tbl;
  if (!on || _.isEmpty(on)) {
    if (sql._joinCriteria)
      on = this.autoGenerateOn(tbl, left_tbl);
    else
      throw new Error('No join criteria supplied for "' + getAlias(tbl) + '" join');
  }
  return this.type + ' JOIN ' + tbl + ' ON ' + _.map(_.keys(on), function(key) {
    return handleColumn(key, opts) + ' = ' + handleColumn(on[key], opts);
  }).join(' AND ');
};


// handle an array, a comma-delimited str or separate args
function argsToArray(args) {
  if (_.isArray(args[0]))
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
  if (args[0] != null)
    obj[args[0]] = args[1];
  return obj;
}

function argsToExpressions(args) {
  var flat_args = _.all(args, function(arg) {
    return typeof arg != 'object' || arg instanceof val || arg instanceof sql;
  });
  if (flat_args) {
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

// SQL Expression language

sql.and = function and() { return new Group('AND', _.toArray(arguments)); };
sql.or = function or() { return new Group('OR', _.toArray(arguments)); };

function Group(op, expressions) {
  this.op = op;
  this.expressions = [];
  _.forEach(expressions, function(expr) {
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
  var sql = _.map(this.expressions, function(expr) {
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

var binary_ops = {
  'eq': '=',
  'equal': '=',
  'notEq': '<>',
  'lt': '<',
  'lte': '<=',
  'gt': '>',
  'gte': '>='
};
var quantifiers = ['All', 'Any'];

for (var name in binary_ops) {
  sql[name] = function(name, col, val) {
    return new Binary(binary_ops[name], col, val);
  }.bind(null, name);

  _.forEach(quantifiers, function(name, quantifier) {
    sql[name + quantifier] = function(col, val) {
      return new Binary(binary_ops[name], col, val, quantifier.toUpperCase() + ' ');
    };
  }.bind(null, name));
  sql[name + 'Some'] = sql[name + 'Any'];
}

function Binary(op, col, val, quantifier) {
  this.op = op;
  this.col = col;
  this.val = val;
  this.quantifier = quantifier || '';
}
Binary.prototype.clone = function clone() {
  return new Binary(this.op, this.col, this.val);
};
Binary.prototype.toString = function toString(opts) {
  var sql = handleColumn(this.col, opts);
  return sql + ' ' + this.op + ' ' + this.quantifier + handleValue(this.val, opts);
}

sql.like = function like(col, val, escape_char) { return new Like(col, val, escape_char); };
function Like(col, val, escape_char) {
  this.col = col;
  this.val = val;
  this.escape_char = escape_char;
}
Like.prototype.clone = function clone() {
  return new Like(this.col, this.val, this.escape_char);
};
Like.prototype.toString = function toString(opts) {
  var sql = handleColumn(this.col, opts) + ' LIKE ' + handleValue(this.val, opts);
  if (this.escape_char)
    sql += " ESCAPE '" + this.escape_char + "'";
  return sql;
}

sql.between = function between(col, val1, val2) { return new Between(col, val1, val2); };
function Between(col, val1, val2) {
  this.col = col;
  this.val1 = val1;
  this.val2 = val2;
}
Between.prototype.clone = function clone() {
  return new Between(this.col, this.val1, this.val2);
};
Between.prototype.toString = function(opts) {
  return handleColumn(this.col, opts) + ' BETWEEN ' + handleValue(this.val1, opts) + ' AND ' + handleValue(this.val2, opts);
};

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
  return handleColumn(this.col, opts) + ' ' + this.op;
};

sql['in'] = function(col, list) {
  if (_.isArray(list) || list instanceof Statement)
    return new In(col, list);
  else
    return new In(col, _.toArray(arguments).slice(1));  
};

function In(col, list) {
  this.col = col;
  this.list = list;
}
In.prototype.clone = function clone() {
  return new In(this.col, this.list.slice());
};
In.prototype.toString = function toString(opts) {
  var sql;
  if (_.isArray(this.list)) {
    sql = _.map(this.list, function(val) {
      return handleValue(val, opts);
    }).join(', ');
  }
  else if (this.list instanceof Statement) {
    sql = this.list._toString(opts);
  }
  return handleColumn(this.col, opts) + ' IN (' + sql + ')';
};

sql.exists = function(subquery) { return new Exists(subquery); }
function Exists(subquery) {
  this.subquery = subquery;
};
Exists.prototype.clone = function clone() {
  return new Exists(this.subquery.clone());
};
Exists.prototype.toString = function toString(opts) {
  return 'EXISTS (' + this.subquery._toString(opts) + ')';
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
  return expr instanceof Group || expr instanceof Not || expr instanceof Binary || expr instanceof Unary || expr instanceof In || expr instanceof Like || expr instanceof Between || expr instanceof Exists;
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

function handleValue(val, opts) {
  if (val instanceof Statement)
    return '(' + val._toString(opts) + ')';

  if (val instanceof sql)
    return val.toString();

  if (opts.parameterized) {
    opts.values.push(val);
    var prefix = opts.placeholder || '$';
    return prefix + opts.value_ix++;
  }
  else {
    return (typeof val == 'string') ? "'" + val.replace(/'/g, "''") + "'" : val;
  }
}

// Table C-1 of http://www.postgresql.org/docs/9.3/static/sql-keywords-appendix.html
var pg_reserved = ['all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric', 'authorization', 'both', 'case', 'cast', 'check', 'collate', 'collation', 'column', 'constraint', 'create', 'cross', 'current_catalog', 'current_date', 'current_role', 'current_time', 'current_timestamp', 'current_user', 'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant', 'group', 'having', 'ilike', 'in', 'initially', 'inner', 'intersect', 'into', 'is', 'isnull', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime', 'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only', 'or', 'order', 'outer', 'over', 'overlaps', 'placing', 'primary', 'references', 'returning', 'right', 'select', 'session_user', 'similar', 'some', 'symmetric', 'table', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose', 'when', 'where', 'window', 'with'];
// list in http://www.sqlite.org/lang_keywords.html
var sqlite_keywords = ['abort', 'action', 'add', 'after', 'all', 'alter', 'analyze', 'and', 'as', 'asc', 'attach', 'autoincrement', 'before', 'begin', 'between', 'by', 'cascade', 'case', 'cast', 'check', 'collate', 'column', 'commit', 'conflict', 'constraint', 'create', 'cross', 'current_date', 'current_time', 'current_timestamp', 'database', 'default', 'deferrable', 'deferred', 'delete', 'desc', 'detach', 'distinct', 'drop', 'each', 'else', 'end', 'escape', 'except', 'exclusive', 'exists', 'explain', 'fail', 'for', 'foreign', 'from', 'full', 'glob', 'group', 'having', 'if', 'ignore', 'immediate', 'in', 'index', 'indexed', 'initially', 'inner', 'insert', 'instead', 'intersect', 'into', 'is', 'isnull', 'join', 'key', 'left', 'like', 'limit', 'match', 'natural', 'no', 'not', 'notnull', 'null', 'of', 'offset', 'on', 'or', 'order', 'outer', 'plan', 'pragma', 'primary', 'query', 'raise', 'references', 'regexp', 'reindex', 'release', 'rename', 'replace', 'restrict', 'right', 'rollback', 'row', 'savepoint', 'select', 'set', 'table', 'temp', 'temporary', 'then', 'to', 'transaction', 'trigger', 'union', 'unique', 'update', 'using', 'vacuum', 'values', 'view', 'virtual', 'when', 'where'];
var reserved = _.uniq(pg_reserved.concat(sqlite_keywords));
var reserved = _.object(reserved, reserved);

// handles prefixes before a '.' and suffixes after a ' '
// for example: 'tbl.order AS tbl_order' -> 'tbl."order" AS tbl_order'
function handleColumn(expr, opts) {
  if (expr instanceof Statement)
    return '(' + expr._toString(opts) + ')';
  if (expr instanceof val)
    return handleValue(expr.val, opts);

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

// optional conveniences
sql._aliases = {};
sql.aliasExpansions = function aliasExpansions(aliases) {
  sql._aliases = aliases;
}
function expandAlias(tbl) {
  return tbl in sql._aliases ? sql._aliases[tbl] + ' ' + tbl : tbl;
}

sql.joinCriteria = function joinCriteria(fn) {
  this._joinCriteria = fn;
};

sql._views = {};
sql.addView = function addView(view_name, sel) {
  if (sel.tbls.length != 1)
    throw new Error('Unsupported number of tables in pseudo-view: ' + sel.tbls.length);
  sql._views[view_name] = sel;
};
sql.getView = function getView(view_name) {
  return sql._views[view_name];
};

Select.prototype.joinView = function joinView(view, on, type) {
  var alias = getAlias(view);
  var view_name = getTable(view);
  var view = sql._views[view_name];

  var tbl = getTable(view.tbls[0]) + ' ' + alias;
  this._addJoins([tbl, on || {}], type ? type.toUpperCase() : 'INNER');

  var new_aliases = {};
  new_aliases[getAlias(view.tbls[0])] = alias;

  if (view.joins) {
    _.forEach(_.map(_.pluck(view.joins, 'tbl'), getAlias), function(join_alias) {
      new_aliases[join_alias] = alias + '_' + join_alias;
    });

    _.forEach(view.joins, function(join) {
      var join_alias = getAlias(join.tbl);
      var join_tbl = getTable(join.tbl);
      var tbl = join_tbl + ' ' + new_aliases[join_alias];
      var join = new Join(tbl, join.left_tbl, join.on, join.type);
      this.joins.push(join);
      if (!join.on)
        join.on = join.autoGenerateOn(tbl, join.left_tbl);
      join.on = namespaceOn(join.on);
    }.bind(this));
  }

  if (view._where) {
    _.forEach(view._where.expressions, function(expr) {
      expr = expr.clone();
      convertExpr(expr);
      this.where(expr);
    }.bind(this));
  }

  return this;

  function convertExpr(expr) {
    if (expr.col)
      expr.col = convert(expr.col);
    if (expr.expressions)
      _.forEach(expr.expressions, convertExpr);
  }

  function namespaceOn(on) {
    var namespaced_on = {};
    for (var key in on)
      namespaced_on[convert(key)] = convert(on[key]);
    return namespaced_on;
  }

  function convert(col) {
    var col_parts = col.split('.');
    if (col_parts.length == 1)
      return col;
    
    var tbl_ix = col_parts.length - 2;
    var tbl_alias = col_parts[tbl_ix];
    if (tbl_alias in new_aliases) {
      col_parts[tbl_ix] = new_aliases[tbl_alias];
      return col_parts.join('.');
    }
    else {
      return col;
    }
  }
};


// provided for browser support, based on https://gist.github.com/prust/5936064
function inherits(ctor, superCtor) {
  if (Object.create) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
        }
    });
  }
  else {
    noop.prototype = superCtor.prototype;
    ctor.super_ = superCtor;
    ctor.prototype = new noop;
    ctor.prototype.constructor = superCtor;
  }
  return ctor;
}

if (typeof module != 'undefined')
  module.exports = sql;
else
  global.SqlBricks = sql;
})();
