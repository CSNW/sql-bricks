(function() {
"use strict";

var assert;
var is_common_js = typeof exports != 'undefined';

if (is_common_js) {
  assert = require('assert');
}
else {
  assert = function(condition, message) {
    if (!condition)
      throw new Error(message);
  };
  assert.equal = function(actual, expected) {
    if (actual != expected) throw new Error(JSON.stringify(actual) + ' == ' + JSON.stringify(expected));
  };
  assert.deepEqual = function(actual, expected) {
    if (!_.isEqual(actual, expected)) throw new Error(JSON.stringify(actual) + ' == ' + JSON.stringify(expected));
  };
  assert.throws = function(fn) {
    try {
      fn();
    }
    catch(ex) {
      return true;
    }
    throw new Error('The function passed to assert.throws() did not throw');
  }
}

var SqlBricks = is_common_js ? require('../sql-bricks.js') : window.SqlBricks;
var LimitOffset = is_common_js ? require('../limit-offset.js') : window.LimitOffsetBricks;
var sql = LimitOffset();
var select = sql.select;

describe('LIMIT ... OFFSET extension', function() {
  describe('.limit()', function() {
    it('should add a LIMIT clause', function() {
      assert.equal(select().from('user').limit(10).toString(),
        'SELECT * FROM "user" LIMIT 10');
    });
  });

  describe('.offset()', function() {
    it('should add an OFFSET clause', function() {
      assert.equal(select().from('user').offset(10).toString(),
        'SELECT * FROM "user" OFFSET 10');
    });
    it('should place OFFSET after LIMIT if both are supplied', function() {
      assert.equal(select().from('user').offset(5).limit(10).toString(),
        'SELECT * FROM "user" LIMIT 10 OFFSET 5');
    });
  });
});

describe('SQLBricks() extension mechanism', function() {
  it('should create multiple, non-conflicting namespaces', function() {
    var sql_92 = SqlBricks();
    var sql_ext = LimitOffset();
    assert(!sql_92.select().limit);
    assert(sql_ext.select().limit);
  });

  it('should extend the passed namespace', function() {
    var sql = SqlBricks();
    var sql_ext = LimitOffset(sql);
    assert.equal(sql, sql_ext);
  });
});

})();