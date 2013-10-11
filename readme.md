# SQL Bricks.js

[![Build Status](https://travis-ci.org/CSNW/sql-bricks.png?branch=master)](https://travis-ci.org/CSNW/sql-bricks)

As with other SQL generation libraries, SQL Bricks was created to help eliminate DRY violations in SQL-heavy applications. SQL statements can be easily stored, cloned, modified and passed around to other parts of an application and they can generate both parameterized and non-parameterized SQL.

In addition, SQL Bricks contains a few conveniences to aid in re-use and to make SQL generation a little less of a chore: automatic quoting of columns that collide with keywords (`order`, `desc`, etc), automatic alias expansion, user-supplied join criteria functions and pseudo-views.

SQL Bricks differs from similar libraries in that it does not require a schema and it is designed to be transparent, matching SQL so faithfully that developers with SQL experience will immediately know the API.

SQL Bricks supports the four CRUD statements (`SELECT`, `UPDATE`, `INSERT`, `DELETE`) and all of their clauses as defined by [**SQL-92**](http://communities.progress.com/pcom/servlet/JiveServlet/download/11287-2-10624/s92.pdf) as well as some additional clauses supported by **Postgres** and **SQLite**. Adding support for other SQL statements (`CREATE`, `ALTER TABLE`, etc) would add clutter to the library without providing much real benefit.

## API

SQL Bricks mirrors SQL as faithfully as possible. SQL keywords are chainable camelCase methods and non-keywords are strings:

```javascript
update('user').set('first_name', 'Fred').set('last_name', 'Flintstone');
// UPDATE user SET first_name = 'Fred', last_name = 'Flintstone'
insertInto('user', 'first_name', 'last_name').values('Fred', 'Flintstone');
// INSERT INTO user (first_name, last_name) VALUES ('Fred', 'Flintstone')
select('*').from('user').innerJoin('address').on('user.addr_id', 'address.id');
// SELECT * FROM user INNER JOIN address ON user.addr_id = address.id
select('*').from('user').where('first_name', 'Fred');
// SELECT * FROM user WHERE first_name = 'Fred'
```

The SQL Bricks API also allows object literals everywhere they make sense for a more idiomatic API:

```javascript
update('user').set({'first_name': 'Fred', 'last_name': 'Flintstone'});
// UPDATE user SET first_name = 'Fred', last_name = 'Flintstone'
insertInto('user').values({'first_name': 'Fred', 'last_name': 'Flintstone'});
// INSERT INTO user (first_name, last_name) VALUES ('Fred', 'Flintstone')
select('*').from('user').join('address').on({'user.addr_id': 'address.id'});
// SELECT * FROM user INNER JOIN address ON user.addr_id = address.id
select('*').from('user').where({'first_name': 'Fred'});
// SELECT * FROM user WHERE first_name = 'Fred'
```

For added convenience, `select()` defaults to `'*'`, shorter one-word method aliases are provided and in cases where a pair of keywords always go together (`upset().set()`, `insert().values()`, `.join().on()`), the second keyword can be omitted, with the object literal passed as an additional argument to the first keyword:

```javascript
update('user', {'first_name': 'Fred', 'last_name': 'Flintstone'});
// UPDATE user SET first_name = 'Fred', last_name = 'Flintstone'
insert('user', {'first_name': 'Fred', 'last_name': 'Flintstone'});
// INSERT INTO user (first_name, last_name) VALUES ('Fred', 'Flintstone')
select().from('user').join('address', {'user.addr_id': 'address.id'});
// SELECT * FROM user INNER JOIN address ON user.addr_id = address.id
```

While it is possible to chain `WHERE` criteria at the top-level via repeated calls to `.where()` and `.and()`, method chaining cannot express nested `AND`, `OR` and `NOT` groupings. To handle this, SQL Bricks provides a set of nestable functions for building `WHERE` criteria: `and()`, `or()`, `not()`, `like()`, `in()`, `isNull()`, `isNotNull()`, `exists()`, `between()`, `eq()`, `lt()`, `lte()`, `gt()` and `gte()`. Object literals can also be used: `{name: 'Fred'}` renders as `name = 'Fred'` and multiple key/value pairs in an object literal are `AND`ed together:

```javascript
select('*').from('user').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'}));
// SELECT * FROM user WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'
select('*').from('user').where('last_name', 'Flintstone').and('first_name', 'Fred');
// SELECT * FROM user WHERE last_name = 'Flintstone' AND first_name = 'Fred'
select('*').from('user').where({'last_name': 'Flintstone', 'first_name': 'Fred'});
// SELECT * FROM user WHERE last_name = 'Flintstone' AND first_name = 'Fred'
```

## Cloning

To facilitate composition and re-use, statements can be cloned and clauses can be added in any order (if a `WHERE` clause already exists, the new one will be `AND`ed to it):

```javascript
var active_users = select('*').from('user').where({'active': true});
// SELECT * FROM user WHERE active = true
var local_users = active_users.clone().where({'local': true});
// SELECT * FROM user WHERE active = true AND local = true
```

## Pseudo-Views

For those databases where native views have performance issues (like SQLite), sql-bricks provides pseudo-views (see the "Subquery Flattening" section of [the SQLite Query Planner](http://www.sqlite.org/optoverview.html)).

The definition of a pseudo-view consists of a main table and, optionally, join tables and where criteria. Queries can then join to (and alias) this pseudo-view (the pseudo-view's join tables are prefixed with the view's alias) via `.joinView(view_name[, on, join_type])`:

```javascript
sql.addView('localUser',
  select().from('user')
    .join('address').on({'user.addr_id': 'address.id'})
    .where({'address.local': true})
);

select('*').from('person').joinView('localUser l_usr', {'person.usr_id': 'l_usr.id'});
// SELECT * FROM person
// INNER JOIN user l_usr ON person.usr_id = l_usr.id
// INNER JOIN address l_usr_address ON l_usr.addr_id = l_usr_address.id
// WHERE l_usr_address.local = true
```

## Automatic Alias Expansion

As a convenience, frequently-used aliases can be registered with SQL Bricks for automatic expansion via `aliasExpansions()`. These table aliases (`usr`, `addr`) can be used by themselves; SQL Bricks will automatically expand them to include the table name as well as the alias:

```javascript
sql.aliasExpansions({'usr': 'user', 'addr': 'address', 'zip': 'zipcode', 'psn': 'person'});

select().from('usr').join('addr', {'usr.addr_id': 'addr.id'});
// SELECT * FROM user usr INNER JOIN address addr ON usr.addr_id = addr.id
```

## User-Supplied Join Criteria Function

The user can supply a function to automatically generate the `.on()` criteria for joins whenever it is not supplied explicitly, via a `joinCriteria()` function:

```javascript
var alias_expansions = {'usr': 'user', 'addr': 'address', 'zip': 'zipcode', 'psn': 'person'};
var table_to_alias = _.invert(alias_expansions);
sql.joinCriteria = function(left_tbl, left_alias, right_tbl, right_alias) {
  var criteria = {};
  criteria[left_alias + '.' + table_to_alias[right_tbl] + '_id'] = right_alias + '.id';
  return criteria;
};

select().from('user').join('address');
// SELECT * FROM user INNER JOIN address ON user.addr_id = address.id
```

The "left table" passed to the join criteria generator function will always be the most recently used table -- either the most recently joined table or, if there is none, the main table in the statement. If you want to perform a "chain" of joins, where each table joins from the previous one, you can call `.join()` multiple times, but if you want to join from one table directly to a number of related tables, you can call `.join()` once and pass the table names in as separate arguments:

```javascript
select().from('usr').join('addr').join('zip');
// SELECT * FROM user usr
// INNER JOIN address addr ON usr.addr_id = addr.id
// INNER JOIN zipcode zip ON addr.zip_id = zip.id

select().from('usr').join('addr', 'psn');
// SELECT * FROM user usr
// INNER JOIN address addr ON usr.addr_id = addr.id
// INNER JOIN person psn ON usr.psn_id = psn.id
```

If multiple tables are passed to `.join()`, the last one is the most recently used one and it will be used as the basis for the next `.join()`:

```javascript
select().from('usr').join('psn', 'addr').join('zip');
// SELECT * FROM user usr
// INNER JOIN person psn ON usr.psn_id = psn.id
// INNER JOIN address addr ON usr.addr_id = addr.id
// INNER JOIN zipcode zip ON addr.zip_id = zip.id
```

Note that this scheme doesn't support complex JOIN table layouts: if you do something like `.join('psn', 'addr').join('zip')` above, it is impossible to also join something to the `'psn'` table. This *could* be achieved by adding a way to explicitly specify the table you're joining from: `.join('psn', 'addr').join('zip').join('psn->employer')`, but this hasn't been implemented.

## Parameterized SQL

Calling `.toParams()` (as opposed to `.toString()`) will return an object with a `text` property that contains `$1, $2, etc` placeholders in the SQL and a corresponding `values` array. Anything on the right-hand side of a `WHERE` criteria is assumed to be a value, as well as anything values passed into an `insert()` or `update()` statement:

```javascript
update('user').set('first_name', 'Fred').where('last_name', 'Flintstone').toParams();
// {"text": "UPDATE user SET first_name = $1 WHERE last_name = $2", "values": ["Fred", "Flintstone"]}

update('user', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams();
// {"text": "UPDATE user SET first_name = $1 WHERE last_name = $2", "values": ["Fred", "Flintstone"]}
```

At times, it is necessary to send SQL into SQL Bricks somewhere that a value is expected (the right-hand side of `WHERE` criteria, or `insert()`/`update()` values). This can be done by wrapping a string in the `sql()` function:

```javascript
select('*').from('user').where({'billing_addr_id': sql('mailing_addr_id')})
// SELECT * FROM user WHERE billing_addr_id = mailing_addr_id
```

For [node-sqlite3](https://github.com/developmentseed/node-sqlite3) style params (`?1`, `?2`), simply pass `{placeholder: '?'}` into `.toParams()`:

```javascript
update('user', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams({placeholder: '?'});
// {"text": "UPDATE user SET first_name = ?1 WHERE last_name = ?2", "values": ["Fred", "Flintstone"]}
```

## SQL Functions

There are 95 SQL functions defined in SQL-92, including `AVG()`, `COUNT()`, `MIN()`, `MAX()`, `SUM()`, `COALESCE()`, `CASE()`, `LTRIM()`, `RTRIM()`, `UPPER()`, `LOWER()`. These can be easily used in SQL Bricks anywhere that a sql string is expected, such as in a SELECT list:

```javascript
select('COUNT(*)').from('user').where({'access_level': 3});
// SELECT COUNT(*) FROM user WHERE access_level = 3
```

SQL functions can also be used anywhere a value is expected (in the values for an `INSERT` or `UPDATE` statement or in the right-hand side of a `WHERE` expression) via wrapping a string in the `sql()` function:

```javascript
select().from('user').where({'level_text': sql("CASE WHEN level=1 THEN 'one' WHEN level=2 THEN 'two' ELSE 'other' END")});
// SELECT * FROM user WHERE level_text = CASE WHEN level=1 THEN 'one' WHEN level=2 THEN 'two' ELSE 'other' END
```

Note that column names inside SQL functions that collide with SQL keywords will not be automatically escaped -- you have to do it manually, like this:

```javascript
select('COUNT("order")').from('user');
// SELECT COUNT("order") FROM user
```

## Contributing

Before sending a pull request, please verify that all the existing tests pass and add new tests for the changes you are making. The tests can be run via `npm test` (provided `npm install` has been run to install the dependencies). All of the examples in the documentation are run as tests, in addition to the tests in tests.js.

Note that **pull requests for additional SQL dialects** or extensions beyond Postgres and SQLite will probably not be merged. If you would like support for a different dialect, you are welcome to maintain a dialect-specific fork.

Also, **pull requests for additional SQL statements** beyond the four CRUD statements (`SELECT`, `UPDATE`, `INSERT`, `DELETE`) will probably not be merged. Other SQL statements do not benefit as much from re-use and composition; my goal is to keep SQL Bricks small, sharp and low-maintenance.

## Acknowledgements

Huge thanks to [Brian C](https://github.com/brianc) for his hard work supporting and maintaining [node-sql](https://github.com/brianc/node-sql) and [node-postgres](https://github.com/brianc/node-postgres) and especially for his patience with me and my pull requests.

## License

SQL Bricks is [MIT licensed](https://github.com/CSNW/sql-bricks/raw/master/LICENSE.md).
