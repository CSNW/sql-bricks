var _ = require('underscore');

var sql = {};
sql.views = {};

sql.select = function select(cols) {
  var stmt = new Statement('select');
  
  if (!cols)
    cols = ['*'];
  else if (!Array.isArray(cols))
    cols = [cols];
  stmt.cols = cols.map(quoteReserved);
  return stmt;
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
  if (values)
    stmt.values(values);
  return stmt;
};

sql.alter = sql.alterTable = function alterTable(tbl) {
  var stmt = new Statement('alter');
  stmt.tbl = tbl;
  return stmt;
};


function Statement(type) {
  this.type = type;
};
sql.Statement = Statement;

// SELECT
var proto = Statement.prototype;
proto.from = function from(tbl) {
  this.tbl = abbrCheck(tbl);
  return this;
};

proto.join = proto.innerJoin = function join() {
  if (!this.joins)
    this.joins = [];

  // .join(tbl1, tbl2, tbl3, ...)
  var on, tbls;
  if (typeof arguments[1] == 'string') {
    tbls = _.toArray(arguments);
  }
  // .join(tbl, on)
  else {
    tbls = [arguments[0]];
    on = arguments[1];
  }

  tbls.forEach(function(tbl) {
    tbl = abbrCheck(tbl);
    var tbl_name = getTable(tbl);
    if (tbl_name in sql.views)
      this.applyView(tbl_name, getAlias(tbl), on);
    else
      this._join(tbl, on);
  }.bind(this));

  this.last_join = tbls[tbls.length - 1];
  return this;
};

proto._join = function _join(tbl, on) {
  var left_tbl = this.last_join || this.tbl;
  var auto_on;
  if (!on && sql.joinCriteria)
    auto_on = sql.joinCriteria(getTable(left_tbl), getAlias(left_tbl), getTable(tbl), getAlias(tbl));
  this.joins.push({'tbl': tbl, 'on': quoteReservedObj(on || auto_on)});
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
  if (cols.indexOf(','))
    cols = _.invoke(cols.split(','), 'trim');
  else if (Array.isArray(cols))
    cols = cols;
  else
    cols = _.toArray(arguments);
  cols = cols.map(quoteReserved);

  if (this.order_by)
    this.order_by = this.order_by.concat(cols);
  else
    this.order_by = cols

  return this;
};

proto.group = proto.groupBy = function groupBy(cols) {
  if (cols.indexOf(',') > -1)
    cols = _.invoke(cols.split(','), 'trim');
  else if (Array.isArray(cols))
    cols = cols;
  else
    cols = _.toArray(arguments);
  cols = cols.map(quoteReserved);

  if (this.group_by)
    this.group_by = this.group_by.concat(cols);
  else
    this.group_by = cols;

  return this;
};

proto.applyView = function(view_name, alias, on) {
  var view = sql.views[view_name];
  this._join(getTable(view.tbl) + ' ' + alias, on);
  var new_aliases = {};
  new_aliases[getAlias(view.tbl)] = alias;

  if (view.joins) {
    view.joins.forEach(function(join) {
      var join_alias = getAlias(join.tbl);
      var new_alias = alias + '_' + join_alias;
      new_aliases[join_alias] = new_alias;
    });

    view.joins.forEach(function(join) {
      var join_alias = getAlias(join.tbl);
      var join_tbl = getTable(join.tbl);
      var namespaced_on = {};
      for (var key in join.on)
        namespaced_on[convert(key)] = convert(join.on[key]);
      this.join(join_tbl + ' ' + new_aliases[join_alias], namespaced_on);
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
proto.values = function values(values) {
  this._values = quoteReservedKeys(values);
  return this;
}

// UPDATE
proto.set = function set(key, value) {
  if (!this._values)
    this._values = {};
  this._values[quoteReserved(key)] = value;
  return this;
};

// ALTER
proto.drop = proto.dropColumn = function dropColumn(cols) {
  this.drop_cols = Array.isArray(cols) ? cols : [cols];
  return this;
};

proto.add = proto.addColumn = function addColumn(col) {
  this.add_cols = Array.isArray(cols) ? cols : [cols];
  return this;
};

// GENERIC
proto.clone = function clone() {
  return _.extend(new Statement(), this);
};

proto.toParams = function toParams() {
  var values = [];
  var sql = this.toString({'parameterized': true, 'values': values, 'value_ix': 1});
  return {'text': sql, 'values': values};  
};

proto.toString = function toString(opts) {
  if (!opts) opts = {};
  var sql = '';
  if (this.type == 'select') {
    sql = 'SELECT ' + this.cols + ' FROM ' + this.tbl + ' ';
    if (this.joins) {
      sql += this.joins.map(function(join) {
        return 'INNER JOIN ' + join.tbl + ' ON ' + Object.keys(join.on).map(function(key) {
          return key + ' = ' + join.on[key];
        });
      }).join(' ') + ' ';
    }

    if (this._where) {
      this._where.parens = false;
      if (this._where.expressions && this._where.expressions.length == 1)
        this._where.expressions[0].parens = false;
      sql += 'WHERE ' + this._where.toString(opts) + ' ';
    }

    if (this.group_by)
      sql += 'GROUP BY ' + this.group_by.join(', ') + ' ';

    if (this.order_by)
      sql += 'ORDER BY ' + this.order_by.join(', ') + ' ';
  }

  else if (this.type == 'update') {
    sql = 'UPDATE ' + this.tbl + ' SET ';
    sql += _.map(this._values, function(value, key) {
      return key + ' = ' + quoteValue(value, opts);
    }).join(', ');
  }

  else if (this.type == 'insert') {
    var keys = Object.keys(this._values).join(', ');
    var values = _.values(this._values).map(function(val) {
      return quoteValue(val, opts);
    }).join(', ');
    sql = 'INSERT INTO ' + this.tbl + ' (' + keys + ') VALUES (' + values + ')';
  }
  
  else if (this.type == 'alter') {
    sql = 'ALTER TABLE ' + tbl + ' ';
    if (this.drop_cols)
      sql += drop_cols.map(function(col) { return 'DROP COLUMN ' + col; }) + ' ';
    if (this.add_cols)
      sql += drop_cols.map(function(col) { return 'ADD COLUMN ' + col; }) + ' ';
  }

  else {
    throw new Error('Unknown type: "' + this.type + '"');
  }

  return sql.trim();
};

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
  if (opts.parameterized) {
    opts.values.push(val);
    return '$' + opts.value_ix++;
  }
  else {
    return (typeof val == 'string') ? "'" + val + "'" : val;
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
