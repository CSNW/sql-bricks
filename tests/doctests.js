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
  update = sql.update, del = sql.delete, replace = sql.replace;
var and = sql.and, or = sql.or, like = sql.like, not = sql.not, $in = sql.in,
  isNull = sql.isNull, isNotNull = sql.isNotNull, equal = sql.equal,
  lt = sql.lt, lte = sql.lte, gt = sql.gt, gte = sql.gte, between = sql.between,
  exists = sql.exists, eqAny = sql.eqAny;

describe('SQL Bricks', function() {
  describe('documentation examples', function() {


it(".where(or({last_name: 'Rubble'}, $in('first_name', ['Fred', 'Wilma', 'Pebbles'])));", function() {

check(select().from('user')  .where(or({last_name: 'Rubble'}, $in('first_name', ['Fred', 'Wilma', 'Pebbles']))), "SELECT * FROM user WHERE last_name = 'Rubble' OR first_name IN ('Fred', 'Wilma', 'Pebbles')");
});

it("select('*').from('user').where({'billing_addr_id': sql('mailing_addr_id')})", function() {
check(select('*').from('user').where({'billing_addr_id': sql('mailing_addr_id')}), "SELECT * FROM user WHERE billing_addr_id = mailing_addr_id");
});

it("select().from('user').where(sql.val('Fred'), sql('first_name'));", function() {
check(select().from('user').where(sql.val('Fred'), sql('first_name')), "SELECT * FROM user WHERE 'Fred' = first_name");
});

it("active_users;", function() {
var active_users = select('*').from('user').where({'active': true});
check(active_users, "SELECT * FROM user WHERE active = true");
});

it("local_users;", function() {
var active_users = select('*').from('user').where({'active': true});
var local_users = active_users.clone().where({'local': true});
check(local_users, "SELECT * FROM user WHERE active = true AND local = true");
});

it("update('user', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams();", function() {
check(update('user', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams(), {"text": "UPDATE user SET first_name = $1 WHERE last_name = $2", "values": ["Fred", "Flintstone"]});
});

it("update('user', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams({placeholder: '?'});", function() {
check(update('user', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams({placeholder: '?'}), {"text": "UPDATE user SET first_name = ?1 WHERE last_name = ?2", "values": ["Fred", "Flintstone"]});
});

it("select().from('user').join('address', {'user.addr_id': 'address.id'});", function() {
check(select().from('user').join('address', {'user.addr_id': 'address.id'}), "SELECT * FROM user INNER JOIN address ON user.addr_id = address.id");
});

it("select('*').from('user').innerJoin('address').on('user.addr_id', 'address.id');", function() {
check(select('*').from('user').innerJoin('address').on('user.addr_id', 'address.id'), "SELECT * FROM user INNER JOIN address ON user.addr_id = address.id");
});

it("select('*').from('user').join('address').on({'user.addr_id': 'address.id'});", function() {
select('*').from('user').innerJoin('address').on('user.addr_id', 'address.id');

check(select('*').from('user').join('address').on({'user.addr_id': 'address.id'}), "SELECT * FROM user INNER JOIN address ON user.addr_id = address.id");
});

it("select('*').from('user').where('first_name', 'Fred');", function() {
check(select('*').from('user').where('first_name', 'Fred'), "SELECT * FROM user WHERE first_name = 'Fred'");
});

it("select('*').from('user').where('last_name', 'Flintstone').and('first_name', 'Fred');", function() {
select('*').from('user').where('first_name', 'Fred');

check(select('*').from('user').where('last_name', 'Flintstone').and('first_name', 'Fred'), "SELECT * FROM user WHERE last_name = 'Flintstone' AND first_name = 'Fred'");
});

it("select('*').from('user').where({'last_name': 'Flintstone', 'first_name': 'Fred'});", function() {
check(select('*').from('user').where({'last_name': 'Flintstone', 'first_name': 'Fred'}), "SELECT * FROM user WHERE last_name = 'Flintstone' AND first_name = 'Fred'");
});

it("select('*').from('user').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'}));", function() {
check(select('*').from('user').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'})), "SELECT * FROM user WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'");
});

it(".groupBy('city').having(lt('max(temp_lo)', 40))", function() {

check(select('city', 'max(temp_lo)').from('weather')  .groupBy('city').having(lt('max(temp_lo)', 40)), "SELECT city, max(temp_lo) FROM weather GROUP BY city HAVING max(temp_lo) < 40");
});

it(".select().from('user').where({'last_name': 'Rubble'});", function() {

check(select().from('user').where({'last_name': 'Flintstone'}).union()  .select().from('user').where({'last_name': 'Rubble'}), "SELECT * FROM user WHERE last_name = 'Flintstone' UNION SELECT * FROM user WHERE last_name = 'Rubble'");
});

it("select('addr_id').from('user').forUpdate('addr_id').noWait();", function() {
check(select('addr_id').from('user').forUpdate('addr_id').noWait(), "SELECT addr_id FROM user FOR UPDATE addr_id NO WAIT");
});

it("select('*').from('person').joinView('localUser l_usr', {'person.usr_id': 'l_usr.id'});", function() {
sql.addView('localUser',
  select().from('user')
    .join('address').on({'user.addr_id': 'address.id'})
    .where({'address.local': true})
);

check(select('*').from('person').joinView('localUser l_usr', {'person.usr_id': 'l_usr.id'}), "SELECT * FROM person INNER JOIN user l_usr ON person.usr_id = l_usr.id INNER JOIN address l_usr_address ON l_usr.addr_id = l_usr_address.id WHERE l_usr_address.local = true");
});

it("insert('user', {'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
check(insert('user', {'first_name': 'Fred', 'last_name': 'Flintstone'}), "INSERT INTO user (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("insertInto('user', 'first_name', 'last_name').values('Fred', 'Flintstone');", function() {
check(insertInto('user', 'first_name', 'last_name').values('Fred', 'Flintstone'), "INSERT INTO user (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("insert().orReplace().into('user').values({'first_name': 'Fred', 'id': 33});", function() {
check(insert().orReplace().into('user').values({'first_name': 'Fred', 'id': 33}), "INSERT OR REPLACE INTO user (first_name, id) VALUES ('Fred', 33)");
});

it("insert().orReplace().into('user').values({'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
check(insert().orReplace().into('user').values({'first_name': 'Fred', 'last_name': 'Flintstone'}), "INSERT OR REPLACE INTO user (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("insertInto('user', 'first_name', 'last_name').values('Fred', 'Flintstone');", function() {
check(insertInto('user', 'first_name', 'last_name').values('Fred', 'Flintstone'), "INSERT INTO user (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("insertInto('user').values({'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
insertInto('user', 'first_name', 'last_name').values('Fred', 'Flintstone');

check(insertInto('user').values({'first_name': 'Fred', 'last_name': 'Flintstone'}), "INSERT INTO user (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("ins.returning('account.pk');", function() {
var ins = insert('user', 'first_name, last_name');
ins.select('first_name, last_name')
.from('account');
check(ins.returning('account.pk'), "INSERT INTO user (first_name, last_name) SELECT first_name, last_name FROM account RETURNING account.pk");
});

it("update('user', {'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
check(update('user', {'first_name': 'Fred', 'last_name': 'Flintstone'}), "UPDATE user SET first_name = 'Fred', last_name = 'Flintstone'");
});

it("update('user').orReplace().set({'first_name': 'Fred', 'id': 33});", function() {
check(update('user').orReplace().set({'first_name': 'Fred', 'id': 33}), "UPDATE OR REPLACE user SET first_name = 'Fred', id = 33");
});

it("update('user').set('first_name', 'Fred').set('last_name', 'Flintstone');", function() {
check(update('user').set('first_name', 'Fred').set('last_name', 'Flintstone'), "UPDATE user SET first_name = 'Fred', last_name = 'Flintstone'");
});

it("update('user').set({'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
update('user').set('first_name', 'Fred').set('last_name', 'Flintstone');

check(update('user').set({'first_name': 'Fred', 'last_name': 'Flintstone'}), "UPDATE user SET first_name = 'Fred', last_name = 'Flintstone'");
});

it("select().from('user').where({'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
check(select().from('user').where({'first_name': 'Fred', 'last_name': 'Flintstone'}), "SELECT * FROM user WHERE first_name = 'Fred' AND last_name = 'Flintstone'");
});

it("select().from('user').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'}));", function() {
check(select().from('user').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'})), "SELECT * FROM user WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'");
});

it("select().from('user').where(or({'first_name': 'Fred', 'last_name': 'Rubble'}));", function() {
check(select().from('user').where(or({'first_name': 'Fred', 'last_name': 'Rubble'})), "SELECT * FROM user WHERE first_name = 'Fred' OR last_name = 'Rubble'");
});

it("select().from('user').where(not($in('name', ['Fred', 'Barney', 'Wilma', 'Pebbles'])));", function() {
check(select().from('user').where(not($in('name', ['Fred', 'Barney', 'Wilma', 'Pebbles']))), "SELECT * FROM user WHERE NOT name IN ('Fred', 'Barney', 'Wilma', 'Pebbles')");
});

it("select().from('user').where(gt('access', 5));", function() {
check(select().from('user').where(gt('access', 5)), "SELECT * FROM user WHERE access > 5");
});

it("select().from('user').where(between('access', 1, 5));", function() {
check(select().from('user').where(between('access', 1, 5)), "SELECT * FROM user WHERE access BETWEEN 1 AND 5");
});

it("select().from('user').where(isNull('name'));", function() {
check(select().from('user').where(isNull('name')), "SELECT * FROM user WHERE name IS NULL");
});

it("select('*').from('user').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'}));", function() {
check(select('*').from('user').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'})), "SELECT * FROM user WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'");
});

it("select().from('address').where({'address.id': sql('user.addr_id')})));", function() {

check(select().from('user').where(exists(  select().from('address').where({'address.id': sql('user.addr_id')}))), "SELECT * FROM user WHERE EXISTS (SELECT * FROM address WHERE address.id = user.addr_id)");
});

it("select().from('user').where($in('first_name', 'Fred', 'Barney', 'Wilma'));", function() {
check(select().from('user').where($in('first_name', 'Fred', 'Barney', 'Wilma')), "SELECT * FROM user WHERE first_name IN ('Fred', 'Barney', 'Wilma')");
});

it("select().from('user').where($in('addr_id', select('id').from('address')));", function() {
select().from('user').where($in('first_name', 'Fred', 'Barney', 'Wilma'));
check(select().from('user').where($in('addr_id', select('id').from('address'))), "SELECT * FROM user WHERE addr_id IN (SELECT id FROM address)");
});

it("select().from('user').where(eqAny('user.id', select('user_id').from('address')));", function() {
check(select().from('user').where(eqAny('user.id', select('user_id').from('address'))), "SELECT * FROM user WHERE user.id = ANY (SELECT user_id FROM address)");
});

it("select().from('usr').join('addr', {'usr.addr_id': 'addr.id'});", function() {
sql.aliasExpansions({'usr': 'user', 'addr': 'address', 'zip': 'zipcode', 'psn': 'person'});

check(select().from('usr').join('addr', {'usr.addr_id': 'addr.id'}), "SELECT * FROM user usr INNER JOIN address addr ON usr.addr_id = addr.id");
});

it("select().from('user').join('address');", function() {
var alias_expansions = {'usr': 'user', 'addr': 'address', 'zip': 'zipcode', 'psn': 'person'};
var table_to_alias = _.invert(alias_expansions);
sql.joinCriteria(function(left_tbl, left_alias, right_tbl, right_alias) {
  var criteria = {};
  criteria[left_alias + '.' + table_to_alias[right_tbl] + '_id'] = right_alias + '.id';
  return criteria;
});

check(select().from('user').join('address'), "SELECT * FROM user INNER JOIN address ON user.addr_id = address.id");
});

it("select().from('usr').join('addr').join('zip');", function() {
check(select().from('usr').join('addr').join('zip'), "SELECT * FROM user usr INNER JOIN address addr ON usr.addr_id = addr.id INNER JOIN zipcode zip ON addr.zip_id = zip.id");
});

it("select().from('usr').join('addr', 'psn');", function() {
select().from('usr').join('addr').join('zip');

check(select().from('usr').join('addr', 'psn'), "SELECT * FROM user usr INNER JOIN address addr ON usr.addr_id = addr.id INNER JOIN person psn ON usr.psn_id = psn.id");
});

it("select().from('usr').join('psn', 'addr').join('zip');", function() {
check(select().from('usr').join('psn', 'addr').join('zip'), "SELECT * FROM user usr INNER JOIN person psn ON usr.psn_id = psn.id INNER JOIN address addr ON usr.addr_id = addr.id INNER JOIN zipcode zip ON addr.zip_id = zip.id");
});

it("sql.getView('activeUsers').clone().where({'usr.local': true})", function() {
sql.addView('activeUsers', select().from('usr').where({'usr.active': true}));

check(sql.getView('activeUsers').clone().where({'usr.local': true}), "SELECT * FROM user usr WHERE usr.active = true AND usr.local = true");
});

it("select('COUNT(*)').from('user').where({'access_level': 3});", function() {
check(select('COUNT(*)').from('user').where({'access_level': 3}), "SELECT COUNT(*) FROM user WHERE access_level = 3");
});

it("sql(\"CASE WHEN level=1 THEN 'one' WHEN level=2 THEN 'two' ELSE 'other' END\")});", function() {

check(select().from('user').where({'level_text':  sql("CASE WHEN level=1 THEN 'one' WHEN level=2 THEN 'two' ELSE 'other' END")}), "SELECT * FROM user WHERE level_text = CASE WHEN level=1 THEN 'one' WHEN level=2 THEN 'two' ELSE 'other' END");
});

it("select('COUNT(\"order\")').from('user');", function() {
check(select('COUNT("order")').from('user'), "SELECT COUNT(\"order\") FROM user");
});




  });
});

function check(actual, expected) {
  if (actual instanceof sql.Statement)
    assert.equal(actual.toString(), expected);
  else
    assert.deepEqual(actual, expected);
}

})();
