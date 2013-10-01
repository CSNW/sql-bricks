var _ = require('underscore');

var sql = {};

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
  this.left_tbl = tbl;
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
    if (!on && sql.joinCriteria)
      var auto_on = sql.joinCriteria(this.left_tbl, tbl);
    
    this.joins.push({'tbl': abbrCheck(tbl), 'on': quoteReservedObj(on || auto_on)});
  }.bind(this));

  this.left_tbl = tbls[tbls.length - 1];
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

sql.abbrs = {};
function abbrCheck(tbl) {
  return tbl in sql.abbrs ? sql.abbrs[tbl] + ' ' + tbl : tbl;
}

sql.and = function and() {
  var expressions = [];
  _.each(arguments, function(expr) {
    if (isExpr(expr))
      expressions.push(expr);
    else
      expressions = expressions.concat(objToEquals(expr));
  });

  return {
    'expressions': expressions,
    'toString': function(opts) {
      var sql = this.expressions.map(function(expr) {
        return expr.toString(opts);
      }).join(' AND ');
      if (this.expressions.length > 1 && this.parens !== false)
        sql = '(' + sql + ')';
      return sql;
    }
  };
};

sql.or = function or() {
  var expressions = [];
  _.each(arguments, function(expr) {
    if (isExpr(expr))
      expressions.push(expr);
    else
      expressions = expressions.concat(objToEquals(expr));
  });

  return {
    'toString': function(opts) {
      var sql = expressions.map(function(expr) {
        return expr.toString(opts);
      }).join(' OR ');
      if (this.parens !== false)
        sql = '(' + sql + ')';
      return sql;
    }
  };
};

sql.not = function not(expr) {
  if (!isExpr(expr))
    expr = sql.and(expr);

  return {
    'toString': function(opts) {
      return 'NOT ' + expr.toString(opts);
    }
  };
};

sql.like = function like(col, val) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' LIKE ' + quoteValue(val, opts);
    }
  };
};

sql.eq = sql.equal = function equal(col, val) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' = ' + quoteValue(val, opts);
    }
  };
};

sql.lt = function equal(col, val) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' < ' + quoteValue(val, opts);
    }
  };
};

sql.lte = function equal(col, val) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' <= ' + quoteValue(val, opts);
    }
  };
};

sql.gt = function equal(col, val) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' > ' + quoteValue(val, opts);
    }
  };
};

sql.gte = function equal(col, val) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' >= ' + quoteValue(val, opts);
    }
  };
};

sql.isNull = function isNull(col) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' IS NULL';
    }
  };
};

sql.isNotNull = function isNotNull(col) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' IS NOT NULL';
    }
  };
};

sql['in'] = function(col, list) {
  return {
    'toString': function(opts) {
      return quoteReserved(col) + ' IN (' + list.map(function(val) {
        return quoteValue(val, opts);
      }).join(', ') + ')';
    }
  };
};

function isExpr(expr) {
  return expr.hasOwnProperty('toString');
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
