(function() {

var is_common_js = typeof exports != 'undefined';
var _ = is_common_js ? require('underscore') : window._;
var sql = is_common_js ? require('../sql-bricks.js') : window.SqlBricks;

if (is_common_js) {
  var args = process.argv;
  if (args[args.length - 1] == '--empty-extension') {
    console.log('doctests configured with an empty extension');
    sql = sql._extension();
  }
}

var assert;
if (is_common_js) {
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

check(select().from('person')  .where(or({last_name: 'Rubble'}, $in('first_name', ['Fred', 'Wilma', 'Pebbles']))), "SELECT * FROM person WHERE last_name = 'Rubble' OR first_name IN ('Fred', 'Wilma', 'Pebbles')");
});

it("select('*').from('person').where({'billing_addr_id': sql('mailing_addr_id')})", function() {
check(select('*').from('person').where({'billing_addr_id': sql('mailing_addr_id')}), "SELECT * FROM person WHERE billing_addr_id = mailing_addr_id");
});

it("select().where(sql('field @> $ and field @> $', { key: 'value' }, { key: 'value2' })).toParams()", function() {
check(select().where(sql('field @> $ and field @> $', { key: 'value' }, { key: 'value2' })).toParams(), {"text": "SELECT * WHERE field @> $1 and field @> $2", "values": [{"key": "value"}, {"key": "value2"}]});
});

it("select().where({name: 'Fred'}).and(sql('f1 @> $2 and f2 @> $1', [{key: 'value' }, {key: 'value2'}])).toParams()", function() {
check(select().where({name: 'Fred'}).and(sql('f1 @> $2 and f2 @> $1', [{key: 'value' }, {key: 'value2'}])).toParams(), {"text": "SELECT * WHERE name = $1 AND f1 @> $3 and f2 @> $2", "values": ["Fred", {"key": "value"}, {"key": "value2"}]});
});

it("select().from('person').where(sql.val('Fred'), sql('first_name'));", function() {
check(select().from('person').where(sql.val('Fred'), sql('first_name')), "SELECT * FROM person WHERE 'Fred' = first_name");
});

it("active_persons;", function() {
var active_persons = select('*').from('person').where({'active': true});
check(active_persons, "SELECT * FROM person WHERE active = TRUE");
});

it("local_persons;", function() {
var active_persons = select('*').from('person').where({'active': true});
var local_persons = active_persons.clone().where({'local': true});
check(local_persons, "SELECT * FROM person WHERE active = TRUE AND local = TRUE");
});

it("update('person', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams();", function() {
check(update('person', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams(), {"text": "UPDATE person SET first_name = $1 WHERE last_name = $2", "values": ["Fred", "Flintstone"]});
});

it("update('person', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams({placeholder: '?%d'});", function() {
check(update('person', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams({placeholder: '?%d'}), {"text": "UPDATE person SET first_name = ?1 WHERE last_name = ?2", "values": ["Fred", "Flintstone"]});
});

it("update('person', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams({placeholder: '?'});", function() {
check(update('person', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams({placeholder: '?'}), {"text": "UPDATE person SET first_name = ? WHERE last_name = ?", "values": ["Fred", "Flintstone"]});
});

it("select().from('person').join('address', {'person.addr_id': 'address.id'});", function() {
check(select().from('person').join('address', {'person.addr_id': 'address.id'}), "SELECT * FROM person INNER JOIN address ON person.addr_id = address.id");
});

it("select('*').from('person').innerJoin('address').on('person.addr_id', 'address.id');", function() {
check(select('*').from('person').innerJoin('address').on('person.addr_id', 'address.id'), "SELECT * FROM person INNER JOIN address ON person.addr_id = address.id");
});

it("select('*').from('person').join('address').on({'person.addr_id': 'address.id'});", function() {
select('*').from('person').innerJoin('address').on('person.addr_id', 'address.id');

check(select('*').from('person').join('address').on({'person.addr_id': 'address.id'}), "SELECT * FROM person INNER JOIN address ON person.addr_id = address.id");
});

it("select('*').from('person').innerJoin('address').using('address_id');", function() {
check(select('*').from('person').innerJoin('address').using('address_id'), "SELECT * FROM person INNER JOIN address USING (address_id)");
});

it("select('*').from('person').join('address').using('address_id', 'country_id');", function() {
select('*').from('person').innerJoin('address').using('address_id');

check(select('*').from('person').join('address').using('address_id', 'country_id'), "SELECT * FROM person INNER JOIN address USING (address_id, country_id)");
});

it("select('*').from('person').join('address').using('address_id, country_id');", function() {
select('*').from('person').innerJoin('address').using('address_id');

select('*').from('person').join('address').using('address_id', 'country_id');

check(select('*').from('person').join('address').using('address_id, country_id'), "SELECT * FROM person INNER JOIN address USING (address_id, country_id)");
});

it("select('*').from('person').join('address').using(['address_id', 'country_id']);", function() {
select('*').from('person').innerJoin('address').using('address_id');

select('*').from('person').join('address').using('address_id', 'country_id');

select('*').from('person').join('address').using('address_id, country_id');

check(select('*').from('person').join('address').using(['address_id', 'country_id']), "SELECT * FROM person INNER JOIN address USING (address_id, country_id)");
});

it("select('*').from('person').join('address', ['address_id', 'country_id']);", function() {
check(select('*').from('person').join('address', ['address_id', 'country_id']), "SELECT * FROM person INNER JOIN address USING (address_id, country_id)");
});

it("select().from('person').naturalJoin('address');", function() {
check(select().from('person').naturalJoin('address'), "SELECT * FROM person NATURAL INNER JOIN address");
});

it("select('*').from('person').where('first_name', 'Fred');", function() {
check(select('*').from('person').where('first_name', 'Fred'), "SELECT * FROM person WHERE first_name = 'Fred'");
});

it("select('*').from('person').where('last_name', 'Flintstone').and('first_name', 'Fred');", function() {
select('*').from('person').where('first_name', 'Fred');

check(select('*').from('person').where('last_name', 'Flintstone').and('first_name', 'Fred'), "SELECT * FROM person WHERE last_name = 'Flintstone' AND first_name = 'Fred'");
});

it("select('*').from('person').where({'last_name': 'Flintstone', 'first_name': 'Fred'});", function() {
check(select('*').from('person').where({'last_name': 'Flintstone', 'first_name': 'Fred'}), "SELECT * FROM person WHERE last_name = 'Flintstone' AND first_name = 'Fred'");
});

it("select('*').from('person').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'}));", function() {
check(select('*').from('person').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'})), "SELECT * FROM person WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'");
});

it(".groupBy('city').having(lt('max(temp_lo)', 40))", function() {

check(select('city', 'max(temp_lo)').from('weather')  .groupBy('city').having(lt('max(temp_lo)', 40)), "SELECT city, max(temp_lo) FROM weather GROUP BY city HAVING max(temp_lo) < 40");
});

it(".select().from('person').where({'last_name': 'Rubble'});", function() {

check(select().from('person').where({'last_name': 'Flintstone'}).union()  .select().from('person').where({'last_name': 'Rubble'}), "SELECT * FROM person WHERE last_name = 'Flintstone' UNION SELECT * FROM person WHERE last_name = 'Rubble'");
});

it("select('addr_id').from('person').forUpdate().of('addr_id').noWait();", function() {
check(select('addr_id').from('person').forUpdate().of('addr_id').noWait(), "SELECT addr_id FROM person FOR UPDATE OF addr_id NO WAIT");
});

it("insert('person', {'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
check(insert('person', {'first_name': 'Fred', 'last_name': 'Flintstone'}), "INSERT INTO person (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("insertInto('person', 'first_name', 'last_name').values('Fred', 'Flintstone');", function() {
check(insertInto('person', 'first_name', 'last_name').values('Fred', 'Flintstone'), "INSERT INTO person (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("insertInto('person', 'first_name', 'last_name').values('Fred', 'Flintstone');", function() {
check(insertInto('person', 'first_name', 'last_name').values('Fred', 'Flintstone'), "INSERT INTO person (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("insertInto('person').values({'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
insertInto('person', 'first_name', 'last_name').values('Fred', 'Flintstone');

check(insertInto('person').values({'first_name': 'Fred', 'last_name': 'Flintstone'}), "INSERT INTO person (first_name, last_name) VALUES ('Fred', 'Flintstone')");
});

it("insertInto('person', 'first_name', 'last_name').values([['Fred', 'Flintstone'], ['Wilma', 'Flintstone']]);", function() {
check(insertInto('person', 'first_name', 'last_name').values([['Fred', 'Flintstone'], ['Wilma', 'Flintstone']]), "INSERT INTO person (first_name, last_name) VALUES ('Fred', 'Flintstone'), ('Wilma', 'Flintstone')");
});

it("insertInto('person').values([{'first_name': 'Fred', 'last_name': 'Flintstone'}, {'first_name': 'Wilma', 'last_name': 'Flintstone'}]);", function() {
insertInto('person', 'first_name', 'last_name').values([['Fred', 'Flintstone'], ['Wilma', 'Flintstone']]);

check(insertInto('person').values([{'first_name': 'Fred', 'last_name': 'Flintstone'}, {'first_name': 'Wilma', 'last_name': 'Flintstone'}]), "INSERT INTO person (first_name, last_name) VALUES ('Fred', 'Flintstone'), ('Wilma', 'Flintstone')");
});

it("update('person', {'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
check(update('person', {'first_name': 'Fred', 'last_name': 'Flintstone'}), "UPDATE person SET first_name = 'Fred', last_name = 'Flintstone'");
});

it("update('person').set('first_name', 'Fred').set('last_name', 'Flintstone');", function() {
check(update('person').set('first_name', 'Fred').set('last_name', 'Flintstone'), "UPDATE person SET first_name = 'Fred', last_name = 'Flintstone'");
});

it("update('person').set({'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
update('person').set('first_name', 'Fred').set('last_name', 'Flintstone');

check(update('person').set({'first_name': 'Fred', 'last_name': 'Flintstone'}), "UPDATE person SET first_name = 'Fred', last_name = 'Flintstone'");
});

it("select().from('person').where({'first_name': 'Fred', 'last_name': 'Flintstone'});", function() {
check(select().from('person').where({'first_name': 'Fred', 'last_name': 'Flintstone'}), "SELECT * FROM person WHERE first_name = 'Fred' AND last_name = 'Flintstone'");
});

it("select().from('person').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'}));", function() {
check(select().from('person').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'})), "SELECT * FROM person WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'");
});

it("select().from('person').where(or({'first_name': 'Fred', 'last_name': 'Rubble'}));", function() {
check(select().from('person').where(or({'first_name': 'Fred', 'last_name': 'Rubble'})), "SELECT * FROM person WHERE first_name = 'Fred' OR last_name = 'Rubble'");
});

it("select().from('person').where(not($in('name', ['Fred', 'Barney', 'Wilma', 'Pebbles'])));", function() {
check(select().from('person').where(not($in('name', ['Fred', 'Barney', 'Wilma', 'Pebbles']))), "SELECT * FROM person WHERE NOT name IN ('Fred', 'Barney', 'Wilma', 'Pebbles')");
});

it("select().from('person').where(gt('access', 5));", function() {
check(select().from('person').where(gt('access', 5)), "SELECT * FROM person WHERE access > 5");
});

it("select().from('person').where(between('access', 1, 5));", function() {
check(select().from('person').where(between('access', 1, 5)), "SELECT * FROM person WHERE access BETWEEN 1 AND 5");
});

it("select().from('person').where(isNull('name'));", function() {
check(select().from('person').where(isNull('name')), "SELECT * FROM person WHERE name IS NULL");
});

it("select('*').from('person').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'}));", function() {
check(select('*').from('person').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'})), "SELECT * FROM person WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'");
});

it("select().from('address').where({'address.id': sql('person.addr_id')})));", function() {

check(select().from('person').where(exists(  select().from('address').where({'address.id': sql('person.addr_id')}))), "SELECT * FROM person WHERE EXISTS (SELECT * FROM address WHERE address.id = person.addr_id)");
});

it("select().from('person').where($in('first_name', 'Fred', 'Barney', 'Wilma'));", function() {
check(select().from('person').where($in('first_name', 'Fred', 'Barney', 'Wilma')), "SELECT * FROM person WHERE first_name IN ('Fred', 'Barney', 'Wilma')");
});

it("select().from('person').where($in('addr_id', select('id').from('address')));", function() {
select().from('person').where($in('first_name', 'Fred', 'Barney', 'Wilma'));
check(select().from('person').where($in('addr_id', select('id').from('address'))), "SELECT * FROM person WHERE addr_id IN (SELECT id FROM address)");
});

it("select().from('person').where(eqAny('person.id', select('person_id').from('address')));", function() {
check(select().from('person').where(eqAny('person.id', select('person_id').from('address'))), "SELECT * FROM person WHERE person.id = ANY (SELECT person_id FROM address)");
});

it("select().from('psn').join('addr', {'psn.addr_id': 'addr.id'});", function() {
sql.aliasExpansions({'psn': 'person', 'addr': 'address', 'zip': 'zipcode', 'usr': 'user'});

check(select().from('psn').join('addr', {'psn.addr_id': 'addr.id'}), "SELECT * FROM person psn INNER JOIN address addr ON psn.addr_id = addr.id");
});

it("select().from('person').join('address');", function() {
var alias_expansions = {'psn': 'person', 'addr': 'address', 'zip': 'zipcode', 'usr': 'user'};
var table_to_alias = _.invert(alias_expansions);
sql.joinCriteria(function(left_tbl, left_alias, right_tbl, right_alias) {
  var criteria = {};
  criteria[left_alias + '.' + table_to_alias[right_tbl] + '_id'] = right_alias + '.id';
  return criteria;
});

check(select().from('person').join('address'), "SELECT * FROM person INNER JOIN address ON person.addr_id = address.id");
});

it("select().from('psn').join('addr').join('zip');", function() {
check(select().from('psn').join('addr').join('zip'), "SELECT * FROM person psn INNER JOIN address addr ON psn.addr_id = addr.id INNER JOIN zipcode zip ON addr.zip_id = zip.id");
});

it("select().from('psn').join('addr', 'usr');", function() {
select().from('psn').join('addr').join('zip');

check(select().from('psn').join('addr', 'usr'), "SELECT * FROM person psn INNER JOIN address addr ON psn.addr_id = addr.id INNER JOIN \"user\" usr ON psn.usr_id = usr.id");
});

it("select().from('psn').join('usr', 'addr').join('zip');", function() {
check(select().from('psn').join('usr', 'addr').join('zip'), "SELECT * FROM person psn INNER JOIN \"user\" usr ON psn.usr_id = usr.id INNER JOIN address addr ON psn.addr_id = addr.id INNER JOIN zipcode zip ON addr.zip_id = zip.id");
});

it("select('COUNT(*)').from('person').where({'access_level': 3});", function() {
check(select('COUNT(*)').from('person').where({'access_level': 3}), "SELECT COUNT(*) FROM person WHERE access_level = 3");
});

it("sql(\"CASE WHEN level=1 THEN 'one' WHEN level=2 THEN 'two' ELSE 'other' END\")});", function() {

check(select().from('person').where({'level_text':  sql("CASE WHEN level=1 THEN 'one' WHEN level=2 THEN 'two' ELSE 'other' END")}), "SELECT * FROM person WHERE level_text = CASE WHEN level=1 THEN 'one' WHEN level=2 THEN 'two' ELSE 'other' END");
});

it("select('COUNT(\"order\")').from('person');", function() {
check(select('COUNT("order")').from('person'), "SELECT COUNT(\"order\") FROM person");
});

it("select('person.name AS personname').from('person');", function() {
check(select('person.name AS personname').from('person'), "SELECT person.name AS personname FROM person");
});

it("select('person.order AS person_order').from('person');", function() {
check(select('person.order AS person_order').from('person'), "SELECT person.\"order\" AS person_order FROM person");
});




  });
});

function check(actual, expected) {
  if (_.isObject(actual) && _.isString(expected))
    assert.equal(actual.toString(), expected);
  else
    assert.deepEqual(actual, expected);
}

})();
