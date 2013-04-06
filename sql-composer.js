var _ = require('underscore');
_.str = require('underscore.string');

var sql = module.exports = {};

var commands = {
  'select': [
    'into',
    'from',
      'natural',
      'join', 'leftJoin', 'rightJoin', 'fullJoin', 'crossJoin',
      'on', 'using',
    'where',
    'groupBy',
    'having',
    'window',
    'union', 'intersect', 'except',
    'orderBy',
    'limit',
    'offset',
    'fetch',
    'for'
  ],
  'insertInto': [
    'returning'
  ],
  'update': [
    'set',
    'from',
    'where',
    'returning'
  ],
  'deleteFrom': [
    'using',
    'where',
    'returning'
  ],
  'createTable': [
    'inherits',
    'with',
    'on',
    'tablespace'
  ],
  'alterTable': [
    'rename',
    'renameTo',
    'to',
    'set',
    'add',
    'drop',
    'alter',
    'validate',
    'drop',
    'disable',
    'enable',
    'cluster',
    'set',
    'reset',
    'inherit',
    'noInherit',
    'of',
    'notOf',
    'ownerTo'
  ]
};

sql.quote = function(str) {
  if (str.indexOf('.') > -1)
    return str.split('.').map(sql._quote);
  else if (str.indexOf(' AS ') > -1)
    return str.split('.').map(sql._quote);
  else if (/^\w+$/.test(str))
    return sql._quote(str);
  else
    return str;
}
sql._quote = function(str) {
  return '"' + str + '"';
};

sql.select = function(cols) {
  if (!(this instanceof sql.select)) return new sql.select(cols);
  this.cols = cols || '*';
  this.data = {};
};
sql.select.prototype.renderCommand = function() {
  return 'SELECT ' + (_.isArray(this.cols) ? this.cols.map(sql.quote).join(', ') : this.cols);
}
sql.insertInto = function() {
  if (!(this instanceof sql.insertInto)) return new sql.insertInto();
};
sql.update = function() {
  if (!(this instanceof sql.update)) return new sql.update();
};
sql.deleteFrom = function() {
  if (!(this instanceof sql.deleteFrom)) return new sql.deleteFrom();
};
sql.createTable = function() {
  if (!(this instanceof sql.createTable)) return new sql.createTable();
};
sql.alterTable = function() {
  if (!(this instanceof sql.alterTable)) return new sql.alterTable();
};

Object.keys(commands).forEach(function(cmd) {
  var methods = commands[cmd];
  var proto = sql[cmd].prototype;
  methods.forEach(function(method) {
    proto[method] = function(sql) {
      var arr = this.data[method] = this.data[method] || [];
      arr.push(sql);
      return this;
    }
  });
  proto.toQuery = function() {
    var text = [];
    text.push(this.renderCommand());
    methods.forEach(function(method) {
      if (method in this.data) {
        text.push(_.str.humanize(method).toUpperCase());
        text = text.concat(this.data[method]);
      }
    }.bind(this));
    return {
      'text': text.join(' ')
    }
  }
});

console.log(sql.select().from('myTable').where("first_name = 'James'").toQuery().text);
//.insert(table, cols, values) || .insert(table, {})
