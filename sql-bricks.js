var _ = require('underscore');

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
  stmt.tbl = tbl;
  if (values)
    stmt.values(values);
  return stmt;
};

sql.insert = sql.insertInto = function insertInto(tbl, values) {
  var stmt = new Statement('insert');
  stmt.tbl = tbl;
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

proto.from = function from(tbl) {
  this.tbl = abbrCheck(tbl);
  return this;
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
    tbl = abbrCheck(tbl);
    var tbl_name = getTable(tbl);
    if (tbl_name in sql.views)
      this.applyView(tbl_name, getAlias(tbl), on);
    else
      this._join(tbl, on, opts);
  }.bind(this));

  this.last_join = tbls[tbls.length - 1];
  return this;
};

proto._join = function _join(tbl, on, opts) {
  var left_tbl = this.last_join || this.tbl;
  var auto_on;
  if (!on && sql.joinCriteria)
    auto_on = sql.joinCriteria(getTable(left_tbl), getAlias(left_tbl), getTable(tbl), getAlias(tbl));
  var join = {'tbl': tbl, 'on': quoteReservedObj(on || auto_on)};
  if (opts && opts.auto_injected)
    join.auto_injected = true;
  this.joins.push(join);
};

proto.on = function on(on_criteria) {
  if (typeof on_criteria != 'object') {
    var key = on_criteria.slice();
    var value = arguments[1];
    on_criteria = {};
    on_criteria[key] = value;
  }

  // the .on() doesn't apply to joins that are auto-injected (implied)
  // from a view, they apply to the most recent *explicit* .join()

  // TODO: remove this complexity by making views a single .join()
  // and overloading their .toString() to walk internal joins...
  // It would decouple & make pseudo-views an extension instead of part of the core
  // (perhaps a subclass of a Join() class? or From(), if we support that too...)
  // it would be best to pull pseudo-views into a separate, optional, file
  var join_ix = this.joins.length - 1;
  while (this.joins[join_ix].auto_injected)
    join_ix--;

  this.joins[join_ix].on = quoteReservedObj(on_criteria);
  return this;
};

proto.and = proto.where = function where() {
  if (!this._where)
    this._where = sql.and();

  // .where(key, value).and(key, value) syntax
  if (typeof arguments[0] != 'object' && typeof arguments[1] != 'object') {
    this._where.expressions.push(
      sql.equal(arguments[0], arguments[1])
    );
  }
  // .where(expr) and .where({...}) syntax
  else {
    var where = this._where;
    _.each(arguments, function(expr) {
      if (isExpr(expr))
        where.expressions.push(expr);
      else
        where.expressions = where.expressions.concat(objToEquals(expr));
    });
  }

  return this;
};

proto.order = proto.orderBy = function orderBy(cols) {
  return this.addColumnArgs(arguments, 'order_by');
};

proto.group = proto.groupBy = function groupBy(cols) {
  return this.addColumnArgs(arguments, 'group_by');
};

proto.applyView = function(view_name, alias, on) {
  var view = sql.views[view_name];
  this._join(getTable(view.tbl) + ' ' + alias, on);
  var new_aliases = {};
  new_aliases[getAlias(view.tbl)] = alias;

  if (view.joins) {
    _.pluck(view.joins, 'tbl').map(getAlias).forEach(function(join_alias) {
      new_aliases[join_alias] = alias + '_' + join_alias;
    });

    view.joins.forEach(function(join) {
      var join_alias = getAlias(join.tbl);
      var join_tbl = getTable(join.tbl);
      var namespaced_on = {};
      if (join.on) {
        for (var key in join.on)
          namespaced_on[convert(key)] = convert(join.on[key]);
      }
      this.join(join_tbl + ' ' + new_aliases[join_alias], namespaced_on, {'auto_injected': true});
    }.bind(this));
  }

  if (view._where) {
    var where = view._where.clone();
    convertExpr(where);
    this.where(where);
  }

  function convertExpr(expr) {
    if (expr.col)
      expr.col = convert(expr.col);
    if (expr.expressions)
      expr.expressions.forEach(convertExpr);
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


// GENERIC
proto.clone = function clone() {
  return _.extend(new Statement(), this);
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
    default:
      throw new Error('Unknown statement type: "' + this.type + '"');
  }

  return sql.trim();
};

proto.selectToString = function selectToString(opts) {
  var cols = this.cols.length ? this.cols : ['*'];
  var sql = 'SELECT ' + cols.join(', ') + ' FROM ' + this.tbl + ' ';
  if (this.joins) {
    sql += this.joins.map(function(join) {
      return 'INNER JOIN ' + join.tbl + ' ON ' + Object.keys(join.on).map(function(key) {
        return key + ' = ' + join.on[key];
      });
    }).join(' ') + ' ';
  }

  if (this._where)
    sql += this.whereToString(opts);

  if (this.group_by)
    sql += 'GROUP BY ' + this.group_by.join(', ') + ' ';

  if (this.order_by)
    sql += 'ORDER BY ' + this.order_by.join(', ') + ' ';
  return sql;
};

proto.updateToString = function updateToString(opts) {
  var sql = 'UPDATE ' + this.tbl + ' SET ';
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
  return 'INSERT INTO ' + this.tbl + ' (' + keys + ') VALUES (' + values + ')';
};

proto.whereToString = function whereToString(opts) {
  this._where.parens = false;
  if (this._where.expressions && this._where.expressions.length == 1)
    this._where.expressions[0].parens = false;
  return 'WHERE ' + this._where.toString(opts) + ' ';
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
  var args = argsToArray(args).map(quoteReserved)
  return this.add(args, name);
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

sql._abbrs = {};
sql.tblToAbbr = {};
sql.setAbbrs = function setAbbrs(abbrs) {
  sql._abbrs = abbrs;
  for (var abbr in sql._abbrs)
    sql.tblToAbbr[sql._abbrs[abbr]] = abbr;
}
sql.getAbbr = function getAbbr(tbl) {
  if (!(tbl in sql.tblToAbbr))
    throw new Error('table "' + tbl + '" has no abbr, unable to auto-generate join criteria');
  return sql.tblToAbbr[tbl];
}
function abbrCheck(tbl) {
  return tbl in sql._abbrs ? sql._abbrs[tbl] + ' ' + tbl : tbl;
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
  var space_ix = tbl.indexOf(' ');
  if (space_ix > -1)
    return tbl.slice(space_ix + 1);
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
