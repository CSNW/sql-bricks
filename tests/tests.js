(function() {

var global = this;
var _ = global._ || require('underscore');
var sql = global.SqlBricks || require('../sql-bricks.js');
var assert;
if (typeof require != 'undefined') {
  assert = require('assert');
}
else {
  assert = {
    'equal': function(actual, expected) {
      if (actual != expected) throw new Error(JSON.stringify(actual) + ' == ' + JSON.stringify(expected));
    },
    'deepEqual': function(actual, expected) {
      if (!_.isEqual(actual, expected)) throw new Error(JSON.stringify(actual) + ' == ' + JSON.stringify(expected));
    }
  };
}

var select = sql.select, insertInto = sql.insertInto, insert = sql.insert,
  update = sql.update, del = sql.delete;
var and = sql.and, or = sql.or, like = sql.like, not = sql.not, $in = sql.in,
  isNull = sql.isNull, isNotNull = sql.isNotNull, equal = sql.equal,
  lt = sql.lt, lte = sql.lte, gt = sql.gt, gte = sql.gte, between = sql.between,
  exists = sql.exists, eqAny = sql.eqAny, notEqAny = sql.notEqAny, union = sql.union;

var alias_expansions = {'usr': 'user', 'psn': 'person', 'addr': 'address'};
var table_to_alias = _.invert(alias_expansions);
sql.aliasExpansions(alias_expansions);

sql.joinCriteria(function(left_tbl, left_alias, right_tbl, right_alias) {
  var criteria = {};
  criteria[left_alias + '.' + table_to_alias[right_tbl] + '_fk'] = right_alias + '.pk';
  return criteria;
});

describe('SQL Bricks', function() {
  describe('parameterized sql', function() {
    it('should generate for insert statements', function() {
      var values = {'first_name': 'Fred', 'last_name': 'Flintstone'};
      checkParams(insert('user', values),
        'INSERT INTO user (first_name, last_name) VALUES ($1, $2)',
        ['Fred', 'Flintstone']);
    });
    it('should generate for UPDATEs', function() {
      var values = {'first_name': 'Fred', 'last_name': 'Flintstone'};
      checkParams(update('user', values),
        'UPDATE user SET first_name = $1, last_name = $2',
        ['Fred', 'Flintstone']);
    });
    it('should generate for WHERE clauses', function() {
      checkParams(select().from('user').where({
        'removed': 0,
        'name': 'Fred Flintstone'
      }), 'SELECT * FROM user WHERE removed = $1 AND name = $2',
      [0, 'Fred Flintstone']);
    });
    it('should not escape single quotes in the values returned by toParams()', function() {
      checkParams(update('user', {'name': "Muad'Dib"}),
        'UPDATE user SET name = $1',
        ["Muad'Dib"]);
    });
    it('should generate node-sqlite3 style params', function() {
      var values = {'first_name': 'Fred', 'last_name': 'Flintstone'};
      var result = insert('user', values).toParams({'placeholder': '?'});
      assert.equal(result.text, 'INSERT INTO user (first_name, last_name) VALUES (?1, ?2)');
      assert.deepEqual(result.values, ['Fred', 'Flintstone']);
    });
    it('should properly parameterize subqueries', function() {
      var values = {'first_name': 'Fred'};
      checkParams(select(select('last_name').from('user').where(values)),
        'SELECT (SELECT last_name FROM user WHERE first_name = $1)',
        ['Fred']);
    });
    it('should properly parameterize subqueries in updates', function() {
      var addr_id_for_usr = select('id').from('address').where('usr_id', sql('user.id')).and('active', true);
      checkParams(update('user').set('addr_id', addr_id_for_usr),
        'UPDATE user SET addr_id = (SELECT id FROM address WHERE usr_id = user.id AND active = $1)',
        [true])
    });
  });

  describe('value handling', function() {
    it('should escape single quotes when toString() is used', function() {
      check(update('user', {'name': "Muad'Dib"}),
        "UPDATE user SET name = 'Muad''Dib'");
    });
    it('should escape multiple single quotes in the same string', function() {
      check(update('address', {'city': "Liu'e, Hawai'i"}),
        "UPDATE address SET city = 'Liu''e, Hawai''i'");
    });
    it('should support sql.val() to pass in values where columns are expected', function() {
      check(select().from('user').where(sql.val('Fred'), sql('first_name')),
        "SELECT * FROM user WHERE 'Fred' = first_name");
    });
  });

  it('should expand abbreviations in FROM and JOINs', function() {
    check(select().from('usr').join('psn', {'usr.psn_fk': 'psn.pk'}),
      'SELECT * FROM user usr INNER JOIN person psn ON usr.psn_fk = psn.pk');
  });

  it('should support aliases', function() {
    check(select().from('user usr2').join('address addr2'),
      'SELECT * FROM user usr2 INNER JOIN address addr2 ON usr2.addr_fk = addr2.pk');
  });

  it('should auto-generate join criteria using supplied joinCriteria() function', function() {
    check(select().from('usr').join('psn'),
      'SELECT * FROM user usr INNER JOIN person psn ON usr.psn_fk = psn.pk');
  });
  it('should auto-generate join criteria to multiple tables', function() {
    check(select().from('usr').join('psn').join('addr'),
      'SELECT * FROM user usr ' +
      'INNER JOIN person psn ON usr.psn_fk = psn.pk ' +
      'INNER JOIN address addr ON psn.addr_fk = addr.pk');
  });
  it('should auto-generate join criteria from a single table to multiple tables', function() {
    check(select().from('usr').join('psn', 'addr'),
      'SELECT * FROM user usr ' +
      'INNER JOIN person psn ON usr.psn_fk = psn.pk ' +
      'INNER JOIN address addr ON usr.addr_fk = addr.pk');
  });
  it('should handle unions', function() {
  	check(select().from('usr').where({'name': 'Roy'})
  		.union(select().from('usr').where({'name': 'Moss'}))
  		.union(select().from('usr').where({'name': 'The elders of the internet'})), 
  		"SELECT * FROM user usr WHERE name = 'Roy'" + 
  		" UNION SELECT * FROM user usr WHERE name = 'Moss'" + 
  		" UNION SELECT * FROM user usr WHERE name = 'The elders of the internet'");
  });
  it('should handle chained unions', function() {
  	check(select().from('usr').where({'name': 'Roy'})
  		.union().select().from('usr').where({'name': 'blurns'}), 
  		"SELECT * FROM user usr WHERE name = 'Roy'" + 
  		" UNION SELECT * FROM user usr WHERE name = 'blurns'");
  });
  it('should handle chained unions with params', function() {
    checkParams(select().from('usr').where({'name': 'Roy'})
      .union().select().from('usr').where({'name': 'Moss'}), 
      "SELECT * FROM user usr WHERE name = $1" + 
      " UNION SELECT * FROM user usr WHERE name = $2", ['Roy', 'Moss']);
  });
  it('should handle unions with params', function() {
  	checkParams(select().from('usr').where({'name': 'Roy'})
	  .union(select().from('usr').where({'name': 'Moss'}))
	  .union(select().from('usr').where({'name': 'The elders of the internet'})),
	  'SELECT * FROM user usr WHERE name = $1' + 
	  ' UNION SELECT * FROM user usr WHERE name = $2' + 
	  ' UNION SELECT * FROM user usr WHERE name = $3',
	  ['Roy', 'Moss', 'The elders of the internet']);
  });

  describe('UPDATE statements', function() {
    it('should handle .set() with (key, value)', function() {
      check(update('user').set('name', 'Fred'),
        "UPDATE user SET name = 'Fred'");
    });
    it('should handle .values() with an object literal', function() {
      check(update('user').values({'name': 'Fred'}),
        "UPDATE user SET name = 'Fred'");
    });
    it('should handle multiple .set()s with object literals', function() {
      check(update('user').set({'name': 'Fred'}).set({'last_name': 'Flintstone'}),
        "UPDATE user SET name = 'Fred', last_name = 'Flintstone'");
    });
    it('should handle multiple .values() with (key, value)', function() {
      check(update('user').values('name', 'Fred').values('last_name', 'Flintstone'),
        "UPDATE user SET name = 'Fred', last_name = 'Flintstone'");
    });
    it('should handle values argument', function() {
      check(update('user', {'name': 'Fred'}),
        "UPDATE user SET name = 'Fred'");
    });
    it('SQLite: should handle OR REPLACE', function() {
      check(update('user').orReplace().set({'name': 'Fred', 'id': 33}),
        "UPDATE OR REPLACE user SET name = 'Fred', id = 33");
    });
  });

  describe('INSERT statements', function() {
    it('should handle .orReplace()', function() {
      check(insert().orReplace().into('user').values({'id': 33, 'name': 'Fred'}),
        "INSERT OR REPLACE INTO user (id, name) VALUES (33, 'Fred')");
    });
  });

  describe('SELECT clause', function() {
    it('should handle an array', function() {
      check(select(['one', 'order']).from('user'),
        'SELECT one, "order" FROM user');
    });
    it('should handle multiple args', function() {
      check(select('one', 'order').from('user'),
        'SELECT one, "order" FROM user');
    });
    it('should default to *', function() {
      check(select().from('user'),
        'SELECT * FROM user');
    });
    it('should handle a comma-delimited str', function() {
      check(select('one, order').from('user'),
        'SELECT one, "order" FROM user');
    });
    it('should handle being called multiple times', function() {
      check(select('one, order').select(['two', 'desc']).select('three', 'four').from('user'),
        'SELECT one, "order", two, "desc", three, four FROM user');
    });
    it('should support DISTINCT', function() {
      check(select('one, order').distinct('two, desc').from('user'),
        'SELECT DISTINCT one, "order", two, "desc" FROM user');
    });
    it('should support FOR UPDATE', function() {
      check(select().from('user').forUpdate('user'),
        'SELECT * FROM user FOR UPDATE user');
    });
    it('should support FOR UPDATE ... NO WAIT', function() {
      check(select().from('user').forUpdateOf('user').noWait(),
        'SELECT * FROM user FOR UPDATE user NO WAIT');
    });
  });

  describe('.from()', function() {
    it('should handle an array', function() {
      check(select().from(['one', 'two', 'usr']),
        'SELECT * FROM one, two, user usr');
    });
    it('should handle multiple args', function() {
      check(select().from('one', 'two', 'usr'),
        'SELECT * FROM one, two, user usr');
    });
    it('should handle a comma-delimited string', function() {
      check(select().from('one, two, usr'),
        'SELECT * FROM one, two, user usr');
    });
    it('should handle being called multiple times', function() {
      check(select().from('one', 'usr').from(['two', 'psn']).from('three, addr'),
        'SELECT * FROM one, user usr, two, person psn, three, address addr');
    });
  });

  describe('should insert into a new table', function() {
    it('.into()', function() {
      check(select().into('new_user').from('user'),
        'SELECT * INTO new_user FROM user');
    });
    it('.intoTable()', function() {
      check(select().intoTable('new_user').from('user'),
        'SELECT * INTO new_user FROM user');
    });
    it('intoTemp()', function() {
      check(select().intoTemp('new_user').from('user'),
        'SELECT * INTO TEMP new_user FROM user');
    });
    it('intoTempTable()', function() {
      check(select().intoTempTable('new_user').from('user'),
        'SELECT * INTO TEMP new_user FROM user');
    });
  });

  describe('should insert into a preexisting table', function() {
    it('insert().into().select()', function() {
      check(insert().into('new_user', 'id', 'addr_id')
        .select('id', 'addr_id').from('user'),
        'INSERT INTO new_user (id, addr_id) SELECT id, addr_id FROM user');
    });
    it('insert().select()', function() {
      check(insert('new_user', 'id', 'addr_id')
        .select('id', 'addr_id').from('user'),
        'INSERT INTO new_user (id, addr_id) SELECT id, addr_id FROM user');
    });
  });

  describe('GROUP BY clause', function() {
    it('should support single group by', function() {
      check(select().from('user').groupBy('last_name'),
        'SELECT * FROM user GROUP BY last_name');
    });
    it('should support multiple groupBy() args w/ reserved words quoted', function() {
      check(select().from('user').groupBy('last_name', 'order'),
        'SELECT * FROM user GROUP BY last_name, "order"');
    });
    it('should support .groupBy().groupBy()', function() {
      check(select().from('user').groupBy('last_name').groupBy('order'),
        'SELECT * FROM user GROUP BY last_name, "order"');
    });
    it('should support an array', function() {
      check(select().from('user').groupBy(['last_name', 'order']),
        'SELECT * FROM user GROUP BY last_name, "order"');
    });
  });

  describe('.order() / .orderBy()', function() {
    it('should support .orderBy(arg1, arg2)', function() {
      check(select().from('user').orderBy('last_name', 'order'),
        'SELECT * FROM user ORDER BY last_name, "order"');
    });
    it('should support an array', function() {
      check(select().from('user').orderBy(['last_name', 'order']),
        'SELECT * FROM user ORDER BY last_name, "order"');
    });
    it('should support being called multiple times', function() {
      check(select().from('user').orderBy('last_name').orderBy('order'),
        'SELECT * FROM user ORDER BY last_name, "order"');
    });
  });

  describe('joins', function() {
    it('.join() should accept a comma-delimited string', function() {
      check(select().from('usr').join('psn, addr'),
        'SELECT * FROM user usr ' + 
        'INNER JOIN person psn ON usr.psn_fk = psn.pk ' +
        'INNER JOIN address addr ON usr.addr_fk = addr.pk');
    });
    it('.leftJoin() should generate a left join', function() {
      check(select().from('usr').leftJoin('addr'),
        'SELECT * FROM user usr ' + 
        'LEFT JOIN address addr ON usr.addr_fk = addr.pk');
    });
    it('.leftOuterJoin() should generate a left join', function() {
      check(select().from('usr').leftOuterJoin('addr'),
        'SELECT * FROM user usr ' + 
        'LEFT JOIN address addr ON usr.addr_fk = addr.pk');
    });
    it('.rightJoin() should generate a right join', function() {
      check(select().from('usr').rightJoin('addr'),
        'SELECT * FROM user usr ' + 
        'RIGHT JOIN address addr ON usr.addr_fk = addr.pk');
    });
    it('.rightOuterJoin() should generate a right join', function() {
      check(select().from('usr').rightOuterJoin('addr'),
        'SELECT * FROM user usr ' + 
        'RIGHT JOIN address addr ON usr.addr_fk = addr.pk');
    });
    it('.fullJoin() should generate a full join', function() {
      check(select().from('usr').fullJoin('addr'),
        'SELECT * FROM user usr ' + 
        'FULL JOIN address addr ON usr.addr_fk = addr.pk');
    });
    it('.fullOuterJoin() should generate a full join', function() {
      check(select().from('usr').fullOuterJoin('addr'),
        'SELECT * FROM user usr ' + 
        'FULL JOIN address addr ON usr.addr_fk = addr.pk');
    });
    it('.crossJoin() should generate a cross join', function() {
      check(select().from('usr').crossJoin('addr'),
        'SELECT * FROM user usr ' + 
        'CROSS JOIN address addr ON usr.addr_fk = addr.pk');
    });
  });

  describe('on()', function() {
    it('should accept an object literal', function() {
      check(select().from('usr').join('addr').on({'usr.addr_id': 'addr.id'}),
        'SELECT * FROM user usr ' + 
        'INNER JOIN address addr ON usr.addr_id = addr.id');
    });
    it('should accept a (key, value) pair', function() {
      check(select().from('usr').join('addr').on('usr.addr_id', 'addr.id'),
        'SELECT * FROM user usr ' + 
        'INNER JOIN address addr ON usr.addr_id = addr.id');
    });
    it('can be called multiple times', function() {
      check(select().from('usr', 'psn').join('addr').on({'usr.addr_id': 'addr.id'})
          .on('psn.addr_id', 'addr.id'),
        'SELECT * FROM user usr, person psn ' + 
        'INNER JOIN address addr ON usr.addr_id = addr.id AND psn.addr_id = addr.id');
    });
    it('can be called multiple times w/ an object literal', function() {
      check(select().from('usr', 'psn').join('addr').on({'usr.addr_id': 'addr.id'})
          .on({'psn.addr_id': 'addr.id'}),
        'SELECT * FROM user usr, person psn ' + 
        'INNER JOIN address addr ON usr.addr_id = addr.id AND psn.addr_id = addr.id');
    });
  });

  describe('WHERE clauses', function() {
    it('should AND multiple where() criteria by default', function() {
      check(select().from('user').where({
          'first_name': 'Fred',
          'last_name': 'Flintstone'
        }),
        "SELECT * FROM user WHERE first_name = 'Fred' AND last_name = 'Flintstone'");
    });
    it('should AND multiple where()s by default', function() {
      check(select().from('user').where({'first_name': 'Fred'})
        .where({'last_name': 'Flintstone'}),
        "SELECT * FROM user WHERE first_name = 'Fred' AND last_name = 'Flintstone'");
    });
    it('should handle explicit .and() with (key, value) args', function() {
      check(select().from('user').where('first_name', 'Fred')
        .and('last_name', 'Flintstone'),
        "SELECT * FROM user WHERE first_name = 'Fred' AND last_name = 'Flintstone'");
    });
    it('should handle nested and(or())', function() {
      check(select().from('user').where(and({'last_name': 'Flintstone'}, or({'first_name': 'Fred'}, {'first_name': 'Wilma'}))),
        "SELECT * FROM user WHERE last_name = 'Flintstone' AND (first_name = 'Fred' OR first_name = 'Wilma')");
    });
    it('and() should be implicit', function() {
      check(select().from('user').where({'last_name': 'Flintstone'}, or({'first_name': 'Fred'}, {'first_name': 'Wilma'})),
        "SELECT * FROM user WHERE last_name = 'Flintstone' AND (first_name = 'Fred' OR first_name = 'Wilma')");
    });
    it('should handle like()', function() {
      check(select().from('user').where(like('last_name', 'Flint%')),
        "SELECT * FROM user WHERE last_name LIKE 'Flint%'");
    });
    it('should accept a 3rd escape param to like()', function() {
      check(select().from('user').where(like('percent', '100\\%', '\\')),
        "SELECT * FROM user WHERE percent LIKE '100\\%' ESCAPE '\\'")
    });
    it('should handle not()', function() {
      check(select().from('user').where(not({'first_name': 'Fred'})),
        "SELECT * FROM user WHERE NOT first_name = 'Fred'");
    });
    it('should handle in()', function() {
      check(select().from('user').where($in('first_name', ['Fred', 'Wilma'])),
        "SELECT * FROM user WHERE first_name IN ('Fred', 'Wilma')");
    });
    it('should handle .in() with multiple args', function() {
      check(select().from('user').where($in('name', 'Jimmy', 'Owen')),
        "SELECT * FROM user WHERE name IN ('Jimmy', 'Owen')");
    });
    it('should handle .in() with a subquery', function() {
      check(select().from('user').where($in('addr_id', select('id').from('address'))),
        'SELECT * FROM user WHERE addr_id IN (SELECT id FROM address)');
    });
    it('should handle exists() with a subquery', function() {
      check(select().from('user').where(exists(select().from('address').where({'user.addr_id': sql('address.id')}))),
        'SELECT * FROM user WHERE EXISTS (SELECT * FROM address WHERE user.addr_id = address.id)');
    });
    it('should handle exists() with a subquery, parameterized', function() {
      checkParams(select().from('user').where('active', true).where(exists(select().from('address').where({'user.addr_id': 37}))),
        'SELECT * FROM user WHERE active = $1 AND EXISTS (SELECT * FROM address WHERE user.addr_id = $2)',
        [true, 37]);
    });
    it('should handle isNull()', function() {
      check(select().from('user').where(isNull('first_name')),
        'SELECT * FROM user WHERE first_name IS NULL');
    });
    it('should handle isNotNull()', function() {
      check(select().from('user').where(isNotNull('first_name')),
        'SELECT * FROM user WHERE first_name IS NOT NULL');
    });
    it('should handle explicit equal()', function() {
      check(select().from('user').where(equal('first_name', 'Fred')),
        "SELECT * FROM user WHERE first_name = 'Fred'");
    });
    it('should handle lt()', function() {
      check(select().from('user').where(lt('order', 5)),
        'SELECT * FROM user WHERE "order" < 5')
    });
    it('should handle lte()', function() {
      check(select().from('user').where(lte('order', 5)),
        'SELECT * FROM user WHERE "order" <= 5')
    });
    it('should handle gt()', function() {
      check(select().from('user').where(gt('order', 5)),
        'SELECT * FROM user WHERE "order" > 5')
    });
    it('should handle gte()', function() {
      check(select().from('user').where(gte('order', 5)),
        'SELECT * FROM user WHERE "order" >= 5');
    });
    it('should handle between()', function() {
      check(select().from('user').where(between('name', 'Frank', 'Fred')),
        "SELECT * FROM user WHERE name BETWEEN 'Frank' AND 'Fred'")
    });
  });

  describe('.limit()', function() {
    it('should add a LIMIT clause', function() {
      check(select().from('user').limit(10),
        'SELECT * FROM user LIMIT 10');
    });
  });

  describe('.offset()', function() {
    it('should add an OFFSET clause', function() {
      check(select().from('user').offset(10),
        'SELECT * FROM user OFFSET 10');
    });
    it('should place OFFSET after LIMIT if both are supplied', function() {
      check(select().from('user').offset(5).limit(10),
        'SELECT * FROM user LIMIT 10 OFFSET 5');
    });
  });

  describe('should quote reserved words in column names', function() {
    it('in ORDER BY', function() {
      check(select().from('usr').orderBy('order'),
        'SELECT * FROM user usr ORDER BY "order"');
    });
    it('in SELECT', function() {
      check(select('desc').from('usr'),
        'SELECT "desc" FROM user usr');
    });
    it('in JOINs', function() {
      check(select().from('usr').join('psn', {'usr.order': 'psn.order'}),
        'SELECT * FROM user usr INNER JOIN person psn ON usr."order" = psn."order"')
    });
    it('in INSERT', function() {
      check(insert('user').values({'order': 1}),
        'INSERT INTO user ("order") VALUES (1)');
    });
    it('in alternative insert() API', function() {
      check(insert('user', 'order').values(1),
        'INSERT INTO user ("order") VALUES (1)');
    });
    it('with a db and table prefix and a suffix', function() {
      check(select('db.usr.desc AS usr_desc').from('usr'),
        'SELECT db.usr."desc" AS usr_desc FROM user usr');
    });
    it('should quote sqlite reserved words', function() {
      check(select('action').from('user'),
        'SELECT "action" FROM user');
    });
  });

  describe('subqueries in <, >, etc', function() {
    it('should support a subquery in >', function() {
      var count_addrs_for_usr = select('count(*)').from('address').where({'user.addr_id': sql('address.id')});
      check(select().from('user').where(gt(count_addrs_for_usr, 5)),
        'SELECT * FROM user WHERE (SELECT count(*) FROM address WHERE user.addr_id = address.id) > 5');
    });
    it('should support a subquery in <=', function() {
      var count_addrs_for_usr = select('count(*)').from('address').where({'user.addr_id': sql('address.id')});
      check(select().from('user').where(lte(count_addrs_for_usr, 5)),
        'SELECT * FROM user WHERE (SELECT count(*) FROM address WHERE user.addr_id = address.id) <= 5');
    });
    it('should support = ANY (subquery) quantifier', function() {
      check(select().from('user').where(eqAny('user.id', select('user_id').from('address'))),
        'SELECT * FROM user WHERE user.id = ANY (SELECT user_id FROM address)');
    });
    it('should support <> ANY (subquery) quantifier', function() {
      check(select().from('user').where(notEqAny('user.id', select('user_id').from('address'))),
        'SELECT * FROM user WHERE user.id <> ANY (SELECT user_id FROM address)');
    });
  });

  describe('pseudo-views', function() {
    it('should namespace joined tables', function() {
      sql.addView('activeUsers', select().from('usr').join('psn'));
      check(select().from('accounts').joinView('activeUsers a_usr'),
        'SELECT * FROM accounts ' + 
        'INNER JOIN user a_usr ON accounts.usr_fk = a_usr.pk ' +
        'INNER JOIN person a_usr_psn ON a_usr.psn_fk = a_usr_psn.pk');
    });
    it('should properly quote reserved words in join tables and allow custom ON criteria', function() {
      sql.addView('activeUsers', select().from('usr').join('psn', {'usr.psn_desc': 'psn.desc'}));
      check(select().from('accounts').joinView('activeUsers a_usr'),
        'SELECT * FROM accounts ' +
        'INNER JOIN user a_usr ON accounts.usr_fk = a_usr.pk ' +
        'INNER JOIN person a_usr_psn ON a_usr.psn_desc = a_usr_psn."desc"');
    });
    it('should add namespaced WHERE criteria', function() {
      sql.addView('activeUsers', select().from('usr').join('psn').where({'usr.active': true, 'psn.active': true}));
      check(select().from('accounts').joinView('activeUsers a_usr'),
        'SELECT * FROM accounts ' + 
        'INNER JOIN user a_usr ON accounts.usr_fk = a_usr.pk ' +
        'INNER JOIN person a_usr_psn ON a_usr.psn_fk = a_usr_psn.pk ' +
        'WHERE a_usr.active = true AND a_usr_psn.active = true');
    });
    it('should re-alias when re-using a view w/ a diff alias', function() {
      sql.addView('activeUsers', select().from('usr').where({'usr.active': true}));
      check(select().from('accounts').joinView('activeUsers a_usr').joinView('activeUsers a_usr2'),
        'SELECT * FROM accounts ' +
        'INNER JOIN user a_usr ON accounts.usr_fk = a_usr.pk ' +
        'INNER JOIN user a_usr2 ON a_usr.usr_fk = a_usr2.pk ' +
        'WHERE a_usr.active = true AND a_usr2.active = true');
    });
    it('should be able to select from a pseudo-view', function() {
      sql.addView('activeUsers', select().from('usr').where({'usr.active': true}));
      check(sql.getView('activeUsers'),
        'SELECT * FROM user usr WHERE usr.active = true');
    });
  });

  describe('deep Statement.clone()', function() {
    it('should deep clone WHERE expressions', function() {
      var sel = select().from('user').where({'first_name': 'Fred'});
      sel.clone().where({'last_name': 'Flintstone'});
      check(sel, "SELECT * FROM user WHERE first_name = 'Fred'");
    });
    it('should deep clone .order()', function() {
      var sel = select().from('user').order('name');
      sel.clone().order('last_name');
      check(sel, 'SELECT * FROM user ORDER BY name');
    });
    it('should deep clone .join()', function() {
      var sel = select().from('user').join('addr');
      sel.clone().join('psn');
      check(sel, 'SELECT * FROM user INNER JOIN address addr ON user.addr_fk = addr.pk');
    });
    it('should clone values', function() {
      var ins = insert('user', {'first_name': 'Fred'});
      ins.clone().values({'last_name': 'Flintstone'});
      check(ins, "INSERT INTO user (first_name) VALUES ('Fred')");
    });
  });

  describe('the AS keyword', function() {
    it('should not generate invalid SQL', function() {
      check(select().from('user AS usr').join('addr'),
        'SELECT * FROM user AS usr INNER JOIN address addr ON usr.addr_fk = addr.pk');
    });
  });

  describe('delete()', function() {
    it('should generate a DELETE statement', function() {
      check(del('user'),
        'DELETE FROM user');
    });
    it('should support .from()', function() {
      check(del().from('user'),
        'DELETE FROM user');
    });
    it('should generate a DELETE statement with a WHERE clause', function() {
      check(del('user').where('first_name', 'Fred'),
        "DELETE FROM user WHERE first_name = 'Fred'")
    });
    it('should generate a DELETE with using', function() {
      check(del('user').using('addr').where('user.addr_fk', sql('addr.pk')),
        "DELETE FROM user USING address addr WHERE user.addr_fk = addr.pk");
    });
  });
    });

function check(stmt, expected) {
  assert.equal(stmt.toString(), expected);
}

function checkParams(stmt, expectedSQL, expectedValues) {
  var result = stmt.toParams();
  assert.equal(result.text, expectedSQL);
  assert.deepEqual(result.values, expectedValues);
}

})();
