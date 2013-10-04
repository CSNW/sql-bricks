var assert = require('assert');
var fs = require('fs');
var _ = require('underscore');
var sql = require('./sql-bricks.js');
var select = sql.select, insertInto = sql.insertInto, insert = sql.insert, update = sql.update;
var and = sql.and, or = sql.or, like = sql.like, not = sql.not, $in = sql.in,
  isNull = sql.isNull, isNotNull = sql.isNotNull, equal = sql.equal,
  lt = sql.lt, lte = sql.lte, gt = sql.gt, gte = sql.gte;

sql.setAbbrs({'usr': 'user', 'psn': 'person', 'addr': 'address'});

sql.joinCriteria = function(left_tbl, left_alias, right_tbl, right_alias) {
  var criteria = {};
  criteria[left_alias + '.' + sql.getAbbr(right_tbl) + '_fk'] = right_alias + '.pk';
  return criteria;
};

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

  describe('UPDATE statements', function() {
    it('should handle .set() syntax', function() {
      check(update('user').set('name', 'Fred'),
        "UPDATE user SET name = 'Fred'");
    });
    it('should handle .values() syntax', function() {
      check(update('user').values({'name': 'Fred'}),
        "UPDATE user SET name = 'Fred'");
    });
    it('should handle values argument', function() {
      check(update('user', {'name': 'Fred'}),
        "UPDATE user SET name = 'Fred'");
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
    it('should handle not()', function() {
      check(select().from('user').where(not({'first_name': 'Fred'})),
        "SELECT * FROM user WHERE NOT first_name = 'Fred'");
    });
    it('should handle in()', function() {
      check(select().from('user').where($in('first_name', ['Fred', 'Wilma'])),
        "SELECT * FROM user WHERE first_name IN ('Fred', 'Wilma')");
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
        'SELECT * FROM user WHERE "order" >= 5')
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
    it('with a db and table prefix and a suffix', function() {
      check(select('db.usr.desc AS usr_desc').from('usr'),
        'SELECT db.usr."desc" AS usr_desc FROM user usr');
    });
  });

  describe('pseudo-views', function() {
    it('should namespace joined tables', function() {
      sql.defineView('activeUsers', 'usr').join('psn');
      check(select().from('accounts').join('activeUsers a_usr'),
        'SELECT * FROM accounts ' + 
        'INNER JOIN user a_usr ON accounts.usr_fk = a_usr.pk ' +
        'INNER JOIN person a_usr_psn ON a_usr.psn_fk = a_usr_psn.pk');
    });
    it('should properly quote reserved words in join tables and allow custom ON criteria', function() {
      sql.defineView('activeUsers', 'usr').join('psn', {'usr.psn_desc': 'psn.desc'});
      check(select().from('accounts').join('activeUsers a_usr'),
        'SELECT * FROM accounts ' +
        'INNER JOIN user a_usr ON accounts.usr_fk = a_usr.pk ' +
        'INNER JOIN person a_usr_psn ON a_usr.psn_desc = a_usr_psn."desc"');
    });
    it('should add namespaced WHERE criteria', function() {
      sql.defineView('activeUsers', 'usr').join('psn').where({'usr.active': true, 'psn.active': true});
      check(select().from('accounts').join('activeUsers a_usr'),
        'SELECT * FROM accounts ' + 
        'INNER JOIN user a_usr ON accounts.usr_fk = a_usr.pk ' +
        'INNER JOIN person a_usr_psn ON a_usr.psn_fk = a_usr_psn.pk ' +
        'WHERE a_usr.active = true AND a_usr_psn.active = true');
    });
    it('should re-alias when re-using a view w/ a diff alias', function() {
      sql.defineView('activeUsers', 'usr').where({'usr.active': true});
      check(select().from('accounts').join('activeUsers a_usr', 'activeUsers a_usr2'),
        'SELECT * FROM accounts ' +
        'INNER JOIN user a_usr ON accounts.usr_fk = a_usr.pk ' +
        'INNER JOIN user a_usr2 ON accounts.usr_fk = a_usr2.pk ' +
        'WHERE a_usr.active = true AND a_usr2.active = true');
    });
  });

  describe('documentation examples', function() {
    var comment = '// ';

    var readme = fs.readFileSync('readme.md', 'utf8');
    readme.match(/```javascript[^`]+```/g).forEach(function(ex) {
      ex = ex.slice('```javascript'.length, -'```'.length);
      var lines = _.compact(ex.split('\n'));
      lines.forEach(function(line, ix) {
        line = line.trim();
        var next_line = (lines[ix + 1] || '').trim();

        if (isComment(line) && !isComment(next_line)) {
          var expected = getExpected(lines, ix);
          var code = lines.slice(0, ix);
          
          it(code.join('\n'), function(code, expected) {
            var result = eval(wrap(code));
            if (result instanceof sql.Statement)
              assert.equal(result.toString(), expected);
            else
              assert.deepEqual(result, JSON.parse(expected));
          }.bind(null, code, expected));
        }
      });
    });

    function wrap(lines) {
      var last_line = lines[lines.length - 1];
      var match = /var (\w+) =/.exec(last_line);
      if (match)
        lines.push(match[1] + ';');

      return lines.join('\n');
    }
    function isComment(str) {
      return str.slice(0, comment.length) == comment;
    }
    function trimComment(str) {
      return str.slice(comment.length);
    }
    function getExpected(lines, ix) {
      var comments = [];
      while (isComment(lines[ix])) {
        comments.push(trimComment(lines[ix]));
        ix--;
      }
      comments.reverse();
      comments = _.invoke(comments, 'trim');
      return comments.join(' ');
    }
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
