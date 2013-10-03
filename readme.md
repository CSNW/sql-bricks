# SQL Bricks.js

SQL is a complicated, expressive DSL. SQL Bricks is not an abstraction layer and makes no attempt to hide the user from SQL syntax. On the contrary, it is designed to match SQL as faithfully as possible so that the experienced SQL user is immediately familiar with the API. Our goal is to make it fully comprehensive, so that it supports all possible variations on the four supported SQL statements (`SELECT, INSERT, UPDATE, DELETE`).

SQL Bricks provides easy parameter substitution, automatic quoting of columns that collide with SQL keywords ("order", "desc", etc), a nice chainable syntax, a few conveniences (support for user-supplied abbreviations and auto-generated join criteria) and, most importantly, **easy composition and re-use of SQL**.

### Composable

The primary goal of SQL Bricks is to enable the elimination of DRY in SQL-heavy applications by allowing easy composition and modification of SQL statements, like building blocks. To enable this, statements can be cloned and clauses can be added in any order (if a `WHERE` clause already exists, the new one will be `AND`ed to it):

```javascript
var stmt = select('*').from('user');
stmt.orderBy('last_name');
stmt.where({'first_name': 'Fred'});
stmt.where({'active': true});
// SELECT * FROM user WHERE first_name = 'Fred' AND active = true ORDER BY last_name
```

### Zero Configuration

SQL Bricks doesn't use or require a schema (though you can provide a set of table abbreviations for convenience, see below).

### Matches the SQL Language

SQL Bricks doesn't introduce a new, complex API: the API was designed to be easily guessable for those who already know SQL. SQL keywords are chainable camelCase methods, non-keywords are passed in as strings and `WHERE`/`JOIN` criteria can be expressed with literal objects:

```javascript
select('*').from('user').innerJoin('address').on({'user.addr_id': 'address.id'});
// SELECT * FROM user INNER JOIN address ON user.addr_id = address.id
```

Since method chaining cannot express nested AND/OR groupings, SQL Bricks uses nestable functions for `WHERE` criteria (`and(), or(), not(), like(), in(), isNull(), isNotNull(), eq(), lt(), lte(), etc`):

```javascript
select('*').from('user').where(or(like('last_name', 'Flint%'), {'first_name': 'Fred'}));
// SELECT * FROM user WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'
```

For convenience, `.and()` can be chained (since it is unambiguous), and multiple criteria can also be passed via an object literal to `.where()`:

```javascript
select('*').from('user').where('last_name', 'Flintstone').and('first_name', 'Fred');
// SELECT * FROM user WHERE last_name = 'Flintstone' AND first_name = 'Fred'
select('*').from('user').where({'last_name': 'Flintstone', 'first_name': 'Fred'});
// SELECT * FROM user WHERE last_name = 'Flintstone' AND first_name = 'Fred'
```

### Conveniences for a Higher Signal/Noise Ratio

* short aliases are provided for multi-word method names (`.join()`, `.group()`, `.order()`, etc)
* `select()` with no arguments defaults to `'*'`
* `.on()` criteria can be passed as a second argument to `.join()`
* `.on()` criteria can be auto-generated via a `joinCriteria()` helper function
* frequently-used table abbreviations can be set via `setAbbrs()`

```javascript
sql.setAbbrs({'usr': 'user', 'addr': 'address', 'zip': 'zipcode'});
sql.joinCriteria = function(left_tbl, left_alias, right_tbl, right_alias) {
  var criteria = {};
  criteria[left_alias + '.' + sql.getAbbr(right_tbl) + '_id'] = right_alias + '.id';
  return criteria;
};

select().from('usr').join('addr');
// SELECT * FROM user usr INNER JOIN address addr ON usr.addr_id = addr.id
```

The auto-generated join criteria assumes that the "left table" you're joining from is the most recently used table -- either from the most recent join() -- if there is none -- the main table in the statement. So if you want to perform a "chain" of joins, where each table joins from the previous one, you can call `.join()` multiple times, but if you want to join from one table to a number of related tables, you can call `.join()` once and pass multiple table names in as separate arguments:

```javascript
// chaining joins from one table to the next
select().from('user').join('address').join('zip');
// SELECT * FROM user usr
// INNER JOIN address addr ON usr.addr_id = addr.id
// INNER JOIN zipcode zip ON addr.zip_id = zip.id

// joining from one table to multiple tables
select().from('usr').join('addr', 'psn');
// SELECT * FROM user usr
// INNER JOIN address addr ON usr.addr_id = addr.id
// INNER JOIN person psn ON usr.psn_id = psn.id
```

If you chain from a join with multiple tables, it will join to the last table in the list:

```javascript
// joining from one table to multiple tables
select().from('usr').join('psn', 'addr').join('zip');
// SELECT * FROM user usr
// INNER JOIN person psn ON usr.psn_id = psn.id
// INNER JOIN address addr ON usr.addr_id = addr.id
// INNER JOIN zipcode zip ON addr.zip_id = zip.id
```

Note that this scheme doesn't support doesn't support complex JOIN table layouts: if you do something like `.join('psn', 'addr').join('zip')` above, it is impossible to also join something to the `'psn'` table. This *could* be achieved by adding a way to explicitly specify the table you're joining from: `.join('psn', 'addr').join('zip').join('psn->employer')`, but this hasn't been implemented yet.

### Pseudo-Views

Another way that SQL Bricks allows re-use is through pseudo-views. This isn't as helpful for Postgres, where native views are fast, but it is helpful for MySQL and SQLite, where views can introduce performance problems (unless they can be flattened, see the "Subquery Flattening" section of [the SQLite Query Planner](http://www.sqlite.org/optoverview.html)).

SQL Bricks allows the definition of a pseudo-view, consisting of a main table, optional join tables and optional where criteria. Queries can then join to (and alias) this pseudo-view (the pseudo-view's join tables are prefixed with the view's alias):

```javascript
sql.defineView('localUser', 'user')
  .join('address').on({'user.addr_id': 'address.id'})
  .where({'address.local': true});

select('*').from('person')
  .join('localUser l_usr').on({'person.usr_id': 'user.id'});
// SELECT * FROM person
// INNER JOIN user l_usr ON person.usr_id = l_usr.id
// INNER JOIN address l_usr_address ON l_usr.addr_id = l_usr_address.id
// WHERE l_usr_address.local = true
```

### Parameterized SQL

Calling `.toParams()` (as opposed to `.toString()`) will return an object with a `text` property that contains `$1, $2, etc` placeholders in the SQL and a corresponding `values` array. Anything on the right-hand side of a `WHERE` criteria is assumed to be a value, as well as anything values passed into an `insert()` or `update()` statement:

```javascript
update('user').set('first_name', 'Fred').where('last_name', 'Flintstone').toParams();
// {'text': 'UPDATE user SET first_name = $1 WHERE last_name = $2, 'values': ['Fred', 'Flintstone']}

// alternate syntax
update('user', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams();
// {'text': 'UPDATE user SET first_name = $1 WHERE last_name = $2, 'values': ['Fred', 'Flintstone']}
```

## To-Do

Add support for:

* .into()
* .join().on() syntax
* .using()
* .leftJoin / .rightJoin / .fullJoin / .crossJoin
* .union() / .intersect() / .except()
* .limit() / .offset()
* .fetch()
* .forUpdate() / .forShare()
* Allow more reuse by supporting .join()s for `UPDATE` and `DELETE` statements, implemented via `WHERE` criteria and placing the table name in the `FROM` and the `USING` clause, respectively.
* querying directly off of a pseudo-view: `select().from(viewName)`
* cloning statements
* SQLite dialect (server-side and client-side examples)
* old browsers (via polyfills)
* passing non-values into the right-hand side of `WHERE` criteria and into `INSERT/UPDATE` statements (via `sql('tbl.col')`?)

## Contributions

The tests can be run via `npm test` (provided `npm install` has been run to install the dependencies).

## Acknowledgements

Huge thanks to [Brian C](https://github.com/brianc) for his work on the [node-sql](https://github.com/brianc/node-sql) library, his patience with me as I hacked on it and his encouragement when I pitched the idea for an alternative approach to SQL generation.

## License

SQL Bricks is [MIT licensed](https://github.com/CSNW/sql-bricks/raw/master/LICENSE.md).
